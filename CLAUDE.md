# Antigravity Pet (Windows) — Master Technical Context & Handoff Guide

> **Target Agent:** Claude 3.7 Sonnet / Claude Connect / Antigravity Agent / Any Future AI Developer  
> **Goal:** Zero token waste & zero guesswork. Every architectural decision, directory mapping, IPC contract, Win32 mechanic, test workflow, safety guard, and design pattern in this repository is thoroughly documented here. You can act immediately without exploratory tool calls.

---

## 1. Project Overview & Business Goal

**Antigravity Pet** (Coucou for Windows) is an ultra-lightweight (~25–35 MB RAM, **0.0% CPU when idle**) desktop AI companion (Shimeji style) for Windows 10/11 built specifically for **Google Antigravity IDE**.

### Core Capabilities:
- **8 Retro 8-bit Pixel-Art Mascots:** Panda, Penguin, Cat, Elephant, Fox, Monkey, Dog, Tiger. Rendered dynamically via 20x20 matrix generators on an HTML5 canvas with crisp nearest-neighbor scaling.
- **Multi-Pet Engine (Strict 1:1 Lifecycle with Antigravity IDE Windows):**
  - **0 IDE Windows = 0 Desktop Mascots:** When starting Coucou without an open Antigravity IDE, exactly 0 mascots are spawned. The transparent canvas stays 100% click-through with zero visual clutter.
  - **Automatic Spawning on Open:** Opening an Antigravity IDE window immediately spawns its assigned companion, which greets the user (*"👋 Ahoj! Jsem tvůj pomocník [zvířátko] pro [projekt]!"*).
  - **Multi-Window 1:1 Mapping:** Each additional IDE window gets its own distinct mascot companion (Panda, Penguin, Dog, Tiger, etc.) with a dedicated project tag.
  - **Clean Exit on Window Close:** When an IDE window is closed, its mascot waves goodbye (*"👋 Měj se hezky! Relace ukončena..."*), sparkles, fades out, and is cleanly destroyed. When the last window is closed, exactly 0 mascots remain on desktop.
- **Headless Agent & Ghost Mode (Stealth Background Prompt Injection):**
  - Submitting prompts from the desktop mascot chat overlay injects directly into the Antigravity agent (Ctrl+L, Ctrl+V, Enter).
  - If the IDE is minimized or behind other apps (`was_iconic || _prev_foreground != target_hwnd`), it immediately minimizes back to the taskbar (`ShowWindow(target_hwnd, SW_MINIMIZE)`) within ~150ms and restores the user's previous foreground window/focus.
  - The user can prompt their AI agent seamlessly while working in Chrome, terminals, or other apps without the IDE popping up over their screen.
  - **Double-Click to Focus:** Double-clicking any pet intentionally restores and focuses that specific Antigravity IDE window to the foreground (`focusIdeWindow` / `restore_and_focus`).
- **Settings Window Exception & Preservation:** Opening Settings (in IDE, detached tab, or Coucou settings window) **never** spawns a "setting" mascot, never overwrites an existing pet project tag, and never removes the pet.
- **Clear Multi-Window Project Attribution:**
  1. Non-interactive name tag docked under feet: `[● Panda x 📁 coucou-main]`.
  2. Native hover tooltip: `Panda x Propojeno s: 📁 coucou-main (Dvojklik pro zaměření okna)`.
  3. Double-click announcement bubble: "🎯 Okno: coucou-main".
  4. Chat overlay header project badge and subtitle.
  5. Fallback numbering (`Okno #1`, `Okno #2`) if project name is pending.
- **Autonomous Quirky Activities (Calm 28-60s pacing, extended 6-8.5s durations):** While idle, companions live their own lives with custom pixel animations, developer humor and Web Audio synthesis:
  - Music & Groove Dance (`state-dance`): ~8.2s with retro headphones, cyan palette, and full 8-bar chiptune beat (`Sound.playMusicBeat(7.5)`).
  - Whistling Walk (`startWhistling`): ~6.0s stroll with a two-phrase whistling tune with realistic vibrato (`Sound.playWhistle()`).
  - Coffee Break (`state-coffee`): ~7.8s with two cartoon sips (`Sound.playSip()`), rising steam.
  - Power Nap (`state-sleep`): ~8.2s with Zzz sparkles floating up (5 cycles), gentle chime, and wake-up yawn.
  - Gym Stretch (`state-stretch`): ~7.5s with posture/back reminders, deep stretch cycles, pops.
  - Snack Time (`state-snack`): ~7.8s with two crunchy munches (`Sound.playMunch()`) tailored to each animal.
  - Bug Hunt: ~7.0s with suspenseful stalking and triumphant squash.
  - Sneeze: ~5.5s with comic tickle and cartoon sneeze. **Preempted immediately** if agent starts working.
  - Walking: ~5-9s natural stroll.
