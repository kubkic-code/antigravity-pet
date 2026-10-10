// Win32 window finder and activator for Antigravity IDE instances.
// Maps process PID, project name, or active process to top-level HWND.
// Restores and forces focus to the IDE window using Win32 foreground lock bypass.

use serde::Serialize;
use windows::core::BOOL;
use windows::Win32::Foundation::{HGLOBAL, HWND, LPARAM, POINT};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
    PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, mouse_event, KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    VK_CONTROL, VK_LWIN, VK_MENU, VK_RETURN, VK_SHIFT, VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, GetClassNameW, GetCursorPos, GetForegroundWindow,
    GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible,
    SetCursorPos, SetForegroundWindow, SetWindowPos, ShowWindow, HWND_TOP, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SW_MINIMIZE, SW_RESTORE, SW_SHOW,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdeWindowInfo {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub class_name: String,
    pub process_path: String,
    pub project_name: String,
}

/// Checks whether a title segment represents an IDE / editor application name.
pub fn is_app_name(s: &str) -> bool {
    let l = s.trim().to_lowercase();
    l == "antigravity"
        || l == "antigravity ide"
        || l == "visual studio code"
        || l == "code"
        || l == "cursor"
        || l == "windsurf"
        || l == "vscodium"
        || l == "coucou"
}

/// Checks whether a title segment represents a file name or special editor tab
/// (e.g., "README.md", "lib.rs", "Welcome", "Untitled-1", "Dockerfile", "package.json").
pub fn is_file_or_editor_tab(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();

    // Editor UI tabs and screens
    if lower == "welcome"
        || lower == "settings"
        || lower == "release notes"
        || lower == "keyboard shortcuts"
        || lower == "terminal"
        || lower == "output"
        || lower == "extensions"
        || lower.starts_with("untitled-")
    {
        return true;
    }

    // Common extensionless project/repo files
    if lower == "dockerfile"
        || lower == "makefile"
        || lower == "procfile"
        || lower == "license"
        || lower == "licence"
        || lower == "readme"
    {
        return true;
    }

    // Dotfiles (e.g. .gitignore, .dockerignore, .env, .eslintrc)
    if lower.starts_with('.') && !lower.contains('/') && !lower.contains('\\') {
        if lower.len() > 1 && !lower.starts_with("..") {
            return true;
        }
    }

    // File with common extension: [name].[ext]
    if let Some(dot_idx) = trimmed.rfind('.') {
        if dot_idx > 0 {
            let ext = &trimmed[dot_idx + 1..];
            if !ext.is_empty() && ext.len() <= 6 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
                return true;
            }
        }
    }

    false
}

/// Returns true if a given project name or identifier matches "settings" in English or Czech.
pub fn is_settings_name(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    lower == "settings"
        || lower == "setting"
        || lower == "nastavení"
        || lower == "nastaveni"
        || lower == "preferences"
        || lower == "preference"
        || lower == "předvolby"
        || lower == "predvolby"
}

/// Returns true if a window title or its parsed project name represents a Settings / Preferences window.
pub fn is_settings_window(title: &str, project_name: &str) -> bool {
    if is_settings_name(project_name) {
        return true;
    }

    let lower_title = title.trim().to_lowercase();

    // Coucou's own settings window
    if lower_title == "settings — coucou"
        || lower_title == "settings - coucou"
        || lower_title == "coucou settings"
        || lower_title == "coucou — settings"
    {
        return true;
    }

    // Standalone settings or preferences window
    if lower_title == "settings"
        || lower_title == "setting"
        || lower_title == "nastavení"
        || lower_title == "nastaveni"
        || lower_title == "preferences"
        || lower_title == "preference"
        || lower_title.starts_with("settings - antigravity")
        || lower_title.starts_with("settings — antigravity")
        || lower_title.starts_with("settings - visual studio code")
        || lower_title.starts_with("settings — visual studio code")
        || lower_title.starts_with("settings - code")
        || lower_title.starts_with("nastavení - antigravity")
        || lower_title.starts_with("nastavení — antigravity")
        || lower_title.starts_with("preferences - antigravity")
        || lower_title.starts_with("preferences — antigravity")
    {
        return true;
    }

    // If title starts with Settings/Nastavení and does NOT have another valid non-app project
    if lower_title.starts_with("settings") || lower_title.starts_with("nastavení") {
        let parts = split_title_parts(title);
        let non_app: Vec<&str> = parts.iter().copied().filter(|p| !is_app_name(p)).collect();
        if non_app.iter().all(|p| is_settings_name(p) || is_file_or_editor_tab(p)) {
            return true;
        }
    }

    false
}

/// Returns true if the process is a known web browser, terminal, shell, or communication app.
/// These must never be recognized as an Antigravity IDE window, even if their title mentions "antigravity".
pub fn is_known_non_ide_process(lower_path: &str) -> bool {
    let non_ide = [
        "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe",
        "vivaldi.exe", "arc.exe", "waterfox.exe", "tor.exe", "iexplore.exe",
        "explorer.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "windowsterminal.exe",
        "slack.exe", "discord.exe", "teams.exe", "spotify.exe", "devenv.exe",
    ];
    non_ide.iter().any(|&p| lower_path.ends_with(p) || lower_path.contains(&format!("\\{p}")))
}

/// Returns true if the process is a supported IDE editor executable.
pub fn is_ide_process(lower_path: &str) -> bool {
    if is_known_non_ide_process(lower_path) {
        return false;
    }
    lower_path.contains("antigravity")
        || lower_path.ends_with("code.exe")
        || lower_path.ends_with("cursor.exe")
        || lower_path.ends_with("windsurf.exe")
        || lower_path.ends_with("vscodium.exe")
        || lower_path.ends_with("electron.exe")
}

/// Splits a window title by standard VS Code / Antigravity separators.
/// Handles spaced separators (" - ", " — ", " – ", " | ") without splitting
/// hyphenated project names like "coucou-main".
pub fn split_title_parts(title: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut current_start = 0;
    let mut i = 0;

    let seps = [" — ", " – ", " - ", " | ", "—", "–"];

    while i < title.len() {
        let remainder = &title[i..];
        let mut matched_sep: Option<&str> = None;
        for sep in &seps {
            if remainder.starts_with(sep) {
                matched_sep = Some(sep);
                break;
            }
        }

        if let Some(sep) = matched_sep {
            let part = title[current_start..i].trim();
            if !part.is_empty() {
                parts.push(part);
            }
            i += sep.len();
            current_start = i;
        } else if let Some(c) = remainder.chars().next() {
            i += c.len_utf8();
        } else {
            break;
        }
    }

    let last_part = title[current_start..].trim();
    if !last_part.is_empty() {
        parts.push(last_part);
    }

    if parts.is_empty() && !title.trim().is_empty() {
        parts.push(title.trim());
    }

    parts
}

