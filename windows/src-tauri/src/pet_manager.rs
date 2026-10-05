// Multi-pet window manager for Antigravity IDE sessions.
// Dynamically manages pets inside the transparent desktop overlay and synchronizes with active Antigravity IDE windows.

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::log;

const ANIMAL_CHOICES: [&str; 8] = [
    "tiger", "dog", "monkey", "elephant", "fox", "panda", "penguin", "cat",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
#[allow(dead_code)]
pub struct PetSession {
    pub session_id: String,
    pub window_label: String,
    pub animal_id: String,
    pub hwnd: Option<isize>,
    pub cwd: Option<String>,
    pub window_title: Option<String>,
    pub project_name: Option<String>,
    #[serde(skip)]
    pub hit_rect: Arc<Mutex<Option<(f64, f64, f64, f64)>>>,
    #[serde(skip)]
    pub ignoring: Arc<AtomicBool>,
}

pub struct PetManager {
    sessions: Mutex<HashMap<String, Arc<PetSession>>>,
}

impl PetManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    #[allow(dead_code)]
    pub fn get_session(&self, session_id: &str) -> Option<Arc<PetSession>> {
        self.sessions.lock().unwrap().get(session_id).cloned()
    }

    #[allow(dead_code)]
    pub fn all_sessions(&self) -> Vec<Arc<PetSession>> {
        self.sessions.lock().unwrap().values().cloned().collect()
    }

    pub fn set_hit_rect(&self, _label: &str, _x: f64, _y: f64, _w: f64, _h: f64) {
        // Unified hit testing handled directly in island
    }

    pub fn ensure_session(
        &self,
        app: &AppHandle,
        session_id: &str,
        cwd: Option<&str>,
        hwnd: Option<isize>,
        title: Option<&str>,
    ) -> Option<Arc<PetSession>> {
        let mut guard = self.sessions.lock().unwrap();
        if let Some(existing) = guard.get(session_id) {
            let proj = title
                .map(|t| crate::window_finder::extract_project_name(t, cwd.or(existing.cwd.as_deref())))
                .or_else(|| cwd.map(|c| crate::window_finder::extract_project_name("", Some(c))));
            if let Some(p) = proj {
                // EXCEPTION: Do not rename an existing project session to "Settings"
                if !crate::window_finder::is_settings_name(&p) && existing.project_name.as_deref() != Some(&p) {
                    let updated = Arc::new(PetSession {
                        session_id: existing.session_id.clone(),
                        window_label: existing.window_label.clone(),
                        animal_id: existing.animal_id.clone(),
                        hwnd: existing.hwnd.or(hwnd),
                        cwd: cwd.map(String::from).or_else(|| existing.cwd.clone()),
                        window_title: title.map(String::from).or_else(|| existing.window_title.clone()),
                        project_name: Some(p.clone()),
                        hit_rect: existing.hit_rect.clone(),
                        ignoring: existing.ignoring.clone(),
                    });
                    guard.insert(session_id.to_string(), updated.clone());
                    let _ = app.emit(
                        "session-updated",
                        json!({
                            "sessionId": session_id,
                            "hwnd": updated.hwnd,
                            "windowTitle": updated.window_title,
                            "projectName": p,
                        }),
                    );
                    return Some(updated);
                }
            }
            return Some(existing.clone());
        }

        // If a session already exists for this exact window handle, alias this new session_id to it!
        if let Some(h) = hwnd {
            if let Some(existing) = guard.values().find(|s| s.hwnd == Some(h)).cloned() {
                guard.insert(session_id.to_string(), existing.clone());
                log::line(format!(
                    "aliased session='{}' to existing window pet session='{}' hwnd=0x{:X}",
                    session_id, existing.session_id, h
                ));
                return Some(existing);
            }
        }

        let count = guard.len();
        let used_animals: Vec<String> = guard.values().map(|s| s.animal_id.clone()).collect();
        let available: Vec<&'static str> = ANIMAL_CHOICES
            .iter()
            .copied()
            .filter(|a| !used_animals.iter().any(|u| u == *a))
            .collect();

        let animal_id = if !available.is_empty() {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.subsec_nanos() as usize)
                .unwrap_or(0);
            available[nanos % available.len()].to_string()
        } else {
            ANIMAL_CHOICES[count % ANIMAL_CHOICES.len()].to_string()
        };

        let project_name = title
            .map(|t| crate::window_finder::extract_project_name(t, cwd))
            .or_else(|| cwd.map(|c| crate::window_finder::extract_project_name("", Some(c))))
            .unwrap_or_else(|| "Antigravity IDE".to_string());

        // EXCEPTION: Never spawn a new pet companion for a Settings window
        if crate::window_finder::is_settings_name(&project_name)
            || title.map_or(false, |t| crate::window_finder::is_settings_window(t, &project_name))
        {
            log::line(format!(
                "ensure_session: suppressed pet creation for settings window (title={:?}, project='{}')",
                title, project_name
            ));
            return None;
        }

        let session = Arc::new(PetSession {
            session_id: session_id.to_string(),
            window_label: "island".to_string(),
            animal_id: animal_id.clone(),
            hwnd,
            cwd: cwd.map(|s| s.to_string()),
            window_title: title.map(|s| s.to_string()),
            project_name: Some(project_name.clone()),
            hit_rect: Arc::new(Mutex::new(None)),
            ignoring: Arc::new(AtomicBool::new(false)),
        });

        guard.insert(session_id.to_string(), session.clone());
        drop(guard);

        log::line(format!(
            "registered pet session='{}' animal='{}' project='{}' hwnd={:?}",
            session_id, animal_id, project_name, hwnd
        ));

        let session_payload = json!({
            "sessionId": session_id,
            "animalId": animal_id,
            "hwnd": hwnd,
            "cwd": cwd,
            "windowTitle": title,
            "projectName": project_name,
        });

        let _ = app.emit("session-assigned", &session_payload);

        Some(session)
    }

    pub fn remove_session(&self, app: &AppHandle, session_id: &str) {
        let (removed_session, _cleaned_count) = {
            let mut guard = self.sessions.lock().unwrap();
            let session = guard.remove(session_id);
            let mut cleaned = 0;
            if let Some(ref s) = session {
                let to_clean: Vec<String> = guard
                    .iter()
                    .filter(|(_k, v)| Arc::ptr_eq(s, v) || (s.hwnd.is_some() && s.hwnd == v.hwnd))
                    .map(|(k, _)| k.clone())
                    .collect();
                for k in to_clean {
                    guard.remove(&k);
                    cleaned += 1;
                }
            }
            (session, cleaned)
        };

        if let Some(sess) = removed_session {
            log::line(format!("closing pet session='{}'", session_id));
            let payload = json!({
                "sessionId": session_id,
                "hwnd": sess.hwnd,
            });
            let _ = app.emit("session-removed", &payload);
        }
    }
}