- **Immediate Task Preemption & Sound Muting:** As soon as an agent action arrives (`PreToolUse`, `PreInvocation`) or the pet is dragged, any idle activity and background music/whistling is silenced immediately (`Sound.stopAllMelodies()`) and the companion starts coding on its laptop.
- **Manual Mascot Switching:** `R` or `Space` hotkey, middle-click on mascot body, dice button in chat header, or clicking the mascot avatar.
- **Hover Greeting Animation:** Hovering over a mascot triggers a cheerful hop, wave, and friendly greeting sound.
- **Non-Interactive Tags (`.pet-tag`):** Styled with `pointer-events: none; user-select: none;` so clicking the tag passes through directly to the pet or underlying desktop.
- **Full Real-Time Conversation Mirror:** Floating centered glassmorphism drawer (`C` hotkey or right-click) completely mirrors the entire conversation history directly from Antigravity IDE (`transcript.jsonl`), with rich Markdown rendering (headings, lists, blockquotes, code cards with 1-click copy), smart scrolling, and live background sync.
- **Ghost Mode / Silent Background Prompt Injection:** Dispatches prompts directly into Antigravity IDE on the background without stealing focus. User's active application window (e.g. Chrome) and clipboard are fully preserved.
- **Focus Mode (`H` hotkey or tray):** Collapses mascots into an unobtrusive 4px glowing status indicator dot positioned directly on the taskbar edge.
- **Transparent Click-Through Canvas:** Fullscreen borderless overlay (`island.rs`) where only mascots, focus dots, and open chat overlays capture mouse events (`WS_EX_TRANSPARENT` via `set_island_rects`).
- **Interactive Diagnostics Drawer:** Live report showing HWND, PID, Named Pipe status, and event stream with one-click markdown clipboard export.

### Performance & Resource Profile:
| Metric | Specification | Realized Value |
| :--- | :--- | :--- |
| **Idle CPU Usage** | Strict 0.0% | `0.0%` (RAF loops cancel on idle, timers purely event-driven) |
| **Idle RAM Usage** | < 40 MB | `~25-35 MB` (Tauri WebView2 + Rust backend combined) |
| **GPU Acceleration** | Hardware canvas blitting | Near 0% GPU load (20x20 integer canvas scaling) |
| **Audio Engine** | Web Audio API | Auto-suspends audio context after 1.5s of silence |
| **Cold Start Time** | < 500 ms | `~220 ms` |

---

## 2. Complete Directory Layout & File Roles

All active development takes place inside `./windows/`:

```text
windows/
+-  package.json                 # npm scripts (test, build, dev, icons, pack)
+-  tsconfig.json                # TypeScript compiler configuration (strict mode)
+-  vite.config.ts               # Vite 6 bundler config (multi-page: island & settings)
+-  test-antigravity-events.ps1  # Integration test script for Named Pipe & multi-bot events
|
+-  scripts/
|   +-  test_multi_pet.mjs       # Unit test suite (13 tests): multi-pet, attribution, mirror, settings, safeguards, SessionEnd protection
|   +-  gen-icons.mjs            # ICO/PNG asset generator for Windows tray & app icons
|   +-  pack.mjs                 # Post-build distribution bundler
|
+-  src/
|   +-  main.ts                  # Multi-pet registry, boot, sound preload, hit-rect push, strict 1:1 lifecycle (0 pets on 0 IDE windows, spawn on open, goodbye on close)
|   +-  style.css                # Base reset and transparent canvas styles
|   |
|   +-  core/
|   |   +-  bridge.ts            # Typed Tauri IPC invokes (setIslandRects, focusIdeWindow, sendIdePrompt, getActiveSessions, etc.)
|   |   +-  dom.ts               # Lightweight DOM helpers (h, svg, clear, dot)
|   |   +-  hooks.ts             # Ingests Antigravity IDE events and updates State
|   |   +-  sound.ts             # Web Audio API engine (8-bit beats, 2-phrase whistling, sips, crunches, naps)
|   |   +-  state.ts             # Reactive state store (tasks, settings, subscriptions)
|   |
|   +-  pet/
|   |   +-  animals.ts           # 8 mascots, 20x20 matrices, extended palettes, PetState enum
|   |   +-  pet.css              # Mascot canvas, drag physics, speech bubbles, 4px focus dot, animations
|   |   +-  pet_settings.ts      # User preferences (9 animation toggles, sound switch, interval presets, tag/bubble visibility)
|   |   +-  shimeji.ts           # Physics, gravity, autonomous activity engine, attribution, badge sanitizer
|   |   +-  chat.css             # Glassmorphism chat overlay, project badges, diagnostics drawer, random dice, settings view
|   |   +-  chat_overlay.ts      # Two-way chat overlay, ask_question handling, project badge, diagnostics drawer, inline settings (⚙️)
|   |
|   +-  settings/
|       +-  main.ts              # Settings UI for sound volume and Antigravity hooks
|       +-  settings.css         # Settings dark theme
|
+-  src-tauri/
|   +-  Cargo.toml               # Minimal dependencies: tauri 2.x, tokio, serde, windows-rs
|   +-  src/
|       +-  lib.rs               # Tauri app builder, commands (prompt dispatch, get_active_sessions, diagnostics), tray
|       +-  island.rs            # Fullscreen transparent overlay, monitor detection, Win32 cursor click-through
|       +-  pet_manager.rs       # Session manager, window monitor (1.5s loop), settings filtering, liveness checks
|       +-  window_finder.rs     # Win32 HWND enumeration, Ghost Mode SW_MINIMIZE, restore_and_focus, auto-launch, 15 unit tests
|       +-  diagnostics.rs       # In-memory diagnostics logger, IDE window tracking, markdown report generator
|       +-  pipe.rs              # Win32 Named Pipe server (\\.\pipe\coucou-<SID>)
|       +-  hooks.rs             # Antigravity hooks config generator (~/.gemini/config/hooks.json)
|       +-  settings.rs          # %APPDATA%\Coucou\settings.json and hook exe path
|       +-  log.rs               # %LOCALAPPDATA%\Coucou\coucou.log logger
|       +-  win_user.rs          # Win32 user SID and system helpers
|
+-  hook/
|   +-  src/main.rs              # coucou-hook.exe relay binary: reads hook JSON on stdin, writes to Named Pipe, extracts transcript messages
|
+-  sounds/                      # WAV sound files (blip, pop, greet, think, work, finish, error, wink, open, close, send, hover)
|
videa/                           # Marketing & Social Video Assets
+-  AntigravityPet_Promo_Trailer.mp4 # 16:9 1080p Widescreen Trailer with 8-bit audio (~22s)
+-  AntigravityPet_TikTok_Shorts.mp4 # 9:16 Vertical Cut for TikTok / Reels / Shorts (~20s)
```

---

## 3. Communication Pipeline & IPC Contracts

```text
[ Antigravity IDE (Gemini CLI / Antigravity 2.0 / IDE Window) ]
                        |
                        v (Lifecycle event: PreInvocation, PreToolUse, PostToolUse, Stop, PostInvocation)
   hooks.json (~/.gemini/config/hooks.json)
                        |
                        v (cmd.exe /c "<path>\coucou-hook.exe" --agent antigravity <Event>)
[ coucou-hook.exe ] (Runs < 50ms, reads stdin JSON, extracts message/questions from transcript, outputs {})
                        |
                        v (Named Pipe: \\.\pipe\coucou-<UserSID>)
[ Coucou Tauri Backend (pipe.rs) ]
                        |
                        v (Tauri IPC event: "hook" & "session-assigned" / "session-updated")
[ WebView Frontend (main.ts -> activePets registry) ]
                        |
                        v
Specific companion animates + speech bubble + chat overlay sync + diagnostics log
```

### 1. Hook Protocol Contract:
- **Hook Config Location:** `C:\Users\<username>\.gemini\config\hooks.json`.
- **Relay Binary Location:** `%LOCALAPPDATA%\Coucou\bin\coucou-hook.exe`.
- **Input (stdin):** Antigravity sends JSON with `conversationId`, `stepIdx`, `toolCall` (`name`, `args`), `workspacePaths`, `transcriptPath`.
- **Output (stdout):** Antigravity requires valid JSON on stdout (`{}`). `coucou-hook.exe` prints `{}` and exits `0`.
- **Transcript Extraction:** When `transcriptPath` is present, `coucou-hook.exe` inspects the last line of `transcript.jsonl` to extract user prompts, assistant responses, or `ask_question` options and renders them in the desktop chat.