pub fn extract_project_name(title: &str, cwd: Option<&str>) -> String {
    // 1. If CWD is provided, directory folder name is the authoritative project name
    if let Some(dir) = cwd {
        if let Some(folder) = dir.split(['/', '\\']).filter(|s| !s.is_empty()).last() {
            let trimmed = folder.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    // 2. Strip leading dirty file markers ('●', '*', whitespace)
    let clean = title.trim_start_matches(|c| c == '●' || c == '*' || c == ' ');
    let parts = split_title_parts(clean);

    if parts.is_empty() {
        return "Antigravity".to_string();
    }

    // 3. If any part explicitly has "(Workspace)", it is guaranteed to be the workspace name
    for part in &parts {
        if part.contains("(Workspace)") {
            let cleaned = part
                .replace("(Workspace)", "")
                .replace("[SSH:", "")
                .replace(']', "")
                .trim()
                .to_string();
            if !cleaned.is_empty() {
                return cleaned;
            }
        }
    }

    // 4. Filter out IDE/editor app names
    let non_app_parts: Vec<&str> = parts.iter().copied().filter(|p| !is_app_name(p)).collect();
    if non_app_parts.is_empty() {
        return parts[0].to_string();
    }

    // 5. Filter out active file names and editor tabs
    let project_candidates: Vec<&str> = non_app_parts
        .iter()
        .copied()
        .filter(|p| !is_file_or_editor_tab(p))
        .collect();

    let candidate = if !project_candidates.is_empty() {
        // First valid project candidate (e.g. "coucou-main" from ["coucou-main", "README.md"]
        // or from ["README.md", "coucou-main"])
        project_candidates[0]
    } else {
        // Fallback: in standard VS Code "${activeEditorShort} - ${rootName}",
        // if both parts looked like files, rootName is the latter non-app part.
        if non_app_parts.len() > 1 {
            non_app_parts.last().unwrap()
        } else {
            non_app_parts[0]
        }
    };

    let cleaned_candidate = candidate
        .replace("(Workspace)", "")
        .replace("[SSH:", "")
        .replace(']', "")
        .trim()
        .to_string();

    if !cleaned_candidate.is_empty() {
        cleaned_candidate
    } else {
        parts[0].to_string()
    }
}

pub fn get_process_image_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let res = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        if res.is_ok() && size > 0 {
            Some(String::from_utf16_lossy(&buf[..size as usize]))
        } else {
            None
        }
    }
}

#[allow(dead_code)]
pub fn inspect_window(hwnd_val: isize) -> Option<IdeWindowInfo> {
    if hwnd_val == 0 {
        return None;
    }
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return None;
        }

        let mut win_pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut win_pid));

        let mut text_buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut text_buf);
        let title = if len > 0 {
            String::from_utf16_lossy(&text_buf[..len as usize])
        } else {
            String::new()
        };

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = if class_len > 0 {
            String::from_utf16_lossy(&class_buf[..class_len as usize])
        } else {
            String::new()
        };

        let process_path = get_process_image_path(win_pid).unwrap_or_default();
        let project_name = extract_project_name(&title, None);

        Some(IdeWindowInfo {
            hwnd: hwnd_val,
            pid: win_pid,
            title,
            class_name,
            process_path,
            project_name,
        })
    }
}

struct Candidate {
    score: i32,
    info: IdeWindowInfo,
}

struct SearchContext<'a> {
    target_pid: Option<u32>,
    project_name: Option<&'a str>,
    our_pid: u32,
    best_candidate: Option<Candidate>,
}

unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut SearchContext);

    if !IsWindowVisible(hwnd).as_bool() {
        return true.into();
    }

    let mut win_pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut win_pid));

    // Never match Coucou's own windows
    if win_pid == ctx.our_pid {
        return true.into();
    }

    let mut text_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut text_buf);
    let title = if len > 0 {
        String::from_utf16_lossy(&text_buf[..len as usize])
    } else {
        String::new()
    };

    let mut class_buf = [0u16; 256];
    let class_len = GetClassNameW(hwnd, &mut class_buf);
    let class_name = if class_len > 0 {
        String::from_utf16_lossy(&class_buf[..class_len as usize])
    } else {
        String::new()
    };

    // Skip utility, popup, tooltips and overlay windows
    if class_name.contains("Chrome_WidgetWin_2") {
        return true.into();
    }

    if title.trim().is_empty() {
        return true.into();
    }

    let is_minimized = unsafe { IsIconic(hwnd).as_bool() };
    if !is_minimized {
        let mut rect = windows::Win32::Foundation::RECT::default();
        let _ = unsafe { GetWindowRect(hwnd, &mut rect) };
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w < 300 || h < 200 {
            return true.into();
        }
    }

    let process_path = get_process_image_path(win_pid).unwrap_or_default();
    let lower_path = process_path.to_lowercase();
    let lower_title = title.to_lowercase();
    let lower_class = class_name.to_lowercase();

    // Reject non-IDE processes immediately (browsers, terminals, chats, etc.)
    if !lower_path.is_empty() {
        if !is_ide_process(&lower_path) {
            return true.into();
        }
    } else if !lower_title.contains("antigravity") && !lower_title.contains("visual studio code") {
        return true.into();
    }

    let mut score = 0i32;

    // Check target PID match if requested
    if let Some(target) = ctx.target_pid {
        if win_pid == target {
            score += 150;
        }
    }

    // Process name checks
    let is_antigravity_proc = lower_path.contains("antigravity");
    let is_vscode_proc = lower_path.ends_with("code.exe")
        || lower_path.ends_with("cursor.exe")
        || lower_path.ends_with("windsurf.exe")
        || lower_path.ends_with("vscodium.exe")
        || lower_path.ends_with("electron.exe");

    if is_antigravity_proc {
        score += 80;
    } else if is_vscode_proc {
        score += 25;
    }

    // Title checks
    if lower_title.contains("antigravity") {
        score += 60;
    }
    if lower_title.contains("visual studio code") {
        score += 20;
    }

    // Project name check in title
    if let Some(proj) = ctx.project_name {
        let p = proj.to_lowercase();
        if !p.is_empty() && lower_title.contains(&p) {
            score += 45;
        }
    }

    // Class check (Electron / Chromium top-level main window)
    if lower_class == "chrome_widgetwin_1" {
        score += 15;
    }

    // Penalize empty titles (background worker windows)
    if title.trim().is_empty() {
        score -= 50;
    }

    // Only consider windows with a reasonable match score
    if score >= 35 {
        let is_better = match &ctx.best_candidate {
            Some(curr) => score > curr.score,
            None => true,
        };

        if is_better {
            let project_name = extract_project_name(&title, ctx.project_name);
            if !is_settings_window(&title, &project_name) || ctx.project_name.map_or(false, is_settings_name) {
                ctx.best_candidate = Some(Candidate {
                    score,
                    info: IdeWindowInfo {
                        hwnd: hwnd.0 as isize,
                        pid: win_pid,
                        title,
                        class_name,
                        process_path,
                        project_name,
                    },
                });
            }
        }
    }

    true.into()
}

#[link(name = "user32")]
extern "system" {
    fn OpenDesktopA(
        lpszDesktop: *const u8,
        dwFlags: u32,
        fInherit: i32,
        dwDesiredAccess: u32,
    ) -> isize;
    fn SetThreadDesktop(hDesktop: isize) -> i32;
    fn SetThreadDpiAwarenessContext(dpiContext: isize) -> isize;
    fn GetDpiForWindow(hwnd: HWND) -> u32;
    fn AllowSetForegroundWindow(dwProcessId: u32) -> i32;
    fn SwitchToThisWindow(hwnd: HWND, fAltTab: BOOL);
}