/// Starts a background window synchronizer that periodically discovers Antigravity IDE windows
/// and dynamically spawns or removes desktop pet companions.
pub fn start_window_monitor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            sync_active_ide_windows(&app);
        }
    });
}

fn sync_active_ide_windows(app: &AppHandle) {
    let Some(manager) = app.try_state::<PetManager>() else { return };
    let discovered = crate::window_finder::enumerate_all_ide_windows();

    // 1. Check for any discovered IDE windows
    for info in &discovered {
        let existing = {
            let guard = manager.sessions.lock().unwrap();
            guard.values().find(|s| s.hwnd == Some(info.hwnd)).cloned()
        };
        if let Some(existing_sess) = existing {
            let proj = crate::window_finder::extract_project_name(&info.title, existing_sess.cwd.as_deref());
            // Do not rename a project to "Settings" if user switched tabs
            if crate::window_finder::is_settings_name(&proj) {
                continue;
            }
            let title_changed = existing_sess.window_title.as_deref() != Some(&info.title);
            let proj_changed = existing_sess.project_name.as_deref() != Some(&proj);
            if title_changed || proj_changed {
                let updated = Arc::new(PetSession {
                    session_id: existing_sess.session_id.clone(),
                    window_label: existing_sess.window_label.clone(),
                    animal_id: existing_sess.animal_id.clone(),
                    hwnd: existing_sess.hwnd,
                    cwd: existing_sess.cwd.clone(),
                    window_title: Some(info.title.clone()),
                    project_name: Some(proj.clone()),
                    hit_rect: existing_sess.hit_rect.clone(),
                    ignoring: existing_sess.ignoring.clone(),
                });
                let mut guard = manager.sessions.lock().unwrap();
                guard.insert(existing_sess.session_id.clone(), updated);
                let _ = app.emit(
                    "session-updated",
                    json!({
                        "sessionId": existing_sess.session_id,
                        "hwnd": info.hwnd,
                        "windowTitle": info.title,
                        "projectName": proj,
                    }),
                );
            }
        } else {
            // EXCEPTION: Never spawn a pet for a Settings window
            if crate::window_finder::is_settings_window(&info.title, &info.project_name) {
                log::line(format!(
                    "ignoring settings window from new pet companion: hwnd=0x{:X} title='{}'",
                    info.hwnd, info.title
                ));
                continue;
            }
            let session_id = format!("ide-win-{:x}", info.hwnd);
            log::line(format!(
                "discovered new Antigravity IDE window: hwnd=0x{:X} pid={} title='{}'",
                info.hwnd, info.pid, info.title
            ));
            manager.ensure_session(app, &session_id, None, Some(info.hwnd), Some(&info.title));
        }
    }

    // 2. Check for closed IDE windows
    let to_remove: Vec<String> = {
        let guard = manager.sessions.lock().unwrap();
        let mut seen_hwnds = std::collections::HashSet::new();
        guard
            .values()
            .filter_map(|s| {
                if let Some(h) = s.hwnd {
                    if seen_hwnds.insert(h) {
                        let still_alive = (discovered.iter().any(|d| d.hwnd == h)
                            || crate::window_finder::is_window_ide_process(h))
                            && crate::window_finder::is_window_valid(h);
                        if !still_alive {
                            return Some(s.session_id.clone());
                        }
                    }
                }
                None
            })
            .collect()
    };

    for sid in to_remove {
        log::line(format!("Antigravity IDE window closed -> removing session '{sid}'"));
        manager.remove_session(app, &sid);
    }
}