### 2. Window Discovery & Project Attribution Loop:
- A background Tokio task runs every 1.5s in `pet_manager.rs`.
- Calls `window_finder::enumerate_all_ide_windows()`, which uses Win32 `EnumWindows`.
- Filters out invisible/utility Electron windows by requiring `width >= 300`, `height >= 200`, and a non-empty window title. Minimized windows (`IsIconic`) remain properly tracked.
- `extract_project_name(title, cwd)` parses the project root name:
  - Authoritative CWD folder basename takes top priority if present.
  - Strips dirty editor markers (`●`, `*`).
  - Splits title cleanly on spaced separators (` - `, ` — `, ` – `, ` | `), preserving hyphenated project names like `coucou-main`.
  - Recognizes `(Workspace)` markers.
  - Filters out application names (`Antigravity`, `Antigravity IDE`, `Visual Studio Code`, `Code`, `Cursor`, `Windsurf`, `Coucou`).
  - Filters out open active files and editor tabs (`README.md`, `lib.rs`, `Welcome`, `Untitled-1`, `Dockerfile`, etc.), ensuring open files NEVER pollute the mascot's project badge.
- When an IDE window title changes (e.g. user opens a new project), `pet_manager.rs` emits `session-updated` with `project_name` and `window_title`, dynamically updating the mascot's tag and chat header.
- **Settings Window Exception & Safeguards:**
  - Standalone Settings windows are skipped in the `else` branch of `sync_active_ide_windows` (`is_settings_window`), preventing spawning a "setting" mascot.
  - For existing pet sessions, switching tabs to Settings does NOT rename the project (`is_settings_name`).
  - Closed window tracking (`to_remove`) verifies `(discovered.iter().any(|d| d.hwnd == h) || is_window_ide_process(h)) && is_window_valid(h)` to ensure that opening settings never marks an existing IDE window as dead.
  - In `main.ts`, both `session-removed` AND `SessionEnd` hook events cleanly remove the mascot (`sayGoodbyeAndClose`, `activePets.delete`), ensuring a strict 1:1 lifecycle: 0 IDE windows = 0 desktop pets.

### 3. Two-Way Prompt Injection Contract (v0.1.2 Rock-Solid UIA Architecture & Ghost Mode):
When a user submits a prompt via the desktop chat overlay (`chat_overlay.ts`):
1. `Bridge.sendIdePrompt(hwnd, text)` calls Tauri command `send_ide_prompt` in `lib.rs` (dispatched asynchronously on a background blocking thread).
2. Rust backend resolves the target HWND (`window_finder::find_antigravity_window` or auto-launches Antigravity executable if not yet open).
3. Backs up user's original clipboard content, mouse cursor position, and foreground window (`_prev_foreground`).
4. Elevates the target Antigravity IDE window (`SetWindowPos HWND_TOP`, `BringWindowToTop`, `SetForegroundWindow`, `AttachThreadInput`, `AllowSetForegroundWindow(0xFFFFFFFF)`, Alt-key pulse).
5. **Direct Windows UI Automation Focus (`find_and_focus_chat_input_via_uia`):**
   - Connects to Windows UI Automation via native COM (`IUIAutomation`, `CUIAutomation`).
   - Searches for the chat textarea ComboBox (`ControlType::ComboBox` with `Name = "Message input"`).
   - Directly calls `el.SetFocus()` on the ComboBox element. This **forcefully transfers OS keyboard focus directly to the Antigravity chat textarea**, completely preventing prompt leakage into previously focused PowerShell terminals or editor tabs!
   - Computes the physical screen center coordinates `(cx, cy)` from `el.CurrentBoundingRectangle()`.
6. **Synthetic Activation & Caret Placement:**
   - Moves mouse to `(cx, cy)` (or DPI-aware geometric fallback if UIA is disabled).
   - Injects mouse click sequence to establish Chromium webview user activation.
7. **Prompt Submission:**
   - Dispatches `Ctrl+A` (clears existing draft/placeholder), `Ctrl+V` (pastes prompt), and `VK_RETURN` (Enter to submit to agent).