pub fn ensure_default_desktop() {
    unsafe {
        let name = b"Default\0";
        let h_desk = OpenDesktopA(name.as_ptr(), 0, 0, 0x1FF);
        if h_desk != 0 {
            let _ = SetThreadDesktop(h_desk);
        }
    }
}

pub fn find_antigravity_window_info(
    pid: Option<u32>,
    project_name: Option<&str>,
) -> Option<IdeWindowInfo> {
    ensure_default_desktop();
    let mut ctx = SearchContext {
        target_pid: pid,
        project_name,
        our_pid: std::process::id(),
        best_candidate: None,
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut ctx as *mut _ as isize),
        );
    }

    ctx.best_candidate.map(|c| c.info)
}

pub fn find_antigravity_window(pid: Option<u32>, project_name: Option<&str>) -> Option<isize> {
    find_antigravity_window_info(pid, project_name).map(|info| info.hwnd)
}

struct EnumAllContext {
    our_pid: u32,
    windows: Vec<IdeWindowInfo>,
}

unsafe extern "system" fn enum_all_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut EnumAllContext);

    if !IsWindowVisible(hwnd).as_bool() {
        return true.into();
    }

    let mut win_pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut win_pid));

    if win_pid == ctx.our_pid {
        return true.into();
    }

    let mut text_buf = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut text_buf);
    let title = if len > 0 {
        String::from_utf16_lossy(&text_buf[..len as usize])
    } else {
        String::new()
    };

    let mut class_buf = [0u16; 256];
    let class_len = GetClassNameW(hwnd, &mut class_buf);
    let class_name = if class_len > 0 {
        String::from_utf16_lossy(&class_buf[..class_len as usize])
    } else {
        String::new()
    };

    if class_name.contains("Chrome_WidgetWin_2") {
        return true.into();
    }

    if title.trim().is_empty() {
        return true.into();
    }

    let is_minimized = unsafe { IsIconic(hwnd).as_bool() };
    if !is_minimized {
        let mut rect = windows::Win32::Foundation::RECT::default();
        let _ = unsafe { GetWindowRect(hwnd, &mut rect) };
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w < 300 || h < 200 {
            return true.into();
        }
    }

    let process_path = get_process_image_path(win_pid).unwrap_or_default();
    let lower_path = process_path.to_lowercase();
    let lower_title = title.to_lowercase();
    let lower_class = class_name.to_lowercase();

    // Reject non-IDE processes immediately (browsers, terminals, chats, etc.)
    if !is_ide_process(&lower_path) {
        return true.into();
    }

    let mut score = 0i32;

    let is_antigravity_proc = lower_path.contains("antigravity");
    let is_vscode_proc = lower_path.ends_with("code.exe")
        || lower_path.ends_with("cursor.exe")
        || lower_path.ends_with("windsurf.exe")
        || lower_path.ends_with("vscodium.exe")
        || lower_path.ends_with("electron.exe");

    if is_antigravity_proc {
        score += 80;
    } else if is_vscode_proc {
        score += 40;
    }

    if lower_title.contains("antigravity") {
        score += 60;
    }
    if lower_title.contains("visual studio code") {
        score += 20;
    }
    if lower_class == "chrome_widgetwin_1" {
        score += 15;
    }
    if title.trim().is_empty() {
        score -= 50;
    }

    if score >= 35 {
        let project_name = extract_project_name(&title, None);
        // Only exclude Coucou's own Settings window; IDE windows (even with Settings tab open)
        // should be enumerated so existing project sessions know their window is alive!
        let is_coucou_settings = lower_title == "settings — coucou"
            || lower_title == "settings - coucou"
            || lower_title == "coucou settings";
        if !is_coucou_settings {
            ctx.windows.push(IdeWindowInfo {
                hwnd: hwnd.0 as isize,
                pid: win_pid,
                title,
                class_name,
                process_path,
                project_name,
            });
        }
    }

    true.into()
}

/// Enumerate all currently visible top-level Antigravity IDE windows on the desktop.
pub fn enumerate_all_ide_windows() -> Vec<IdeWindowInfo> {
    ensure_default_desktop();
    let mut ctx = EnumAllContext {
        our_pid: std::process::id(),
        windows: Vec::new(),
    };

    unsafe {
        let _ = EnumWindows(
            Some(enum_all_windows_callback),
            LPARAM(&mut ctx as *mut _ as isize),
        );
    }

    ctx.windows
}

/// Checks if the given Win32 window handle is still valid, visible, and belongs to an IDE process.
pub fn is_window_valid(hwnd_val: isize) -> bool {
    if hwnd_val == 0 {
        return false;
    }
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return false;
        }
        if !IsWindowVisible(hwnd).as_bool() {
            return false;
        }
        is_window_ide_process(hwnd_val)
    }
}

/// Checks if an HWND belongs to an active Antigravity IDE / VS Code process and is still a valid window.
pub fn is_window_ide_process(hwnd_val: isize) -> bool {
    if hwnd_val == 0 {
        return false;
    }
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 || pid == std::process::id() {
            return false;
        }
        let path = get_process_image_path(pid).unwrap_or_default().to_lowercase();
        is_ide_process(&path)
    }
}


/// Restores and forces the given window to the foreground, bypassing Windows 10/11 lock.
pub fn restore_and_focus(hwnd_val: isize) -> bool {
    if hwnd_val == 0 {
        return false;
    }
    let hwnd = HWND(hwnd_val as *mut _);
    unsafe {
        if !IsWindow(Some(hwnd)).as_bool() {
            return false;
        }

        // 1. Restore if minimized
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        } else {
            let _ = ShowWindow(hwnd, SW_SHOW);
        }

        // 2. Thread input attachment & Alt key bypass
        let fore_hwnd = GetForegroundWindow();
        let fore_thread = if fore_hwnd.0 as isize != 0 {
            GetWindowThreadProcessId(fore_hwnd, None)
        } else {
            0
        };
        let cur_thread = GetCurrentThreadId();
        let target_thread = GetWindowThreadProcessId(hwnd, None);

        if fore_thread != 0 && fore_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, fore_thread, true);
        }
        if target_thread != 0 && target_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, target_thread, true);
        }

        let _ = AllowSetForegroundWindow(0xFFFFFFFF);

        // Pulse ALT key (VK_MENU) to grant foreground activation privilege
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);

        SwitchToThisWindow(hwnd, true.into());
        let _ = SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = BringWindowToTop(hwnd);
        let success = SetForegroundWindow(hwnd).as_bool();

        // Ensure target window is foreground with small retry loop
        for _ in 0..5 {
            if GetForegroundWindow() == hwnd {
                break;
            }
            SwitchToThisWindow(hwnd, true.into());
            let _ = SetForegroundWindow(hwnd);
            std::thread::sleep(std::time::Duration::from_millis(25));
        }

        // Cleanup thread attachments
        if fore_thread != 0 && fore_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, fore_thread, false);
        }
        if target_thread != 0 && target_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, target_thread, false);
        }

        success || GetForegroundWindow() == hwnd
    }
}

