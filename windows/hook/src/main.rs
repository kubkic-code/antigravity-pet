//! coucou-hook — the relay Claude Code runs on every hook event.
//!
//! Reads the hook JSON on stdin, adds a little terminal context, and hands it to
//! Coucou over the named pipe `\\.\pipe\coucou-<sid>`.
//!
//! Hard rule (docs/CLAUDE.md): **never block Claude Code.**
//! * If the pipe does not exist — Coucou is closed — we exit 0 immediately with
//!   nothing on stdout, and the session carries on untouched.
//! * Every step runs under a deadline enforced by the main thread, so a pipe that
//!   accepts the connection and then stops reading cannot wedge the session
//!   either: we abandon the worker and exit.
//! * Only `PermissionRequest` waits for an answer, because approving from the
//!   island is the whole point. No answer means empty stdout, and Claude Code
//!   asks in the terminal exactly as if Coucou were not installed.
//!
//! Usage: `coucou-hook <EventName>` (the name is also read from the JSON).

use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// Budget for getting a pipe connection. Beyond this Claude Code wins, always.
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
/// Whole-run budget for an event nobody waits on: connect and write, no more.
const FIRE_AND_FORGET_BUDGET: Duration = Duration::from_secs(2);
/// How long a permission prompt may stay on screen before the terminal takes over.
const DECISION_BUDGET: Duration = Duration::from_secs(110);

/// `ERROR_PIPE_BUSY` — every instance is serving someone else right now. This is
/// the one error worth retrying: the server exists and a slot will free up.
const ERROR_PIPE_BUSY: i32 = 231;

/// Fields that are pointless to forward and can be enormous (a whole file read,
/// a full command output). The island never shows them.
const DROPPED_FIELDS: &[&str] = &["tool_response", "transcript_path", "transcriptPath"];
/// Longest string forwarded for any single field; the island truncates to far
/// less than this anyway.
const MAX_FIELD_LEN: usize = 4_000;

mod win;