8. **Restoration & Ghost Mode Minimization:**
   - Immediately returns user mouse cursor to original position.
   - Cleans up thread input attachment and restores original clipboard content after 1500ms.
   - **Ghost Mode Stealth Background Execution:** If the IDE was minimized or in the background before injection (`was_iconic || _prev_foreground != target_hwnd`):
     - Waits ~150ms for Electron's message queue to accept the Enter submission.
     - Calls `ShowWindow(target_hwnd, SW_MINIMIZE)` to immediately tuck the IDE window back down to the taskbar.
     - Calls `SwitchToThisWindow(_prev_foreground, true.into())` and `SetForegroundWindow(_prev_foreground)` to restore the user's active application and keyboard focus.
     - The user never experiences window flashing or focus stealing.
   - **Double-Click Foreground Trigger:** If the user ever wants to view the IDE, double-clicking the mascot calls `focusIdeWindow(this.hwnd)`, which executes `restore_and_focus(hwnd)`.

---

## 4. Mascot State Machine & Rendering Engine

### Supported Species (`AnimalId`):
`"tiger" | "dog" | "monkey" | "elephant" | "fox" | "panda" | "penguin" | "cat"`

### Pet States (`PetState`):
| State | Behavior | Visual Art / Props |
| :--- | :--- | :--- |
| `"idle"` | Stands on taskbar, natural breathing blink | Crisp 20x20 pixel art mascot |
| `"walk"` | Waddles left/right with gravity (~5-9s). Also used during whistling (`startWhistling`) | 2-frame walking cycle (300ms intervals) |
| `"thinking"` | Floats gently, thought bubble. Also used during bug-hunt stalking phase | Thinking face, questioning eyes |
| `"working"` | Vigorously types on a laptop | Laptop pixel prop with glowing screen |
| `"finish"` | Celebratory vertical jump, stars & party poppers. Also used as bug-hunt conclusion | Joyful face, party popper sparkles |
| `"error"` | Shivers with sweat drop | Worried expression, alert warning |
| `"drag"` | Suspended in air by user mouse cursor | Flailing paws/feet physics |
| `"sleep"` | Curls up with closed eyes, breathing sway (~8.2s) | Rising Zzz bubbles (5x), wake-up yawn |
| `"coffee"` | Sits with steaming coffee mug (~7.8s) | Steaming mug, 2 sips, funny quotes |
| `"dance"` | Bobs head and hips to 8-bar lofi coding beats (~8.2s) | Cyan headphones, notes |
| `"stretch"` | Squats, stretches back, posture reminder (~7.5s) | Gym workout animation, reminder quotes, pops |
| `"snack"` | Munches favorite species snack twice (~7.8s) | Bamboo, fish, bone, banana, steak, berry, apple |

> **Autonomous-only activities (reuse existing states — no dedicated PetState):**
> - **Whistling** (`startWhistling`): Uses `"walk"` at slow speed (0.6 px/frame) + `Sound.playWhistle()` 2-phrase melody (~5.2s). Melody silenced immediately if agent event arrives.
> - **Bug Hunt** (`startBugHunt`): `"thinking"` (stalking ~2.8s) -> jump -> `"finish"` (squash ~4s). Sparkles: bug, explosion, sparkle.
> - **Sneeze** (`startSneeze`): Stays in `"idle"`, tickle preparation delay, then authentic acoustic sneeze synthesis (`Sound.playSneeze(onBurst)` with nasal inhale sweep, breathy tone, glottal pause, friction burst, falling vocal formant, and expelled air blast) with synchronized jump and sparkles on the burst. **Preempted** if agent starts `"working"` or `"thinking"`.

---

## 5. Development, Build & Testing Workflows

All commands are executed from the `./windows/` directory.