/// Native Win32 clipboard setter using UTF-16 Unicode text.
pub fn set_clipboard_text(text: &str) -> bool {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    unsafe {
        if OpenClipboard(None).is_err() {
            return false;
        }
        let _ = EmptyClipboard();

        let utf16: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = utf16.len() * 2;

        let h_global = match GlobalAlloc(GMEM_MOVEABLE, bytes) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return false;
            }
        };

        let ptr = GlobalLock(h_global);
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(utf16.as_ptr() as *const u8, ptr as *mut u8, bytes);
            let _ = GlobalUnlock(h_global);
            // CF_UNICODETEXT = 13
            let _ = SetClipboardData(13, Some(windows::Win32::Foundation::HANDLE(h_global.0)));
        }

        let _ = CloseClipboard();
        true
    }
}

/// Native Win32 clipboard getter for UTF-16 Unicode text.
#[allow(dead_code)]
pub fn get_clipboard_text() -> Option<String> {
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    unsafe {
        if OpenClipboard(None).is_err() {
            return None;
        }
        let Ok(handle) = GetClipboardData(13) else {
            let _ = CloseClipboard();
            return None;
        };
        if handle.0.is_null() {
            let _ = CloseClipboard();
            return None;
        }
        let ptr = GlobalLock(HGLOBAL(handle.0));
        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }

        let mut u16_chars = Vec::new();
        let mut cur = ptr as *const u16;
        while *cur != 0 {
            u16_chars.push(*cur);
            cur = cur.add(1);
        }

        let _ = GlobalUnlock(HGLOBAL(handle.0));
        let _ = CloseClipboard();
        Some(String::from_utf16_lossy(&u16_chars))
    }
}

/// Finds the user's active application window (e.g. Google Chrome, Edge, etc.)
/// excluding Coucou itself and the target Antigravity IDE window.
#[allow(dead_code)]
pub fn find_user_foreground_window(target_ide_hwnd: HWND) -> Option<HWND> {
    let our_pid = std::process::id();
    let current_fore = unsafe { GetForegroundWindow() };

    if current_fore.0 as isize != 0 && current_fore != target_ide_hwnd {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(current_fore, Some(&mut pid)) };
        if pid != our_pid {
            return Some(current_fore);
        }
    }

    // If current foreground is Coucou or IDE, walk top-level windows in Z-order
    struct ZOrderContext {
        our_pid: u32,
        ide_hwnd: HWND,
        found: Option<HWND>,
    }
    let mut ctx = ZOrderContext {
        our_pid,
        ide_hwnd: target_ide_hwnd,
        found: None,
    };

    unsafe extern "system" fn enum_zorder(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut ZOrderContext);
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return true.into();
        }
        if hwnd == ctx.ide_hwnd {
            return true.into();
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == ctx.our_pid {
            return true.into();
        }
        let mut rect = windows::Win32::Foundation::RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        if (rect.right - rect.left) > 250 && (rect.bottom - rect.top) > 150 {
            ctx.found = Some(hwnd);
            return false.into(); // Found top-most user window!
        }
        true.into()
    }

    unsafe {
        let _ = EnumWindows(Some(enum_zorder), LPARAM(&mut ctx as *mut _ as isize));
    }
    ctx.found
}

/// Finds the Antigravity IDE CLI executable (`antigravity-ide.cmd`).
pub fn find_antigravity_cli_path() -> Option<std::path::PathBuf> {
    // 1. Check LOCALAPPDATA / ProgramFiles standard install locations
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let p = std::path::PathBuf::from(&local_app_data)
            .join("Programs")
            .join("Antigravity IDE")
            .join("bin")
            .join("antigravity-ide.cmd");
        if p.exists() {
            return Some(p);
        }
        let p2 = std::path::PathBuf::from(&local_app_data)
            .join("Programs")
            .join("antigravity")
            .join("bin")
            .join("antigravity.cmd");
        if p2.exists() {
            return Some(p2);
        }
    }
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let p = std::path::PathBuf::from(pf)
            .join("Antigravity IDE")
            .join("bin")
            .join("antigravity-ide.cmd");
        if p.exists() {
            return Some(p);
        }
    }
    // 2. Check PATH environment variable
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let c1 = dir.join("antigravity-ide.cmd");
            if c1.exists() {
                return Some(c1);
            }
            let c2 = dir.join("antigravity-ide");
            if c2.exists() {
                return Some(c2);
            }
        }
    }
    None
}