/// Reads the last response produced by the model from transcript.jsonl.
/// Reads from the tail of the file for instant, sub-millisecond extraction.
fn extract_latest_agent_message(path: &str) -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut file = std::fs::File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    let file_len = meta.len();
    if file_len == 0 {
        return None;
    }

    // Read up to the last 512 KB of the transcript file
    let read_size = file_len.min(512 * 1024) as usize;
    let offset = file_len - (read_size as u64);
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return None;
    }

    let mut buf = vec![0u8; read_size];
    if file.read_exact(&mut buf).is_err() {
        return None;
    }

    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<&str> = text.lines().collect();
    // Drop the first line if we seeked from a non-zero offset, as it may be truncated
    if offset > 0 && !lines.is_empty() {
        lines.remove(0);
    }

    // Inspect in reverse: latest lines first
    for line in lines.into_iter().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            let is_user_input = val.get("type").and_then(|v| v.as_str()) == Some("USER_INPUT");
            if is_user_input {
                // We reached the prompt boundary of the latest turn; stop to prevent leaking previous turns
                break;
            }

            let is_model = val
                .get("source")
                .and_then(|v| v.as_str())
                .map(|s| s == "MODEL")
                .unwrap_or(false);
            let is_planner = val
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| s == "PLANNER_RESPONSE")
                .unwrap_or(false);
            if is_model && is_planner {
                if let Some(content) = val.get("content").and_then(|v| v.as_str()) {
                    let mut trimmed = content.trim();
                    // Strip internal <think>...</think> reasoning blocks if present
                    if let Some(end_idx) = trimmed.find("</think>") {
                        trimmed = trimmed[end_idx + 8..].trim();
                    }
                    if let Some(end_idx) = trimmed.find("</thought>") {
                        trimmed = trimmed[end_idx + 10..].trim();
                    }
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                } else if let Some(tool_calls) = val.get("tool_calls").and_then(|v| v.as_array()) {
                    for tc in tool_calls {
                        if tc.get("name").and_then(|v| v.as_str()) == Some("ask_question") {
                            if let Some(args) = tc.get("args") {
                                let q_text = args.get("questions").and_then(|q| {
                                    if let Some(arr) = q.as_array() {
                                        arr.first().and_then(|f| f.get("question")).and_then(|s| s.as_str()).map(str::to_string)
                                    } else if let Some(s) = q.as_str() {
                                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(s) {
                                            parsed.as_array().and_then(|arr| arr.first()).and_then(|f| f.get("question")).and_then(|sq| sq.as_str()).map(str::to_string)
                                        } else {
                                            None
                                        }
                                    } else {
                                        None
                                    }
                                });
                                if let Some(q) = q_text {
                                    return Some(format!("❓ {q}"));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Fallback: Find the most recently modified transcript.jsonl across all brain conversation dirs
fn find_latest_transcript(brain_dir: &std::path::Path) -> Option<String> {
    let mut latest_path = None;
    let mut latest_time = std::time::SystemTime::UNIX_EPOCH;

    let entries = std::fs::read_dir(brain_dir).ok()?;
    for entry in entries.flatten() {
        let candidate = entry
            .path()
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl");
        if let Ok(meta) = candidate.metadata() {
            if let Ok(modified) = meta.modified() {
                if modified > latest_time {
                    latest_time = modified;
                    latest_path = Some(candidate.to_string_lossy().to_string());
                }
            }
        }
    }
    latest_path
}

/// `\\.\pipe\coucou-<sid>`. The SID keeps two accounts on the same machine from
/// ever meeting on the same pipe; the name falls back to the user name only if
/// the SID cannot be read at all, which should not happen.
fn pipe_path() -> String {
    let key = win::current_user_sid()
        .unwrap_or_else(|| std::env::var("USERNAME").unwrap_or_else(|_| "user".into()));
    format!(r"\\.\pipe\coucou-{key}")
}

/// Opens the pipe. Retries only while the server is busy: any other error means
/// there is nothing to talk to, and waiting would only delay Claude Code.
fn connect() -> Option<std::fs::File> {
    use std::os::windows::io::AsRawHandle;
    let path = pipe_path();
    let deadline = Instant::now() + CONNECT_TIMEOUT;
    loop {
        match std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            Ok(file) => {
                let handle = windows::Win32::Foundation::HANDLE(file.as_raw_handle());
                return win::pipe_server_is_same_user(handle).then_some(file);
            }
            Err(err) => {
                if err.raw_os_error() != Some(ERROR_PIPE_BUSY) || Instant::now() >= deadline {
                    return None;
                }
                std::thread::sleep(Duration::from_millis(15));
            }
        }
    }
}

fn check_is_antigravity() -> bool {
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        if arg == "--agent" {
            let val = it.next().unwrap_or_default();
            return val == "antigravity";
        }
    }
    // Default agent is antigravity
    true
}

fn main() {
    let is_antigravity = check_is_antigravity();
    let Some((payload, event, _)) = read_event() else {
        if is_antigravity {
            println!("{{}}");
        }
        std::process::exit(0);
    };

    let waits_for_answer = event == "PermissionRequest";
    let budget = if waits_for_answer { DECISION_BUDGET } else { FIRE_AND_FORGET_BUDGET };

    let (tx, rx) = mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        let _ = tx.send(talk(&payload, waits_for_answer));
    });

    if let Ok(Some(decision)) = rx.recv_timeout(budget) {
        if let Some(json) = decision_json(&decision) {
            let mut out = std::io::stdout();
            let _ = writeln!(out, "{json}");
            let _ = out.flush();
            std::process::exit(0);
        }
    }

    // Antigravity expects valid JSON response on stdout:
    if is_antigravity {
        let mut out = std::io::stdout();
        if event == "PreToolUse" {
            let _ = writeln!(out, r#"{{"decision":"allow"}}"#);
        } else {
            let _ = writeln!(out, "{{}}");
        }
        let _ = out.flush();
    }

    std::process::exit(0);
}

/// The documented PermissionRequest output. Anything we do not recognise prints
/// nothing at all rather than guessing — silence is the safe answer.
fn decision_json(decision: &str) -> Option<String> {
    let behavior = match decision.trim() {
        "allow" | "always" => r#"{"behavior":"allow"}"#.to_string(),
        "deny" => r#"{"behavior":"deny","message":"Denied from Coucou"}"#.to_string(),
        _ => return None,
    };
    Some(format!(
        r#"{{"hookSpecificOutput":{{"hookEventName":"PermissionRequest","decision":{behavior}}}}}"#
    ))
}

/// Reads stdin and returns the payload to forward plus the event name and whether it is Antigravity.
fn read_event() -> Option<(String, String, bool)> {
    let mut raw = Vec::new();
    if std::io::stdin().read_to_end(&mut raw).is_err() || raw.is_empty() {
        return None;
    }
    // Some shells hand us a UTF-8 BOM; serde_json would choke on it.
    if raw.starts_with(&[0xEF, 0xBB, 0xBF]) {
        raw.drain(..3);
    }

    let mut payload = serde_json::from_slice::<serde_json::Value>(&raw).ok()?;
    let map = payload.as_object_mut()?;

    // Parse argv: "coucou-hook.exe [--agent <name>] [<EventName>]"
    let mut agent = String::new();
    let mut arg_event = String::new();
    {
        let mut it = std::env::args().skip(1);
        while let Some(arg) = it.next() {
            if arg == "--agent" {
                agent = it.next().unwrap_or_default();
            } else if arg_event.is_empty() {
                arg_event = arg;
            }
        }
    }

    // Default to antigravity if no agent specified
    if agent.is_empty() {
        agent = "antigravity".into();
    }
    map.insert("coucou_agent".into(), serde_json::Value::String(agent.clone()));

    let is_antigravity = agent == "antigravity";

    if is_antigravity {
        // Map conversationId -> session_id
        if !map.contains_key("session_id") {
            if let Some(cid) = map.get("conversationId").or_else(|| map.get("conversation_id")).cloned() {
                map.insert("session_id".into(), cid);
            }
        }
        // Map toolCall -> tool_name and tool_input
        if let Some(tool_call) = map.get("toolCall").and_then(|v| v.as_object()).cloned() {
            if let Some(name) = tool_call.get("name") {
                map.insert("tool_name".into(), name.clone());
            }
            if let Some(args) = tool_call.get("args") {
                map.insert("tool_input".into(), args.clone());
            }
        }
    }

    let transcript_path = map
        .get("transcriptPath")
        .or_else(|| map.get("transcript_path"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .or_else(|| {
            let user_profile = std::env::var("USERPROFILE").ok()?;
            let brain_dir = std::path::PathBuf::from(user_profile)
                .join(".gemini")
                .join("antigravity-ide")
                .join("brain");

            let cid = map
                .get("conversationId")
                .or_else(|| map.get("conversation_id"))
                .and_then(|v| v.as_str());

            if let Some(c) = cid {
                let candidate = brain_dir
                    .join(c)
                    .join(".system_generated")
                    .join("logs")
                    .join("transcript.jsonl");
                if candidate.exists() {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }

            // Fallback: automatically locate the active conversation transcript
            find_latest_transcript(&brain_dir)
        });

    if is_antigravity && !map.contains_key("session_id") {
        if let Some(ref path) = transcript_path {
            let p = std::path::Path::new(path);
            if let Some(parent) = p.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
                if let Some(name) = parent.file_name().and_then(|n| n.to_str()) {
                    map.insert("session_id".into(), serde_json::Value::String(name.to_string()));
                }
            }
        }
    }

    let raw_event = map
        .get("hook_event_name")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or(arg_event);

    // If invocation finished or agent stopped, extract the agent's text response from transcript
    if raw_event == "PostInvocation" || raw_event == "Stop" {
        if !map.contains_key("message") {
            if let Some(ref path) = transcript_path {
                for attempt in 0..4 {
                    if let Some(msg) = extract_latest_agent_message(path) {
                        map.insert("message".into(), serde_json::Value::String(msg));
                        break;
                    }
                    if attempt < 3 {
                        std::thread::sleep(Duration::from_millis(60));
                    }
                }
            }
        }
    }

    // Normalize Antigravity events to canonical event names
    let event = match raw_event.as_str() {
        "PreInvocation" => "UserPromptSubmit".to_string(),
        "PostInvocation" => "Stop".to_string(),
        "Stop" => "Stop".to_string(),
        e => e.to_string(),
    };
    map.insert("hook_event_name".into(), serde_json::Value::String(event.clone()));

    for field in DROPPED_FIELDS {
        map.remove(*field);
    }

    let cwd_missing = map
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(str::is_empty)
        .unwrap_or(true);
    if cwd_missing {
        if let Ok(cwd) = std::env::current_dir() {
            map.insert(
                "cwd".into(),
                serde_json::Value::String(cwd.to_string_lossy().to_string()),
            );
        }
    }

    // Which terminal the session runs in. Unlike macOS, Coucou on Windows accepts
    // events from every terminal, so this is context only — never a filter.
    for (key, var) in [
        ("term_program", "TERM_PROGRAM"),
        ("wt_session", "WT_SESSION"),
        ("term_session_id", "TERM_SESSION_ID"),
        ("vscode_pid", "VSCODE_PID"),
        ("session_pid", "CLAUDE_CODE_SSE_PORT"),
    ] {
        if !map.contains_key(key) {
            let value = std::env::var(var).unwrap_or_default();
            map.insert(key.into(), serde_json::Value::String(value));
        }
    }

    truncate_strings(&mut payload);

    let mut line = payload.to_string();
    line.push('\n');
    Some((line, event, is_antigravity))
}

/// Caps every string in the payload. A single Write can carry a whole file.
fn truncate_strings(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::String(s) => {
            if s.len() > MAX_FIELD_LEN {
                // Cut on a char boundary; a lone byte index can split UTF-8.
                let mut end = MAX_FIELD_LEN;
                while end > 0 && !s.is_char_boundary(end) {
                    end -= 1;
                }
                s.truncate(end);
                s.push('…');
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(truncate_strings),
        serde_json::Value::Object(map) => map.values_mut().for_each(truncate_strings),
        _ => {}
    }
}

/// Connect, send, and — for a permission request — wait for the island's word.
fn talk(payload: &str, waits_for_answer: bool) -> Option<String> {
    let mut pipe = connect()?;

    if pipe.write_all(payload.as_bytes()).is_err() {
        return None;
    }
    let _ = pipe.flush();

    if !waits_for_answer {
        return None;
    }

    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        match pipe.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.contains(&b'\n') {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let answer = String::from_utf8_lossy(&buf).trim().to_string();
    (!answer.is_empty()).then_some(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_json_matches_the_documented_shape() {
        assert_eq!(
            decision_json("allow").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}"#
        );
        assert_eq!(
            decision_json("deny").unwrap(),
            r#"{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from Coucou"}}}"#
        );
        // "always" is an island concept; Claude Code just gets an allow.
        assert!(decision_json("always").unwrap().contains(r#""behavior":"allow""#));
    }

    #[test]
    fn anything_unrecognised_prints_nothing() {
        assert!(decision_json("").is_none());
        assert!(decision_json("maybe").is_none());
        // The shape the app used to send must not be mistaken for a decision.
        assert!(decision_json(r#"{"permissionDecision":"allow"}"#).is_none());
    }

    #[test]
    fn long_strings_are_cut_on_a_char_boundary() {
        let mut v = serde_json::json!({ "tool_input": { "content": "é".repeat(4000) } });
        truncate_strings(&mut v);
        let s = v["tool_input"]["content"].as_str().unwrap();
        assert!(s.len() <= MAX_FIELD_LEN + 4);
        assert!(s.ends_with('…'));
    }
}
