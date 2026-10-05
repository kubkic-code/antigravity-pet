// Live diagnostics and activity reporter for Antigravity IDE connection.
// Maintains circular buffers of recent hooks, prompt dispatches, and IDE window status.

use std::collections::VecDeque;
use std::sync::Mutex;
use serde::Serialize;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::window_finder::{find_antigravity_window_info, IdeWindowInfo};
use crate::settings;

const MAX_HISTORY: usize = 30;

fn current_timestamp() -> String {
    let t = unsafe { GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEventLogEntry {
    pub timestamp: String,
    pub event_name: String,
    pub tool_name: Option<String>,
    pub session_id: Option<String>,
    pub summary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDispatchLogEntry {
    pub timestamp: String,
    pub prompt: String,
    pub target_hwnd: Option<isize>,
    pub method: String,
    pub success: bool,
    pub details: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub timestamp: String,
    pub pipe_name: String,
    pub pipe_connected: bool,
    pub hooks_installed: bool,
    pub hook_path: String,
    pub ide_window: Option<IdeWindowInfo>,
    pub recent_events: Vec<HookEventLogEntry>,
    pub prompt_dispatches: Vec<PromptDispatchLogEntry>,
}

pub struct DiagnosticsState {
    events: VecDeque<HookEventLogEntry>,
    dispatches: VecDeque<PromptDispatchLogEntry>,
    last_known_hwnd: Option<isize>,
}

impl Default for DiagnosticsState {
    fn default() -> Self {
        Self {
            events: VecDeque::with_capacity(MAX_HISTORY),
            dispatches: VecDeque::with_capacity(MAX_HISTORY),
            last_known_hwnd: None,
        }
    }
}

pub static DIAGNOSTICS: Mutex<Option<DiagnosticsState>> = Mutex::new(None);

pub fn init() {
    let mut lock = DIAGNOSTICS.lock().unwrap();
    if lock.is_none() {
        *lock = Some(DiagnosticsState::default());
    }
}

pub fn record_hook_event(
    event_name: &str,
    tool_name: Option<&str>,
    session_id: Option<&str>,
    summary: &str,
) {
    let entry = HookEventLogEntry {
        timestamp: current_timestamp(),
        event_name: event_name.to_string(),
        tool_name: tool_name.map(str::to_string),
        session_id: session_id.map(str::to_string),
        summary: summary.to_string(),
    };

    let mut lock = DIAGNOSTICS.lock().unwrap();
    if let Some(state) = lock.as_mut() {
        if state.events.len() >= MAX_HISTORY {
            state.events.pop_front();
        }
        state.events.push_back(entry);
    }
}

pub fn record_prompt_dispatch(
    prompt: &str,
    target_hwnd: Option<isize>,
    method: &str,
    success: bool,
    details: &str,
) {
    let entry = PromptDispatchLogEntry {
        timestamp: current_timestamp(),
        prompt: prompt.to_string(),
        target_hwnd,
        method: method.to_string(),
        success,
        details: details.to_string(),
    };

    let mut lock = DIAGNOSTICS.lock().unwrap();
    if let Some(state) = lock.as_mut() {
        if state.dispatches.len() >= MAX_HISTORY {
            state.dispatches.pop_front();
        }
        state.dispatches.push_back(entry);
        if let Some(h) = target_hwnd {
            state.last_known_hwnd = Some(h);
        }
    }
}

pub fn set_last_known_hwnd(hwnd: isize) {
    let mut lock = DIAGNOSTICS.lock().unwrap();
    if let Some(state) = lock.as_mut() {
        state.last_known_hwnd = Some(hwnd);
    }
}

pub fn get_report() -> DiagnosticsReport {
    let ide_info = find_antigravity_window_info(None, None);
    let hooks_status = crate::hooks::status();

    let mut lock = DIAGNOSTICS.lock().unwrap();
    let state = lock.get_or_insert_with(DiagnosticsState::default);

    DiagnosticsReport {
        timestamp: current_timestamp(),
        pipe_name: crate::pipe::pipe_name(),
        pipe_connected: true,
        hooks_installed: hooks_status.installed,
        hook_path: settings::hook_exe_path().to_string_lossy().to_string(),
        ide_window: ide_info,
        recent_events: state.events.iter().cloned().collect(),
        prompt_dispatches: state.dispatches.iter().cloned().collect(),
    }
}

pub fn generate_markdown_report() -> String {
    let report = get_report();
    let mut md = String::new();
    md.push_str("# Coucou / Antigravity Pet — Diagnostický Report\n\n");
    md.push_str(&format!("- **Čas vytvoření:** {}\n", report.timestamp));
    md.push_str(&format!("- **Named Pipe:** `{}`\n", report.pipe_name));
    md.push_str(&format!("- **Hooky nainstalovány:** {}\n", if report.hooks_installed { "Ano ✅" } else { "Ne ❌" }));
    md.push_str(&format!("- **Cesta k hooku:** `{}`\n\n", report.hook_path));

    md.push_str("## Antigravity IDE Okno\n");
    if let Some(win) = &report.ide_window {
        md.push_str(&format!("- **HWND:** `0x{:X}` ({})\n", win.hwnd, win.hwnd));
        md.push_str(&format!("- **PID:** {}\n", win.pid));
        md.push_str(&format!("- **Titulek:** {}\n", win.title));
        md.push_str(&format!("- **Třída:** `{}`\n", win.class_name));
        md.push_str(&format!("- **Spustitelný soubor:** `{}`\n\n", win.process_path));
    } else {
        md.push_str("*Žádné okno Antigravity IDE nebylo detekováno!*\n\n");
    }

    md.push_str("## Poslední Hook Události (Named Pipe)\n");
    if report.recent_events.is_empty() {
        md.push_str("*Zatím nebyly zachyceny žádné hook události.*\n\n");
    } else {
        md.push_str("| Čas | Událost | Nástroj | Shrnutí |\n");
        md.push_str("| --- | --- | --- | --- |\n");
        for e in report.recent_events.iter().rev() {
            let tool = e.tool_name.as_deref().unwrap_or("-");
            md.push_str(&format!("| {} | {} | {} | {} |\n", e.timestamp, e.event_name, tool, e.summary));
        }
        md.push_str("\n");
    }

    md.push_str("## Historie Odeslaných Promptů\n");
    if report.prompt_dispatches.is_empty() {
        md.push_str("*Zatím nebyly odeslány žádné prompty z chatu.*\n");
    } else {
        md.push_str("| Čas | Stav | Cílové HWND | Prompt | Detail |\n");
        md.push_str("| --- | --- | --- | --- | --- |\n");
        for p in report.prompt_dispatches.iter().rev() {
            let st = if p.success { "Úspěch ✅" } else { "Chyba ❌" };
            let target = p.target_hwnd.map(|h| format!("0x{:X}", h)).unwrap_or_else(|| "-".into());
            let prompt_escaped = p.prompt.replace('\n', " ").chars().take(40).collect::<String>();
            md.push_str(&format!("| {} | {} | {} | {} | {} |\n", p.timestamp, st, target, prompt_escaped, p.details));
        }
    }

    md
}