/// Locates Antigravity executable via Windows Registry (App Paths, Classes, Uninstall)
fn find_antigravity_from_registry() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let queries = [
            r#"HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\Antigravity IDE.exe"#,
            r#"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Antigravity IDE.exe"#,
            r#"HKCU\Software\Classes\Applications\Antigravity IDE.exe\shell\open\command"#,
            r#"HKLM\SOFTWARE\Classes\Applications\Antigravity IDE.exe\shell\open\command"#,
        ];
        for q in &queries {
            if let Ok(output) = std::process::Command::new("reg")
                .args(&["query", q, "/ve"])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
            {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout);
                    for line in text.lines() {
                        if line.contains("REG_SZ") {
                            let parts: Vec<&str> = line.split("REG_SZ").collect();
                            if parts.len() > 1 {
                                let mut raw = parts[1].trim();
                                if raw.starts_with('"') {
                                    if let Some(end) = raw[1..].find('"') {
                                        raw = &raw[1..=end];
                                    }
                                }
                                let p = std::path::PathBuf::from(raw);
                                if p.exists() {
                                    return Some(p);
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

/// Locates the Antigravity IDE GUI executable or CLI launcher on Windows.
pub fn find_antigravity_executable() -> Option<std::path::PathBuf> {
    // 1. Check LOCALAPPDATA standard install locations
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let candidates = [
            std::path::PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Antigravity IDE")
                .join("Antigravity IDE.exe"),
            std::path::PathBuf::from(&local_app_data)
                .join("Programs")
                .join("antigravity")
                .join("antigravity.exe"),
            std::path::PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Antigravity")
                .join("Antigravity.exe"),
            std::path::PathBuf::from(&local_app_data)
                .join("Programs")
                .join("Antigravity IDE")
                .join("bin")
                .join("antigravity-ide.cmd"),
            std::path::PathBuf::from(&local_app_data)
                .join("Programs")
                .join("antigravity")
                .join("bin")
                .join("antigravity.cmd"),
        ];
        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
    }

    // 2. Check USERPROFILE
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = std::path::PathBuf::from(&user_profile)
            .join("AppData")
            .join("Local")
            .join("Programs")
            .join("Antigravity IDE")
            .join("Antigravity IDE.exe");
        if p.exists() {
            return Some(p);
        }
    }

    // 3. Check ProgramFiles
    if let Ok(pf) = std::env::var("ProgramFiles") {
        let candidates = [
            std::path::PathBuf::from(&pf)
                .join("Antigravity IDE")
                .join("Antigravity IDE.exe"),
            std::path::PathBuf::from(&pf)
                .join("antigravity")
                .join("antigravity.exe"),
            std::path::PathBuf::from(&pf)
                .join("Antigravity")
                .join("Antigravity.exe"),
            std::path::PathBuf::from(&pf)
                .join("Antigravity IDE")
                .join("bin")
                .join("antigravity-ide.cmd"),
        ];
        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
    }

    // 4. Check ProgramFiles(x86)
    if let Ok(pfx86) = std::env::var("ProgramFiles(x86)") {
        let candidates = [
            std::path::PathBuf::from(&pfx86)
                .join("Antigravity IDE")
                .join("Antigravity IDE.exe"),
            std::path::PathBuf::from(&pfx86)
                .join("antigravity")
                .join("antigravity.exe"),
            std::path::PathBuf::from(&pfx86)
                .join("Antigravity")
                .join("Antigravity.exe"),
        ];
        for c in &candidates {
            if c.exists() {
                return Some(c.clone());
            }
        }
    }

    // 5. Check Windows Registry
    if let Some(reg_path) = find_antigravity_from_registry() {
        if reg_path.exists() {
            return Some(reg_path);
        }
    }

    // 6. Check PATH environment variable
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let names = [
                "Antigravity IDE.exe",
                "antigravity.exe",
                "antigravity-ide.cmd",
                "antigravity.cmd",
                "agy.cmd",
                "agy.exe",
                "antigravity-ide",
            ];
            for name in &names {
                let p = dir.join(name);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 7. Fallback to CLI finder
    find_antigravity_cli_path()
}

/// Automatically launches Antigravity IDE (if closed) and waits for its top-level window to initialize.
/// Returns the newly opened HWND, or None if launch failed/timed out.
pub fn launch_antigravity_ide(
    workspace_dir: Option<&str>,
    project_filter: Option<&str>,
) -> Option<isize> {
    crate::log::line(format!(
        "launch_antigravity_ide: attempting to launch IDE (workspace_dir={:?}, project_filter={:?})",
        workspace_dir, project_filter
    ));

    let exe_path = match find_antigravity_executable() {
        Some(p) => p,
        None => {
            crate::log::line("launch_antigravity_ide: no Antigravity executable found on system");
            return None;
        }
    };
    crate::log::line(format!(
        "launch_antigravity_ide: found executable at {:?}",
        exe_path
    ));

    let is_cmd = exe_path
        .extension()
        .map_or(false, |ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"));

    let mut cmd = if is_cmd {
        let mut c = std::process::Command::new("cmd.exe");
        c.arg("/c").arg(&exe_path);
        c
    } else {
        std::process::Command::new(&exe_path)
    };

    if let Some(dir) = workspace_dir {
        if !dir.trim().is_empty() && std::path::Path::new(dir).exists() {
            cmd.arg(dir);
        }
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if is_cmd {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
    }

    match cmd.spawn() {
        Ok(child) => {
            crate::log::line(format!(
                "launch_antigravity_ide: process spawned successfully (pid={})",
                child.id()
            ));
        }
        Err(err) => {
            crate::log::line(format!("launch_antigravity_ide: failed to spawn process: {err}"));
            return None;
        }
    }

    // Wait for the window to appear (up to 20 seconds)
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(20);
    let poll_interval = std::time::Duration::from_millis(300);

    let mut discovered_hwnd: Option<isize> = None;
    while start.elapsed() < timeout {
        std::thread::sleep(poll_interval);
        if let Some(h) = find_antigravity_window(None, project_filter)
            .or_else(|| find_antigravity_window(None, None))
        {
            if is_window_valid(h) {
                discovered_hwnd = Some(h);
                break;
            }
        }
    }

    if let Some(hwnd) = discovered_hwnd {
        crate::log::line(format!(
            "launch_antigravity_ide: discovered newly opened IDE window 0x{:X} after {:.2}s",
            hwnd,
            start.elapsed().as_secs_f64()
        ));
        // Give Electron webview, workbench, and chat extension time to finish mounting and registering hotkeys
        std::thread::sleep(std::time::Duration::from_millis(2500));
        Some(hwnd)
    } else {
        crate::log::line("launch_antigravity_ide: timed out waiting for Antigravity IDE window");
        None
    }
}

/// Checks if a UI Automation element is an open code editor / document buffer (e.g. Monaco Editor, README.md, etc.)
pub fn is_element_an_editor(el: &windows::Win32::UI::Accessibility::IUIAutomationElement) -> bool {
    use windows::Win32::UI::Accessibility::UIA_DocumentControlTypeId;

    unsafe {
        // 1. Check control type - Monaco text editor is always a Document control (50030)
        if let Ok(ctype) = el.CurrentControlType() {
            if ctype == UIA_DocumentControlTypeId {
                return true;
            }
        }

        // 2. Check class name for monaco / editor
        if let Ok(cname) = el.CurrentClassName() {
            let s = cname.to_string().to_lowercase();
            if s.contains("monaco") || s.contains("editor") {
                return true;
            }
        }

        // 3. Check name for active file or document markers
        if let Ok(name) = el.CurrentName() {
            let s = name.to_string().to_lowercase();
            let extensions = [
                ".md", ".rs", ".ts", ".js", ".tsx", ".jsx", ".py", ".json",
                ".toml", ".html", ".css", ".scss", ".c", ".cpp", ".h",
                ".java", ".go", ".txt", ".yml", ".yaml", ".xml", ".sh", ".ps1", ".sql",
            ];
            for ext in &extensions {
                if s.ends_with(ext)
                    || s.contains(&format!("{ext} "))
                    || s.contains(&format!("{ext},"))
                    || s.contains(&format!("{ext} -"))
                    || s.contains(&format!("{ext} —"))
                {
                    return true;
                }
            }
            if s.contains("editor content") || s.contains("cursor at") || s.contains("line ") {
                return true;
            }
        }
    }

    false
}

/// Checks if a UI Automation element is positively identified as the Antigravity chat input box.
pub fn is_element_chat_input(el: &windows::Win32::UI::Accessibility::IUIAutomationElement) -> bool {
    use windows::Win32::UI::Accessibility::{UIA_ComboBoxControlTypeId, UIA_EditControlTypeId};

    if is_element_an_editor(el) {
        return false;
    }

    unsafe {
        let is_input_type = match el.CurrentControlType() {
            Ok(ctype) => ctype == UIA_ComboBoxControlTypeId || ctype == UIA_EditControlTypeId,
            Err(_) => false,
        };

        let name = el.CurrentName().map(|n| n.to_string().to_lowercase()).unwrap_or_default();
        let is_chat_name = name.contains("message input")
            || name.contains("chat input")
            || name.contains("ask")
            || name.contains("chat")
            || name.contains("prompt")
            || name.contains("agent");

        is_input_type && (is_chat_name || name.is_empty())
    }
}

/// Searches for the Antigravity IDE chat input textarea via Windows UI Automation,
/// calls SetFocus() directly on the element to ensure focus leaves the terminal/editor,
/// and returns the physical screen center coordinates (X, Y) of the element for synthetic mouse activation.
pub fn find_and_focus_chat_input_via_uia(target_hwnd: HWND) -> Option<(i32, i32)> {
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
    use windows::Win32::System::Variant::{VariantInit, VT_BSTR, VT_I4};
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, TreeScope_Descendants,
        UIA_ComboBoxControlTypeId, UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_NamePropertyId,
    };
    use windows::core::BSTR;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let uia: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;

        let mut win_rect = windows::Win32::Foundation::RECT::default();
        let _ = GetWindowRect(target_hwnd, &mut win_rect);
        let _win_w = win_rect.right - win_rect.left;
        let _win_h = win_rect.bottom - win_rect.top;

        // 1. First fast check: Is the chat input already focused?
        // Note: Strict protection against code editors! Never accept an editor element here.
        if let Ok(focused) = uia.GetFocusedElement() {
            if is_element_an_editor(&focused) {
                crate::log::line(
                    "find_and_focus_chat_input_via_uia: active focused element is code editor, bypassing fast check"
                );
            } else if is_element_chat_input(&focused) {
                if let Ok(rect) = focused.CurrentBoundingRectangle() {
                    if rect.right > rect.left && rect.bottom > rect.top {
                        let cx = rect.left + (rect.right - rect.left) / 2;
                        let cy = rect.top + (rect.bottom - rect.top) / 2;
                        crate::log::line(format!(
                            "find_and_focus_chat_input_via_uia: active focused element is verified chat input at ({cx}, {cy})"
                        ));
                        return Some((cx, cy));
                    }
                }
            }
        }

        // 2. Search root element tree
        let root = uia.ElementFromHandle(target_hwnd).ok()?;

        // Condition 1: ControlType == ComboBox
        let mut var_type = VariantInit();
        (*var_type.Anonymous.Anonymous).vt = VT_I4;
        (*var_type.Anonymous.Anonymous).Anonymous.lVal = UIA_ComboBoxControlTypeId.0 as i32;
        let cond_combo = uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &var_type).ok()?;

        // Condition 2: Name == "Message input"
        let mut var_name = VariantInit();
        (*var_name.Anonymous.Anonymous).vt = VT_BSTR;
        let bstr = BSTR::from("Message input");
        (*var_name.Anonymous.Anonymous).Anonymous.bstrVal = std::mem::ManuallyDrop::new(bstr);
        let cond_name = uia.CreatePropertyCondition(UIA_NamePropertyId, &var_name).ok()?;

        let and_cond = uia.CreateAndCondition(&cond_combo, &cond_name).ok()?;

        // Strategy A: Exact ComboBox with Name == "Message input"
        let mut candidate_el = root.FindFirst(TreeScope_Descendants, &and_cond).ok();

        // Strategy B: Edit control with Name == "Message input"
        if candidate_el.is_none() {
            let mut var_edit = VariantInit();
            (*var_edit.Anonymous.Anonymous).vt = VT_I4;
            (*var_edit.Anonymous.Anonymous).Anonymous.lVal = UIA_EditControlTypeId.0 as i32;
            if let Ok(cond_edit) = uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &var_edit) {
                if let Ok(and_edit_cond) = uia.CreateAndCondition(&cond_edit, &cond_name) {
                    candidate_el = root.FindFirst(TreeScope_Descendants, &and_edit_cond).ok();
                }
            }
        }

        // Strategy C: Any ComboBox that is not an editor
        if candidate_el.is_none() {
            if let Ok(combo_el) = root.FindFirst(TreeScope_Descendants, &cond_combo) {
                if !is_element_an_editor(&combo_el) {
                    candidate_el = Some(combo_el);
                }
            }
        }

        if let Some(el) = candidate_el {
            if !is_element_an_editor(&el) {
                // Explicitly transfer keyboard focus to the chat input via UI Automation
                let _ = el.SetFocus();
                std::thread::sleep(std::time::Duration::from_millis(30));
                if let Ok(rect) = el.CurrentBoundingRectangle() {
                    if rect.right > rect.left && rect.bottom > rect.top {
                        let cx = rect.left + (rect.right - rect.left) / 2;
                        let cy = rect.top + (rect.bottom - rect.top) / 2;
                        crate::log::line(format!(
                            "find_and_focus_chat_input_via_uia: focused verified chat input at ({cx}, {cy}), bounds [{}, {}, {}, {}]",
                            rect.left, rect.top, rect.right, rect.bottom
                        ));
                        return Some((cx, cy));
                    }
                }
            }
        }
    }
    None
}

/// Injects prompt into the active Antigravity IDE chat input:
/// 1. Backs up user's original clipboard content and cursor position.
/// 2. Places prompt into Windows Clipboard.
/// 3. Locates the target Antigravity IDE window and restores it if minimized.
/// 4. Targets the chat input box located in the Secondary Side Bar (bottom-right of IDE window).
/// 5. Focuses chat input via Ctrl+L (antigravity.toggleChatFocus) to leave terminal/editor completely.
/// 6. Clicks the input textarea (ensuring caret is in the webview).
/// 7. Sends Ctrl+A, Ctrl+V, and Enter to paste and submit the prompt to the Antigravity Agent.
/// 8. Restores the user's original mouse position and foreground window.
/// 9. Restores original clipboard content asynchronously after dispatch.
pub fn inject_prompt_to_ide(hwnd_val: isize, prompt: &str) -> bool {
    ensure_default_desktop();
    // 1. Resolve target Antigravity IDE window handle
    let target_hwnd = if hwnd_val != 0 && is_window_valid(hwnd_val) {
        HWND(hwnd_val as *mut _)
    } else if let Some(found_hwnd) = find_antigravity_window(None, None) {
        HWND(found_hwnd as *mut _)
    } else if let Some(launched_hwnd) = launch_antigravity_ide(None, None) {
        HWND(launched_hwnd as *mut _)
    } else {
        crate::log::line("inject_prompt_to_ide: no valid Antigravity IDE window found and auto-launch failed");
        let _ = set_clipboard_text(prompt);
        return false;
    };

    unsafe {
        if !IsWindow(Some(target_hwnd)).as_bool() {
            crate::log::line("inject_prompt_to_ide: target window is not a valid window");
            let _ = set_clipboard_text(prompt);
            return false;
        }

        // 2. Capture user state
        let original_clipboard = get_clipboard_text();
        let mut original_cursor = POINT::default();
        let _ = GetCursorPos(&mut original_cursor);
        let _prev_foreground = GetForegroundWindow();

        // 3. Put prompt into clipboard
        if !set_clipboard_text(prompt) {
            crate::log::line("inject_prompt_to_ide: failed to set clipboard text");
            return false;
        }

        // Set thread DPI awareness context to Per-Monitor V2 so SetCursorPos matches physical coordinates
        let prev_dpi = SetThreadDpiAwarenessContext(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2

        // 4. If minimized, restore so controls and message loop are active
        let was_iconic = IsIconic(target_hwnd).as_bool();
        if was_iconic {
            let _ = ShowWindow(target_hwnd, SW_RESTORE);
            std::thread::sleep(std::time::Duration::from_millis(120));
        } else {
            let _ = ShowWindow(target_hwnd, SW_SHOW);
        }

        // 5. Attach thread inputs for reliable focus activation across processes
        let cur_thread = GetCurrentThreadId();
        let fg_hwnd = GetForegroundWindow();
        let fg_thread = if fg_hwnd.0 as isize != 0 {
            GetWindowThreadProcessId(fg_hwnd, None)
        } else {
            0
        };
        let target_thread = GetWindowThreadProcessId(target_hwnd, None);

        // Attach to BOTH foreground thread (e.g. Chrome, Explorer) and target thread
        if fg_thread != 0 && fg_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, fg_thread, true);
        }
        if target_thread != 0 && target_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, target_thread, true);
        }

        let _ = AllowSetForegroundWindow(0xFFFFFFFF); // ASFW_ANY

        // Pulse Alt key (VK_MENU) to bypass Windows foreground lock
        keybd_event(VK_MENU.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);

        // Physically bring window to the top of Z-order above all other windows
        SwitchToThisWindow(target_hwnd, true.into());
        let _ = SetWindowPos(
            target_hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        let _ = BringWindowToTop(target_hwnd);
        let _ = SetForegroundWindow(target_hwnd);

        // Ensure target window is foreground with small retry loop
        for _ in 0..5 {
            if GetForegroundWindow() == target_hwnd {
                break;
            }
            SwitchToThisWindow(target_hwnd, true.into());
            let _ = SetForegroundWindow(target_hwnd);
            std::thread::sleep(std::time::Duration::from_millis(30));
        }

        // Release any stuck modifier keys
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_LWIN.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(30));

        // 6. NATIVE FOCUS COMMAND: Send Ctrl + L (antigravity.toggleChatFocus, primary: 2090)
        // This unconditionally shifts keyboard focus from the integrated terminal or editor
        // directly into the Antigravity Agent chat input box, guaranteed!
        keybd_event(VK_CONTROL.0 as u8, 0, Default::default(), 0);
        keybd_event(b'L', 0, Default::default(), 0);
        keybd_event(b'L', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(80));

        // 7. Verify/focus via UI Automation
        let uia_coords = find_and_focus_chat_input_via_uia(target_hwnd);

        let (target_x, target_y) = if let Some((cx, cy)) = uia_coords {
            crate::log::line(format!(
                "inject_prompt_to_ide: UIA focus succeeded on verified chat input at ({cx}, {cy})"
            ));
            (cx, cy)
        } else {
            // SAFETY SHIELD #1: If UIA could not verify the chat input element,
            // check what currently has focus! If a code editor / document has focus,
            // ABORT IMMEDIATELY to prevent overwriting or typing into the file!
            use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
            use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            if let Ok(uia) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                if let Ok(focused) = uia.GetFocusedElement() {
                    if is_element_an_editor(&focused) {
                        crate::log::line(
                            "inject_prompt_to_ide: SAFETY ABORT - code editor has focus and chat input was not verified. Aborting keystrokes to protect file!"
                        );
                        if fg_thread != 0 && fg_thread != cur_thread {
                            let _ = AttachThreadInput(cur_thread, fg_thread, false);
                        }
                        if target_thread != 0 && target_thread != cur_thread {
                            let _ = AttachThreadInput(cur_thread, target_thread, false);
                        }
                        if prev_dpi != 0 {
                            let _ = SetThreadDpiAwarenessContext(prev_dpi);
                        }
                        let _ = set_clipboard_text(prompt);
                        return false;
                    }
                }
            }

            // Fallback: calibrated geometric calculation
            let mut rect = windows::Win32::Foundation::RECT::default();
            let _ = GetWindowRect(target_hwnd, &mut rect);
            let win_w = rect.right - rect.left;
            let win_h = rect.bottom - rect.top;

            if win_w < 300 || win_h < 200 {
                crate::log::line("inject_prompt_to_ide: target window rect is too small");
                if fg_thread != 0 && fg_thread != cur_thread {
                    let _ = AttachThreadInput(cur_thread, fg_thread, false);
                }
                if target_thread != 0 && target_thread != cur_thread {
                    let _ = AttachThreadInput(cur_thread, target_thread, false);
                }
                if prev_dpi != 0 {
                    let _ = SetThreadDpiAwarenessContext(prev_dpi);
                }
                return false;
            }

            // Query real-time monitor DPI for this window (e.g. 96=100%, 120=125%, 144=150%, 192=200%)
            let dpi = GetDpiForWindow(target_hwnd);
            let scale = if dpi > 0 { (dpi as f64) / 96.0 } else { 1.25 };

            // Horizontal offset from window right border into Secondary Side Bar chat input:
            let h_offset = ((150.0 * scale).round() as i32).clamp(120, (win_w / 2).max(120));
            let gx = rect.right - h_offset;

            // Vertical offset from window bottom into chat textarea:
            let v_offset = ((103.0 * scale).round() as i32).clamp(
                (80.0 * scale).round() as i32,
                (150.0 * scale).round() as i32,
            );
            let gy = rect.bottom - v_offset;

            crate::log::line(format!(
                "inject_prompt_to_ide: calibrated geometric target at ({gx}, {gy}) in rect [{}, {}, {}, {}] (scale={:.2})",
                rect.left, rect.top, rect.right, rect.bottom, scale
            ));
            (gx, gy)
        };

        // 8. Click directly into the chat input textarea to activate caret in webview
        let _ = SetCursorPos(target_x, target_y);
        std::thread::sleep(std::time::Duration::from_millis(40));
        // Click 1: activates frame/webview
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(25));
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(35));
        // Click 2: focuses the input textarea element
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(25));
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(35));
        // Click 3: ensures caret is inside the text input
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(25));
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
        std::thread::sleep(std::time::Duration::from_millis(60));

        // SAFETY SHIELD #2: Verify focus after clicks, BEFORE sending ANY keystrokes!
        // If focus landed on a code editor / document, ABORT IMMEDIATELY!
        use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED};
        use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation};
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Ok(uia) = CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
            if let Ok(post_click_focused) = uia.GetFocusedElement() {
                if is_element_an_editor(&post_click_focused) {
                    crate::log::line(
                        "inject_prompt_to_ide: SAFETY ABORT - click landed on code editor! Aborting Ctrl+A / Ctrl+V to prevent modifying file!"
                    );
                    let _ = SetCursorPos(original_cursor.x, original_cursor.y);
                    if fg_thread != 0 && fg_thread != cur_thread {
                        let _ = AttachThreadInput(cur_thread, fg_thread, false);
                    }
                    if target_thread != 0 && target_thread != cur_thread {
                        let _ = AttachThreadInput(cur_thread, target_thread, false);
                    }
                    if prev_dpi != 0 {
                        let _ = SetThreadDpiAwarenessContext(prev_dpi);
                    }
                    let _ = set_clipboard_text(prompt);
                    return false;
                }
            }
        }

        // Release modifier keys again before dispatching keystrokes
        keybd_event(VK_MENU.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_SHIFT.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);

        // 9. Select all in case there is existing text (Ctrl + A)
        keybd_event(VK_CONTROL.0 as u8, 0, Default::default(), 0);
        keybd_event(b'A', 0, Default::default(), 0);
        keybd_event(b'A', 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(40));

        // 10. Paste user's prompt (Ctrl + V)
        keybd_event(VK_CONTROL.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_V.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_V.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(100));

        // 11. Submit prompt to agent (Enter)
        keybd_event(VK_RETURN.0 as u8, 0, Default::default(), 0);
        keybd_event(VK_RETURN.0 as u8, 0, KEYEVENTF_KEYUP, 0);
        std::thread::sleep(std::time::Duration::from_millis(150));

        // 12. Restore user's mouse cursor immediately
        let _ = SetCursorPos(original_cursor.x, original_cursor.y);

        // 13. Detach thread inputs
        if fg_thread != 0 && fg_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, fg_thread, false);
        }
        if target_thread != 0 && target_thread != cur_thread {
            let _ = AttachThreadInput(cur_thread, target_thread, false);
        }

        // 14. Restore previous DPI context
        if prev_dpi != 0 {
            let _ = SetThreadDpiAwarenessContext(prev_dpi);
        }

        // 15. Ghost Mode Minimization vs Foreground Preservation:
        // ONLY minimize back to taskbar if the IDE was genuinely minimized (iconic) before prompt injection.
        // If the IDE was already open/visible on the desktop (!was_iconic), leave it open and focused in the foreground!
        if was_iconic {
            std::thread::sleep(std::time::Duration::from_millis(150));
            let _ = ShowWindow(target_hwnd, SW_MINIMIZE);
            if _prev_foreground.0 as isize != 0
                && IsWindow(Some(_prev_foreground)).as_bool()
                && _prev_foreground != target_hwnd
            {
                SwitchToThisWindow(_prev_foreground, true.into());
                let _ = SetForegroundWindow(_prev_foreground);
            }
        } else {
            // Target was already open on screen - keep it in the foreground!
            SwitchToThisWindow(target_hwnd, true.into());
            let _ = SetForegroundWindow(target_hwnd);
        }

        // 16. Restore original clipboard after safe delay (allowing Electron to finish reading)
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            if let Some(ref prev_clip) = original_clipboard {
                let _ = set_clipboard_text(prev_clip);
            }
        });

        crate::log::line("inject_prompt_to_ide: prompt successfully injected and submitted");
        true
    }
}