/// Routes incoming Antigravity IDE hook payloads to the active pet.
pub fn route_hook_event(app: &AppHandle, payload: &mut Value) {
    let session_id = payload
        .get("session_id")
        .or_else(|| payload.get("conversation_id"))
        .and_then(Value::as_str)
        .unwrap_or("default")
        .to_string();

    let cwd = payload.get("cwd").and_then(Value::as_str).map(str::to_string);
    let hwnd = payload.get("hwnd").and_then(Value::as_i64).map(|h| h as isize);
    let event = payload
        .get("hook_event_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let project_name = crate::window_finder::extract_project_name("", cwd.as_deref());
    if crate::window_finder::is_settings_name(&project_name) {
        log::line("route_hook_event: ignoring hook from settings");
        return;
    }
    payload["projectName"] = json!(project_name);

    let manager = app.state::<PetManager>();
    let _session = manager.ensure_session(app, &session_id, cwd.as_deref(), hwnd, None);

    // Emit event globally to all listening pets
    let _ = app.emit("hook", &payload);

    // If session ended, remove after 5 seconds
    if event == "SessionEnd" {
        let app_handle = app.clone();
        let sid = session_id.to_string();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if let Some(m) = app_handle.try_state::<PetManager>() {
                m.remove_session(&app_handle, &sid);
            }
        });
    }
}

pub fn update_cursor_clickthrough(_app: &AppHandle, _cx: f64, _cy: f64) {
    // Clickthrough handled in island poll
}

/// Enables/disables window activation when typing in chat
pub fn set_chat_expanded(app: &AppHandle, label: &str, expanded: bool) {
    let Some(win) = app.get_webview_window(label) else { return };
    crate::island::set_activating(&win, expanded);
    if expanded {
        let _ = win.set_focus();
    }
}