### IMPORTANT: Windows Execution & Sandboxing Note
Node.js and Cargo are installed in user/system directories (`%USERPROFILE%\.cargo\bin\cargo.exe` and `C:\Program Files\nodejs\`). When running commands via AI agent tools:
- Use `BypassSandbox: true`.
- Specify `Cwd: "c:\\Users\\retar\\Downloads\\coucou-main\\coucou-main\\windows"`.
- Set Cargo PATH: `$env:PATH += ";$env:USERPROFILE\.cargo\bin"`.

### 1. Run Multi-Pet Unit Test Suite (14/14 tests):
```powershell
node scripts/test_multi_pet.mjs
```
*Tests cover: initial mascot preservation, multi-window staggered spawning, distinct species assignment, HWND event aliasing, single-window cleanup, project attribution integrity, full conversation transcript mirroring, silent prompt dispatch, settings window exception, strict 1:1 window lifecycle (0 pets on close), **SessionEnd hook lifecycle**, and **Pet Companion Settings & Preferences**.*

### 2. Verify TypeScript & Build Frontend:
```powershell
$env:PATH += ";$env:USERPROFILE\.cargo\bin"; npm run build
```
*Compiles `coucou-hook` release binary, runs `tsc --noEmit` and builds `vite` dist in ~250ms with 0 errors.*

### 3. Verify Rust Backend & Unit Tests (15/15 tests):
```powershell
$env:PATH += ";$env:USERPROFILE\.cargo\bin"; cargo test --manifest-path src-tauri\Cargo.toml -- --test-threads=1
$env:PATH += ";$env:USERPROFILE\.cargo\bin"; cargo check --manifest-path src-tauri\Cargo.toml
```
*Runs all 15 backend unit tests (including UIA COM discovery, CLI discovery, and auto-launch) with 100% green output.*

### 4. Build and Deploy Hook Binary:
```powershell
$env:PATH += ";$env:USERPROFILE\.cargo\bin"; cargo build --release -p coucou-hook
Copy-Item -Force target\release\coucou-hook.exe "$env:LOCALAPPDATA\Coucou\bin\coucou-hook.exe"
```

---

## 6. Critical Rules of Engagement for Future AI Agents

1. **Strict 1:1 Window Lifecycle with Antigravity IDE (0 Windows = 0 Desktop Pets):** When no Antigravity IDE windows are open, exactly 0 mascots are on the desktop. When an Antigravity window opens, its companion spawns immediately and greets the user. When an IDE window is closed, its companion waves goodbye (*"👋 Měj se hezky!"*), fades out, and is destroyed. When the last IDE window closes, 0 mascots remain on desktop.
2. **Preserve Ghost Mode & Focus Restoration:** Prompt injection into Antigravity IDE must never steal user focus or leave the IDE covering the user's active window. If the IDE was minimized or in background, always minimize it back to the taskbar (`ShowWindow(target_hwnd, SW_MINIMIZE)`) and restore the user's previous foreground window (`_prev_foreground`) within ~150ms.
3. **Double-Click Intentionally Restores IDE Window:** Double-clicking any pet calls `focusIdeWindow(hwnd)` / `restore_and_focus(hwnd)` to bring that specific IDE window to the foreground on demand.
4. **Never Break Click-Through:** Every new interactive element added to the DOM must have its bounding rect included in `pushAllHitRects()` (`main.ts`) so Tauri can register it with `set_island_rects`. Any pixel not registered MUST pass clicks through to Windows (`WS_EX_TRANSPARENT`). Note: hit-rect is pushed from per-pet `requestAnimationFrame` loops — no extra `setInterval` needed.
5. **Never Break Multi-Pet Preservation:** Never replace an existing mascot when a new window or session is opened. Always use `getOrCreatePet()` which respects HWND aliasing and preserves the mascot's assigned species.
6. **Never Break Preemption:** Agent activities (`working` / `thinking`) must strictly take precedence over idle activities (nap, coffee, dance, snack, whistling). Always ensure `setState("working")` cancels pending activity timeouts and mutes music (`Sound.stopAllMelodies()`). The melody-stop condition in `setState()` covers both `"dance"` and `"walk"` (whistling) as source states.
7. **Preserve Zero-CPU Idle Architecture:** Never use continuous unconstrained `requestAnimationFrame` loops when the mascot is stationary. When idle, physics loops must sleep. Auto-suspend Web Audio contexts when silent.
8. **No Bloated Frameworks:** Maintain the ultra-fast, zero-dependency vanilla TypeScript + HTML5 canvas architecture. Do NOT inject heavy UI libraries (React, Vue, Tailwind) into the overlay frontend.
9. **Always Maintain Test Suite:** Run `node scripts/test_multi_pet.mjs` and `cargo test` after modifying any multi-pet, session, or window-tracking code. All **14 multi-pet tests** and **15 Rust tests** must pass 100%.
10. **`isSettingsName`/`isSettingsWindow` are intentionally triplicated** across `src/main.ts`, `scripts/test_multi_pet.mjs`, and `src-tauri/src/window_finder.rs`. Look for the `KEEP IN SYNC` comments in each file. If you add a new locale variant (e.g. German "einstellungen"), update **all three** locations.

---

## 7. Credits & Original Author

- **Original Creator & Concept:** [Louis Raillé](https://github.com/louisraille)
- **Original Project:** Coucou / NotchBuddy (macOS desktop companion)
- **Acknowledgments:** Deep appreciation to Louis Raillé for the initial vision, beautiful retro aesthetic concepts, and architecture that inspired this Windows desktop port and Antigravity IDE integration.