#[allow(dead_code)]
pub fn inject_prompt_to_ide_silent(hwnd_val: isize, prompt: &str) -> bool {
    inject_prompt_to_ide(hwnd_val, prompt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_project_name_preserves_hyphenated_project() {
        // VS Code / Antigravity IDE title: [file] - [project] - [app]
        let name = extract_project_name("coucou-main - Antigravity IDE - README.md", None);
        assert_eq!(name, "coucou-main");

        let name2 = extract_project_name("README.md — coucou-main — Antigravity IDE", None);
        assert_eq!(name2, "coucou-main");

        let name3 = extract_project_name("● lib.rs — coucou-main — Antigravity IDE", None);
        assert_eq!(name3, "coucou-main");

        let name4 = extract_project_name("coucou-main - Antigravity IDE", None);
        assert_eq!(name4, "coucou-main");

        let name5 = extract_project_name("coucou-main (Workspace) - Antigravity IDE", None);
        assert_eq!(name5, "coucou-main");
    }

    #[test]
    fn test_extract_project_name_filters_files() {
        assert_eq!(
            extract_project_name("minibagry - Antigravity IDE - scraper.py", None),
            "minibagry"
        );
        assert_eq!(
            extract_project_name("scraper.py — minibagry — Antigravity IDE", None),
            "minibagry"
        );
        assert_eq!(
            extract_project_name("Welcome - coucou-main - Antigravity IDE", None),
            "coucou-main"
        );
        assert_eq!(
            extract_project_name("Cargo.toml - coucou-main - Antigravity IDE", None),
            "coucou-main"
        );
    }

    #[test]
    fn test_extract_project_name_with_cwd() {
        assert_eq!(
            extract_project_name(
                "README.md - Antigravity IDE",
                Some("C:\\Users\\retar\\Downloads\\coucou-main")
            ),
            "coucou-main"
        );
        assert_eq!(
            extract_project_name("", Some("/home/user/workspace/minibagry")),
            "minibagry"
        );
    }

    #[test]
    fn test_split_title_parts_does_not_break_hyphens_in_names() {
        let parts = split_title_parts("coucou-main - Antigravity IDE - README.md");
        assert_eq!(parts, vec!["coucou-main", "Antigravity IDE", "README.md"]);

        let parts_em = split_title_parts("README.md — coucou-main — Antigravity IDE");
        assert_eq!(parts_em, vec!["README.md", "coucou-main", "Antigravity IDE"]);
    }

    #[test]
    fn test_is_settings_window_filters_settings_exception() {
        assert!(is_settings_window("Settings - Antigravity IDE", "Settings"));
        assert!(is_settings_window("Settings — Coucou", "Settings"));
        assert!(is_settings_window("Settings", "Settings"));
        assert!(is_settings_window("Nastavení - Antigravity IDE", "Nastavení"));
        assert!(is_settings_window("Preferences - Antigravity IDE", "Preferences"));

        // Regular project windows must NOT be marked as settings
        assert!(!is_settings_window("coucou-main - Antigravity IDE", "coucou-main"));
        assert!(!is_settings_window("minibagry - Antigravity IDE", "minibagry"));
        // An active project with settings tab open should still be considered the project, not standalone settings
        assert!(!is_settings_window("Settings - coucou-main - Antigravity IDE", "coucou-main"));
    }

    #[test]
    fn test_is_ide_process_distinguishes_browsers_from_ides() {
        // Browsers must always be rejected even if tab mentions Antigravity
        assert!(!is_ide_process("c:\\program files\\google\\chrome\\application\\chrome.exe"));
        assert!(!is_ide_process("c:\\program files (x86)\\microsoft\\edge\\application\\msedge.exe"));
        assert!(!is_ide_process("c:\\program files\\mozilla firefox\\firefox.exe"));
        assert!(!is_ide_process("c:\\windows\\explorer.exe"));

        // IDE processes must be accepted
        assert!(is_ide_process("c:\\users\\user\\appdata\\local\\programs\\antigravity ide\\antigravity ide.exe"));
        assert!(is_ide_process("c:\\users\\user\\appdata\\local\\programs\\antigravity\\antigravity.exe"));
        assert!(is_ide_process("c:\\users\\user\\appdata\\local\\programs\\microsoft vs code\\code.exe"));
        assert!(is_ide_process("c:\\users\\user\\appdata\\local\\programs\\cursor\\cursor.exe"));
    }

    #[test]
    fn test_uia_symbols() {
        if let Some(hwnd_val) = find_antigravity_window(None, None) {
            let target_hwnd = HWND(hwnd_val as *mut _);
            let coords = find_and_focus_chat_input_via_uia(target_hwnd);
            assert!(coords.is_some());
        }
    }

    #[test]
    fn test_find_antigravity_executable() {
        let exe = find_antigravity_executable();
        if let Some(ref p) = exe {
            println!("Found Antigravity executable: {:?}", p);
            assert!(p.exists(), "Discovered path must exist on disk");
        }
    }

    #[test]
    fn test_find_antigravity_cli_path() {
        let cli = find_antigravity_cli_path();
        if let Some(ref p) = cli {
            println!("Found Antigravity CLI script: {:?}", p);
            assert!(p.exists(), "Discovered CLI path must exist on disk");
        }
    }
}









