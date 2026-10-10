// Antigravity Pet for Windows — app wiring and Tauri commands.

mod diagnostics;
mod hooks;
mod island;
mod log;
mod pipe;
mod settings;
mod tray;
mod win_user;
pub mod window_finder;
mod pet_manager;

use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{ManagerExt, MacosLauncher};

use hooks::{HookPreview, HookStatus};
use island::{PollGate, ScreenInfo};
use pipe::Pending;
use settings::Settings;

/// Keeps spawned helpers from flashing a console window.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct Shared {
    pub settings: Mutex<Settings>,
    pub gate: Arc<PollGate>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootInfo {
    settings: Settings,
    screen: ScreenInfo,
    version: String,
    hook_path: String,
}

#[tauri::command]
fn boot(app: AppHandle, shared: State<Shared>) -> BootInfo {
    let mut settings = shared.settings.lock().unwrap().clone();
    // The real state of ~/.claude/settings.json wins over whatever we stored.
    settings.hooks_installed = hooks::status().installed;
    let screen = island::screen_info(&app, &settings.screen);
    BootInfo {
        settings,
        screen,
        version: env!("CARGO_PKG_VERSION").to_string(),
        hook_path: settings::hook_exe_path().to_string_lossy().to_string(),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, shared: State<Shared>, settings: Settings) {
    let (screen_changed, autostart_changed) = {
        let mut current = shared.settings.lock().unwrap();
        let screen_changed = current.screen != settings.screen;
        let autostart_changed = current.autostart != settings.autostart;
        *current = settings.clone();
        (screen_changed, autostart_changed)
    };
    if let Err(err) = settings::save(&settings) {
        eprintln!("[coucou] could not save settings: {err}");
    }
    if autostart_changed {
        let manager = app.autolaunch();
        let result = if settings.autostart { manager.enable() } else { manager.disable() };
        if let Err(err) = result {
            eprintln!("[coucou] autostart: {err}");
        }
    }
    if screen_changed {
        let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
        island::apply_geometry(&app, &settings.screen, collapsed);
    }
    // Keep the other window in step (island ⇄ settings window).
    let _ = app.emit("settings-changed", settings);
}

/// Hidden island → shrink the window to the invisible wake strip and park the
/// cursor poll; anything else → full panel and 60 Hz polling.
#[tauri::command]
fn set_collapsed(app: AppHandle, shared: State<Shared>, collapsed: bool) {
    let pref = shared.settings.lock().unwrap().screen.clone();
    shared.gate.collapsed.store(collapsed, Ordering::Relaxed);
    island::apply_geometry(&app, &pref, collapsed);
    // The wake strip must always take the mouse, and a resize invalidates the flag.
    island::set_ignore_cursor(&app, false);
    shared.gate.forget_ignore_state();
    shared.gate.set_active(!collapsed);
}

/// The front end pushes the island shape; Rust decides click-through from it.
#[tauri::command]
fn set_island_rect(shared: State<Shared>, x: f64, y: f64, width: f64, height: f64) {
    shared.gate.set_rect(island::IslandRect { x, y, w: width, h: height });
}

#[tauri::command]
fn set_island_rects(shared: State<Shared>, rects: Vec<[f64; 4]>) {
    let list = rects
        .into_iter()
        .map(|r| island::IslandRect {
            x: r[0],
            y: r[1],
            w: r[2],
            h: r[3],
        })
        .collect();
    shared.gate.set_rects(list);
}

#[tauri::command]
fn focus_window(app: AppHandle, focused: bool) {
    let Some(win) = island::window(&app) else { return };
    island::set_activating(&win, focused);
    if focused {
        let _ = win.set_focus();
    }
}

#[tauri::command]
fn reposition(app: AppHandle, shared: State<Shared>) {
    let pref = shared.settings.lock().unwrap().screen.clone();
    let collapsed = shared.gate.collapsed.load(Ordering::Relaxed);
    island::apply_geometry(&app, &pref, collapsed);
}

#[tauri::command]
fn open_url(url: String) {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return;
    }
    let _ = Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", &url])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

/// "Open terminal" opens the working folder in VS Code when `code` is on PATH,
/// and falls back to Explorer otherwise.
#[tauri::command]
fn open_in_vscode(path: Option<String>) -> bool {
    // No `cmd /C` anywhere near this. The path is a project folder chosen by
    // whoever is using Claude Code, and cmd would happily read `&`, `^` and `%`
    // in a folder name as syntax. Finding the launcher ourselves and handing the
    // path over as a separate argument keeps it a path.
    if let Some(code) = find_on_path("code") {
        let mut cmd = Command::new(code);
        if let Some(p) = path.as_deref().filter(|p| !p.is_empty()) {
            cmd.arg(p);
        }
        if cmd.creation_flags(CREATE_NO_WINDOW).spawn().is_ok() {
            return true;
        }
    }
    if let Some(p) = path.as_deref().filter(|p| !p.is_empty()) {
        let _ = Command::new("explorer").arg(p).spawn();
    }
    false
}

#[tauri::command]
fn focus_ide_window(hwnd: Option<isize>) -> Option<isize> {
    log::line(format!("focus_ide_window requested for hwnd={:?}", hwnd));
    if let Some(h) = hwnd.filter(|&v| v != 0) {
        if window_finder::restore_and_focus(h) {
            log::line(format!("focus_ide_window restored provided hwnd={h}"));
            diagnostics::set_last_known_hwnd(h);
            return Some(h);
        }
    }
    if let Some(info) = window_finder::find_antigravity_window_info(None, None) {
        log::line(format!(
            "focus_ide_window found Antigravity window hwnd=0x{:X} pid={} title='{}'",
            info.hwnd, info.pid, info.title
        ));
        diagnostics::set_last_known_hwnd(info.hwnd);
        let ok = window_finder::restore_and_focus(info.hwnd);
        log::line(format!("restore_and_focus returned {ok} for hwnd=0x{:X}", info.hwnd));
        if ok {
            return Some(info.hwnd);
        }
    }
    log::line("focus_ide_window: no active Antigravity IDE window found, launching IDE...");
    if let Some(launched_h) = window_finder::launch_antigravity_ide(None, None) {
        diagnostics::set_last_known_hwnd(launched_h);
        window_finder::restore_and_focus(launched_h);
        return Some(launched_h);
    }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptResult {
    pub success: bool,
    pub target_hwnd: Option<isize>,
    pub method: String,
    pub message: String,
}

#[tauri::command]
async fn send_ide_prompt(
    app: AppHandle,
    session_id: String,
    prompt: String,
    hwnd: Option<isize>,
) -> PromptResult {
    log::line(format!(
        "send_ide_prompt session='{}' len={} hwnd={:?}",
        session_id,
        prompt.len(),
        hwnd
    ));

    // Internal emit to update mascot animation & chat mirror UI
    let _ = app.emit("antigravity-user-prompt", serde_json::json!({
        "sessionId": session_id,
        "prompt": prompt,
    }));

    // Resolve project filter and workspace directory if known
    let mut proj_filter: Option<String> = None;
    let mut cwd: Option<String> = None;
    if let Some(manager) = app.try_state::<pet_manager::PetManager>() {
        if let Some(sess) = manager.get_session(&session_id) {
            proj_filter = sess.project_name.clone();
            cwd = sess.cwd.clone();
        }
        if cwd.is_none() {
            for sess in manager.all_sessions() {
                if let Some(c) = &sess.cwd {
                    cwd = Some(c.clone());
                    break;
                }
            }
        }
    }

    let prompt_clone = prompt.clone();
    let cwd_clone = cwd.clone();
    let (target, ok, method, msg) = tokio::task::spawn_blocking(move || {
        // Find best target window: provided hwnd, or auto-discovered Antigravity window
        let existing_target = if let Some(h) = hwnd.filter(|&v| v != 0 && window_finder::is_window_valid(v)) {
            Some(h)
        } else {
            window_finder::find_antigravity_window(None, proj_filter.as_deref())
                .or_else(|| window_finder::find_antigravity_window(None, None))
        };

        if let Some(h) = existing_target {
            let ok = window_finder::inject_prompt_to_ide(h, &prompt_clone);
            let msg = if ok {
                "Prompt byl vložen do chatu Antigravity a odeslán! 🚀".to_string()
            } else {
                "Prompt je připraven ve schránce (Ctrl+V) 📋".to_string()
            };
            let method = if ok { "ide_ui_injection" } else { "clipboard_fallback" };
            (Some(h), ok, method, msg)
        } else {
            // Antigravity IDE is NOT open! Automatically launch it.
            crate::log::line("send_ide_prompt: no active IDE window, automatically launching Antigravity IDE...");
            if let Some(new_h) = window_finder::launch_antigravity_ide(cwd_clone.as_deref(), proj_filter.as_deref()) {
                let mut ok = window_finder::inject_prompt_to_ide(new_h, &prompt_clone);
                if !ok {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    ok = window_finder::inject_prompt_to_ide(new_h, &prompt_clone);
                }
                let msg = if ok {
                    "Antigravity IDE bylo spuštěno a prompt byl odeslán! 🚀".to_string()
                } else {
                    "Antigravity IDE bylo spuštěno. Prompt je připraven ve schránce (Ctrl+V) 📋".to_string()
                };
                let method = if ok { "ide_launch_and_inject" } else { "clipboard_fallback" };
                (Some(new_h), ok, method, msg)
            } else {
                crate::log::line("send_ide_prompt: failed to launch or locate Antigravity IDE");
                let _ = window_finder::set_clipboard_text(&prompt_clone);
                let msg = "Nepodařilo se spustit Antigravity IDE. Prompt je ve schránce (Ctrl+V) 📋".to_string();
                (None, false, "clipboard_fallback", msg)
            }
        }
    })
    .await
    .unwrap_or_else(|e| {
        log::line(format!("send_ide_prompt task error: {e}"));
        (None, false, "error", format!("Chyba při odesílání promptu: {e}"))
    });

    // If window handle was discovered or launched, update pet session
    if let Some(h) = target {
        if let Some(manager) = app.try_state::<pet_manager::PetManager>() {
            manager.ensure_session(&app, &session_id, cwd.as_deref(), Some(h), None);
        }
    }

    diagnostics::record_prompt_dispatch(
        &prompt,
        target,
        method,
        ok,
        &msg,
    );

    PromptResult {
        success: ok,
        target_hwnd: target,
        method: method.into(),
        message: msg,
    }
}

#[tauri::command]
fn get_diagnostics_report() -> diagnostics::DiagnosticsReport {
    diagnostics::get_report()
}

#[tauri::command]
fn copy_diagnostics_report() -> bool {
    let md = diagnostics::generate_markdown_report();
    window_finder::set_clipboard_text(&md)
}

#[tauri::command]
fn rescan_ide_window() -> Option<window_finder::IdeWindowInfo> {
    let info = window_finder::find_antigravity_window_info(None, None);
    if let Some(ref w) = info {
        diagnostics::set_last_known_hwnd(w.hwnd);
    }
    info
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistoryMessage {
    pub id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    pub timestamp: String,
    pub step_index: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistoryResponse {
    pub session_id: String,
    pub messages: Vec<ChatHistoryMessage>,
    pub total_messages: usize,
    pub has_more: bool,
    pub mtime_ms: u64,
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMetadata {
    pub session_id: String,
    pub mtime_ms: u64,
    pub file_size: u64,
}

struct ResolvedTranscript {
    pub path: std::path::PathBuf,
    pub session_id: String,
}

fn is_transcript_matching_project(
    path: &std::path::Path,
    project_name: Option<&str>,
    cwd: Option<&str>,
) -> bool {
    let Ok(file) = std::fs::File::open(path) else { return false };
    use std::io::Read;
    let mut reader = std::io::BufReader::new(file);
    let mut buffer = [0u8; 8192];
    let Ok(n) = reader.read(&mut buffer) else { return false };
    if n == 0 { return false };
    let sample = String::from_utf8_lossy(&buffer[..n]).to_lowercase();

    if let Some(c) = cwd {
        let clean_c = c.trim().to_lowercase();
        if !clean_c.is_empty() && sample.contains(&clean_c) {
            return true;
        }
    }

    if let Some(p) = project_name {
        let clean_p = p.trim().to_lowercase();
        if !clean_p.is_empty() && sample.contains(&clean_p) {
            return true;
        }
    }

    false
}

fn resolve_transcript_path(app: Option<&AppHandle>, session_id: Option<&str>) -> Option<ResolvedTranscript> {
    let user_profile = std::env::var("USERPROFILE").ok()?;
    let brain_dir = std::path::PathBuf::from(user_profile)
        .join(".gemini")
        .join("antigravity-ide")
        .join("brain");

    // 1. Direct match if session_id is a valid UUID directory in brain/
    if let Some(sid) = session_id {
        if !sid.is_empty() && sid != "default" && !sid.starts_with("ide-win") {
            let candidate = brain_dir
                .join(sid)
                .join(".system_generated")
                .join("logs")
                .join("transcript.jsonl");
            if candidate.exists() {
                return Some(ResolvedTranscript {
                    path: candidate,
                    session_id: sid.to_string(),
                });
            }
        }
    }

    // 2. Query PetManager for project_name, cwd, or mapped conversation_id
    let mut target_project: Option<String> = None;
    let mut target_cwd: Option<String> = None;
    let mut mapped_conv_id: Option<String> = None;

    if let Some(app_handle) = app {
        if let Some(manager) = app_handle.try_state::<pet_manager::PetManager>() {
            if let Some(sid) = session_id {
                if let Some(sess) = manager.get_session(sid) {
                    mapped_conv_id = sess.conversation_id.lock().unwrap().clone();
                    target_project = sess.project_name.clone();
                    target_cwd = sess.cwd.clone();
                }
            }
            if target_project.is_none() {
                for sess in manager.all_sessions() {
                    if let Some(cid) = sess.conversation_id.lock().unwrap().clone() {
                        if mapped_conv_id.is_none() {
                            mapped_conv_id = Some(cid);
                        }
                    }
                    if target_project.is_none() && sess.project_name.is_some() {
                        target_project = sess.project_name.clone();
                        target_cwd = sess.cwd.clone();
                    }
                }
            }
        }
    }

    // If conversation_id was mapped, check its transcript
    if let Some(cid) = mapped_conv_id {
        let candidate = brain_dir
            .join(&cid)
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl");
        if candidate.exists() {
            return Some(ResolvedTranscript {
                path: candidate,
                session_id: cid,
            });
        }
    }

    // If target_project is still None, inspect current process working directory
    if target_project.is_none() {
        if let Ok(cur_dir) = std::env::current_dir() {
            let cur_str = cur_dir.to_string_lossy().to_string();
            let proj = crate::window_finder::extract_project_name("", Some(&cur_str));
            if !crate::window_finder::is_settings_name(&proj) && !proj.is_empty() {
                target_project = Some(proj);
                target_cwd = Some(cur_str);
            }
        }
    }

    // 3. Search brain/ directories for transcripts matching this project
    let entries = std::fs::read_dir(&brain_dir).ok()?;
    let mut candidates: Vec<(std::time::SystemTime, std::path::PathBuf, String)> = Vec::new();

    for entry in entries.flatten() {
        let dir_path = entry.path();
        let candidate = dir_path
            .join(".system_generated")
            .join("logs")
            .join("transcript.jsonl");
        if let Ok(meta) = candidate.metadata() {
            if let Ok(modified) = meta.modified() {
                let sid = dir_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("default")
                    .to_string();

                if target_project.is_some() || target_cwd.is_some() {
                    if is_transcript_matching_project(&candidate, target_project.as_deref(), target_cwd.as_deref()) {
                        candidates.push((modified, candidate, sid));
                    }
                } else {
                    candidates.push((modified, candidate, sid));
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    if let Some((_, path, sid)) = candidates.into_iter().next() {
        return Some(ResolvedTranscript {
            path,
            session_id: sid,
        });
    }

    None
}

fn clean_user_content(raw: &str) -> String {
    if let Some(start_idx) = raw.find("<USER_REQUEST>") {
        let content_start = start_idx + "<USER_REQUEST>".len();
        if let Some(end_idx) = raw[content_start..].find("</USER_REQUEST>") {
            return raw[content_start..content_start + end_idx].trim().to_string();
        }
    }
    if let Some(meta_idx) = raw.find("<ADDITIONAL_METADATA>") {
        return raw[..meta_idx].trim().to_string();
    }
    raw.trim().to_string()
}

fn clean_assistant_content(raw: &str) -> String {
    let mut text = raw.trim();
    if let Some(end_idx) = text.rfind("</thought>") {
        text = text[end_idx + "</thought>".len()..].trim();
    }
    if let Some(end_idx) = text.rfind("</think>") {
        text = text[end_idx + "</think>".len()..].trim();
    }
    text.to_string()
}

fn extract_ask_question_prompt(tool_calls: &[serde_json::Value]) -> Option<String> {
    for tc in tool_calls {
        if tc.get("name").and_then(|v| v.as_str()) == Some("ask_question") {
            if let Some(args) = tc.get("args") {
                let questions_val = args.get("questions");
                let parsed_arr: Option<Vec<serde_json::Value>> = match questions_val {
                    Some(serde_json::Value::Array(arr)) => Some(arr.clone()),
                    Some(serde_json::Value::String(s)) => serde_json::from_str::<Vec<serde_json::Value>>(s).ok(),
                    _ => None,
                };
                if let Some(arr) = parsed_arr {
                    if let Some(first_q) = arr.first() {
                        let q_str = first_q.get("question").and_then(|v| v.as_str()).unwrap_or("Otázka od agenta:");
                        let mut formatted = format!("❓ {q_str}");
                        if let Some(opts) = first_q.get("options").and_then(|v| v.as_array()) {
                            formatted.push_str("\n\n");
                            for (idx, opt) in opts.iter().enumerate() {
                                let opt_str = opt.as_str().unwrap_or("");
                                formatted.push_str(&format!("{}. {}\n", idx + 1, opt_str));
                            }
                        }
                        return Some(formatted.trim().to_string());
                    }
                }
            }
        }
    }
    None
}

fn extract_conversation_history(path: &std::path::Path, limit: Option<usize>) -> Option<(Vec<ChatHistoryMessage>, usize, u64, u64)> {
    use std::io::{BufRead, BufReader};
    let file = std::fs::File::open(path).ok()?;
    let meta = file.metadata().ok()?;
    let file_size = meta.len();
    let mtime_ms = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let reader = BufReader::new(file);
    let mut all_messages: Vec<ChatHistoryMessage> = Vec::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            let step_index = val.get("step_index").and_then(|v| v.as_i64()).unwrap_or(0);
            let timestamp = val.get("created_at")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if msg_type == "USER_INPUT" {
                if let Some(raw_content) = val.get("content").and_then(|v| v.as_str()) {
                    let cleaned = clean_user_content(raw_content);
                    if !cleaned.is_empty() {
                        all_messages.push(ChatHistoryMessage {
                            id: format!("msg-user-{}", step_index),
                            role: "user".to_string(),
                            content: cleaned,
                            timestamp,
                            step_index,
                        });
                    }
                }
            } else if msg_type == "ASK_QUESTION" {
                if let Some(raw_content) = val.get("content").and_then(|v| v.as_str()) {
                    let lines: Vec<&str> = raw_content.lines().collect();
                    let ans_lines: Vec<&str> = lines.iter()
                        .filter(|l| l.starts_with('A') && l.contains(':'))
                        .copied()
                        .collect();
                    let ans_text = if !ans_lines.is_empty() {
                        ans_lines.join("\n")
                    } else if let Some(last) = lines.last() {
                        last.trim().to_string()
                    } else {
                        raw_content.trim().to_string()
                    };
                    if !ans_text.is_empty() {
                        all_messages.push(ChatHistoryMessage {
                            id: format!("msg-ask-ans-{}", step_index),
                            role: "user".to_string(),
                            content: ans_text,
                            timestamp,
                            step_index,
                        });
                    }
                }
            } else if msg_type == "PLANNER_RESPONSE" {
                let content_opt = val.get("content").and_then(|v| v.as_str());
                let mut cleaned = content_opt.map(clean_assistant_content).unwrap_or_default();

                if cleaned.is_empty() {
                    if let Some(tool_calls) = val.get("tool_calls").and_then(|v| v.as_array()) {
                        if let Some(q_prompt) = extract_ask_question_prompt(tool_calls) {
                            cleaned = q_prompt;
                        }
                    }
                }

                if !cleaned.is_empty() {
                    all_messages.push(ChatHistoryMessage {
                        id: format!("msg-assistant-{}", step_index),
                        role: "assistant".to_string(),
                        content: cleaned,
                        timestamp,
                        step_index,
                    });
                }
            }
        }
    }

    let total_count = all_messages.len();
    let result_messages = if let Some(lim) = limit {
        if total_count > lim {
            all_messages[total_count - lim..].to_vec()
        } else {
            all_messages
        }
    } else {
        all_messages
    };

    Some((result_messages, total_count, mtime_ms, file_size))
}

#[tauri::command]
fn get_latest_ide_response(app: AppHandle, session_id: Option<String>) -> Option<String> {
    let resolved = resolve_transcript_path(Some(&app), session_id.as_deref())?;
    let (messages, _, _, _) = extract_conversation_history(&resolved.path, Some(5))?;
    messages.into_iter().rev().find(|m| m.role == "assistant").map(|m| m.content)
}

#[tauri::command]
fn get_conversation_history(app: AppHandle, session_id: Option<String>, limit: Option<usize>) -> Option<ChatHistoryResponse> {
    let resolved = resolve_transcript_path(Some(&app), session_id.as_deref())?;
    let effective_limit = limit.unwrap_or(30);
    let (messages, total_count, mtime_ms, file_size) = extract_conversation_history(&resolved.path, Some(effective_limit))?;
    let has_more = total_count > messages.len();

    Some(ChatHistoryResponse {
        session_id: resolved.session_id,
        messages,
        total_messages: total_count,
        has_more,
        mtime_ms,
        file_size,
    })
}

#[tauri::command]
fn get_all_conversation_history(app: AppHandle, session_id: Option<String>) -> Option<ChatHistoryResponse> {
    let resolved = resolve_transcript_path(Some(&app), session_id.as_deref())?;
    let (messages, total_count, mtime_ms, file_size) = extract_conversation_history(&resolved.path, None)?;

    Some(ChatHistoryResponse {
        session_id: resolved.session_id,
        messages,
        total_messages: total_count,
        has_more: false,
        mtime_ms,
        file_size,
    })
}

#[tauri::command]
fn get_transcript_metadata(app: AppHandle, session_id: Option<String>) -> Option<TranscriptMetadata> {
    let resolved = resolve_transcript_path(Some(&app), session_id.as_deref())?;
    let meta = std::fs::metadata(&resolved.path).ok()?;
    let mtime_ms = meta.modified().ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let file_size = meta.len();

    Some(TranscriptMetadata {
        session_id: resolved.session_id,
        mtime_ms,
        file_size,
    })
}

#[tauri::command]
fn set_pet_window_pos(app: AppHandle, x: i32, y: i32) {
    island::set_window_pos(&app, x, y);
}

#[tauri::command]
fn set_pet_rect(app: AppHandle, window_label: String, x: f64, y: f64, width: f64, height: f64) {
    if let Some(m) = app.try_state::<pet_manager::PetManager>() {
        m.set_hit_rect(&window_label, x, y, width, height);
    }
}

#[tauri::command]
fn close_pet_session(app: AppHandle, session_id: String) {
    if let Some(m) = app.try_state::<pet_manager::PetManager>() {
        m.remove_session(&app, &session_id);
    }
}

#[tauri::command]
fn set_pet_chat_expanded(app: AppHandle, window_label: String, expanded: bool) {
    pet_manager::set_chat_expanded(&app, &window_label, expanded);
}

#[tauri::command]
fn get_active_sessions(app: AppHandle) -> Vec<pet_manager::PetSession> {
    if let Some(m) = app.try_state::<pet_manager::PetManager>() {
        pet_manager::sync_active_ide_windows(&app);
        m.all_sessions().into_iter().map(|s| (*s).clone()).collect()
    } else {
        Vec::new()
    }
}

/// Our own `where`: walks %PATH% against %PATHEXT%, no shell involved.
/// Rust quotes arguments correctly for `.cmd`/`.bat` targets since 1.77, so
/// spawning `code.cmd` directly is safe.
fn find_on_path(stem: &str) -> Option<std::path::PathBuf> {
    let exts = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into());
    let dirs = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&dirs) {
        for ext in exts.split(';').filter(|e| !e.is_empty()) {
            let candidate = dir.join(format!("{stem}{}", ext.to_lowercase()));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_paused(paused: bool) {
    log::line(format!("paused state changed: {}", paused));
}

// ── Claude Code hooks ─────────────────────────────────────────────────────────

#[tauri::command]
fn hooks_status() -> HookStatus {
    hooks::status()
}

/// Returns the diff the user has to look at before anything is written.
#[tauri::command]
fn hooks_preview(install: bool) -> Result<HookPreview, String> {
    hooks::preview(install)
}

/// Only ever called from an explicit click in the settings window.
#[tauri::command]
fn hooks_apply(
    app: AppHandle,
    shared: State<Shared>,
    install: bool,
    fingerprint: String,
) -> Result<String, String> {
    // The fingerprint comes from the preview the user actually looked at, so a
    // settings.json that changed in between is refused rather than overwritten.
    let backup = hooks::write(install, &fingerprint)?;
    let updated = {
        let mut current = shared.settings.lock().unwrap();
        current.hooks_installed = install;
        let _ = settings::save(&current);
        current.clone()
    };
    let _ = app.emit("settings-changed", updated);
    Ok(backup)
}

#[tauri::command]
fn approval_decision(app: AppHandle, request_id: String, decision: String) {
    pipe::answer(&app, &request_id, &decision);
}

/// The island has the card on screen, so the long wait for a human may begin.
/// Until this arrives the relay only waits a few hundred milliseconds, which is
/// what stops a paused or unresponsive island from freezing Claude Code.
#[tauri::command]
fn approval_ack(app: AppHandle, request_id: String) {
    pipe::acknowledge(&app, &request_id);
}

/// Nobody can act on this request — the island is paused, or another card is
/// already up. Claude Code falls back to asking in the terminal immediately.
#[tauri::command]
fn approval_decline(app: AppHandle, request_id: String) {
    pipe::decline(&app, &request_id);
}

// ── Logging ──────────────────────────────────────────────────────────────────

/// Lets the frontend write to the same log as the Rust side.
#[tauri::command]
fn log_line(message: String) {
    log::line(format!("ui  {message}"));
}

// ── Settings window ───────────────────────────────────────────────────────────

/// WebView2 allows exactly one browser environment per app, and its options are
/// fixed by whichever webview is created first. Every window must therefore ask
/// for the *same* arguments as the island (see `additionalBrowserArgs` in
/// tauri.conf.json) — a mismatch makes the second window come up blank, with no
/// error anywhere.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required";

/// In a dev build the pages are served by Vite, so the second window needs the
/// absolute dev URL; a bundled build resolves it inside the app bundle.
fn settings_page_url(app: &AppHandle) -> WebviewUrl {
    #[cfg(dev)]
    if let Some(mut base) = app.config().build.dev_url.clone() {
        base.set_path("/settings.html");
        return WebviewUrl::External(base);
    }
    let _ = app;
    WebviewUrl::App("settings.html".into())
}

/// The settings window is created hidden at launch and only ever shown and
/// hidden afterwards. A WebView2 window created later — on the main thread or
/// not — silently comes up blank in this app, so the window that works is the
/// one that exists before the island's webview does.
fn create_settings_window(app: &AppHandle) {
    let url = settings_page_url(app);
    match WebviewWindowBuilder::new(app, "settings", url)
        .additional_browser_args(BROWSER_ARGS)
        .title("Settings — Coucou")
        .inner_size(560.0, 680.0)
        .min_inner_size(460.0, 480.0)
        .resizable(true)
        .visible(false)
        .center()
        .build()
    {
        Ok(win) => {
            // Closing it must only hide it, or it could never be reopened.
            let hidden = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hidden.hide();
                }
            });
        }
        Err(err) => log::line(format!("settings window failed: {err}")),
    }
}

pub fn show_settings_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window("settings") else {
        log::line("settings window missing");
        return;
    };
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

#[tauri::command]
fn open_settings_window(app: AppHandle) {
    show_settings_window(&app);
}

pub fn run() {
    #[cfg(windows)]
    let _single_instance_guard = {
        use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
        use windows::Win32::System::Threading::CreateMutexW;

        let mutex_name: Vec<u16> = "Global\\AntigravityPet_SingleInstance_App\0"
            .encode_utf16()
            .collect();
        let h_mutex = unsafe {
            CreateMutexW(
                None,
                true,
                windows::core::PCWSTR(mutex_name.as_ptr()),
            )
        };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            use std::os::windows::process::CommandExt;
            let our_pid = std::process::id();
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/IM", "coucou.exe", "/FI", &format!("PID ne {our_pid}")])
                .creation_flags(0x08000000)
                .output();
            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        h_mutex
    };

    let loaded = settings::load();
    let gate = Arc::new(PollGate::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = app.emit_to(island::WINDOW_LABEL, "tray", "open".to_string());
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(Shared {
            settings: Mutex::new(loaded.clone()),
            gate: gate.clone(),
        })
        .manage(Pending::default())
        .manage(pet_manager::PetManager::new())
        .invoke_handler(tauri::generate_handler![
            boot,
            save_settings,
            set_collapsed,
            set_island_rect,
            set_island_rects,
            focus_window,
            reposition,
            open_url,
            open_in_vscode,
            quit_app,
            hooks_status,
            hooks_preview,
            hooks_apply,
            approval_decision,
            approval_ack,
            approval_decline,
            log_line,
            open_settings_window,
            set_paused,
            focus_ide_window,
            set_pet_window_pos,
            set_pet_rect,
            close_pet_session,
            set_pet_chat_expanded,
            send_ide_prompt,
            get_diagnostics_report,
            copy_diagnostics_report,
            rescan_ide_window,
            get_latest_ide_response,
            get_conversation_history,
            get_all_conversation_history,
            get_transcript_metadata,
            get_active_sessions,
        ])
        .setup(move |app| {
            diagnostics::init();
            let handle = app.handle().clone();
            tray::build(&handle)?;
            // Before the island: see create_settings_window.
            create_settings_window(&handle);

            if let Some(win) = island::window(&handle) {
                island::make_non_activating(&win);
                island::apply_geometry(&handle, &loaded.screen, false);
                let _ = win.show();
            }
            gate.collapsed.store(false, Ordering::Relaxed);
            gate.set_active(true);
            island::spawn_cursor_poll(handle.clone(), gate.clone());

            log::line(format!("--- AntigravityPet {} started ---", env!("CARGO_PKG_VERSION")));
            hooks::ensure_hook_exe(&handle);
            hooks::auto_install_if_needed();
            pipe::start(handle.clone());
            pet_manager::start_window_monitor(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Coucou");
}
