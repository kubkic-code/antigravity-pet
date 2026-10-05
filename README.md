# 🐾 Antigravity Pet (Coucou for Windows)

<p align="center">
  <strong>Retro 8-bit Desktop Shimeji AI Companions for Google Antigravity IDE</strong><br>
  <em>Ultra-lightweight (~25 MB RAM, 0% CPU idle) desktop companions that walk on your taskbar, mirror your agent's thinking and coding in real-time, and spawn a distinct mascot for every active IDE window.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue?style=flat-square&logo=windows" alt="Platform: Windows 10/11" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20Rust-orange?style=flat-square&logo=tauri" alt="Built with Tauri v2 + Rust" />
  <img src="https://img.shields.io/badge/integration-Google%20Antigravity%20IDE-4285F4?style=flat-square&logo=google" alt="Google Antigravity IDE" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License: MIT" />
</p>

<p align="center">
  <a href="https://github.com/kubkic-code/antigravity-pet/releases">
    <img src="https://img.shields.io/badge/Download-Windows%20Installer%20(.exe)-blue?style=for-the-badge&logo=windows" alt="Download Windows Installer" />
  </a>
</p>

---

## 📖 English & Czech Guides
- **English Documentation:** [Read below](#-key-features)
- **Česká uživatelská příručka:** [NAVOD_K_POUZITI.md](./NAVOD_K_POUZITI.md)
- **Strategický & Marketingový Plán:** [MARKETING_PLAN.md](./MARKETING_PLAN.md)
- **Master Developer & Handoff Guide:** [CLAUDE.md](./CLAUDE.md)

---

## 🌟 Key Features

### 👥 Multi-Pet Engine (1 Window = 1 Mascot)
- **Automatic Window Discovery:** The background monitor dynamically detects active Antigravity IDE windows via Win32 API.
- **Dedicated Companions:** When you open 2 IDE windows, you get **2 distinct mascots** on your taskbar! 3 windows = 3 mascots!
- **Persistent Character Diversity:** Each window is assigned a different animal species (Panda, Penguin, Dog, Tiger, etc.) from an available pool, preventing visual duplicates.
- **Staggered Taskbar Positioning:** Newly spawned companions walk alongside existing ones without overlapping.
- **Clear Project Attribution:** Each mascot shows a project badge directly on its tag under its feet (e.g. `[● 🐼 Panda · 📁 coucou-main]`), shows a native tooltip on hover, announces its paired window in a speech bubble on double-click (*"🎯 Okno: coucou-main"*), and displays the project name in the chat header.
- **Smart Badge Sanitization:** Automatically ignores open file names (`README.md`, `scraper.py`, `Cargo.toml`) and system words (`settings`, `coucou`), displaying only the genuine workspace/project name.
- **Settings Window Exception:** Opening Settings (whether in Antigravity IDE, detached settings tab, or Coucou's settings window) **never** spawns an unwanted "setting" mascot and never overwrites an existing mascot's project name.
- **Single-Pet Desktop Safeguard:** You will **never be left with 0 mascots**. If an IDE window closes or detaches when only one mascot is active, it unbinds its HWND and stays on the desktop as an idle companion, ready to be adopted when a window reopens.
- **Window-Specific Focus & Chat:** Double-clicking any pet instantly brings that specific IDE window to the foreground (`SetForegroundWindow`). Right-clicking opens the chat overlay for that specific project.
- **Graceful Window Exit:** When an additional IDE window is closed, its extra companion waves goodbye (*"👋 Měj se hezky!"*) and disappears, leaving your other companions active.

### 💬 Two-Way IDE Chat Mirror & Full Conversation Streaming
- **Complete Conversation Mirroring:** The desktop chat overlay renders the **entire conversation history directly from Antigravity IDE** (`transcript.jsonl`), displaying pure user prompts and assistant responses without internal system tags or reasoning noise.
- **Rich Markdown with 1-Click Code Copy:** Headings, bulleted and numbered lists, blockquotes, and code blocks rendered in custom `.chat-code-card` frames with syntax badges and a `📋 Kopírovat` button.
- **Smart Scrolling & Floating Indicator:** Automatically aligns down upon arrival of new messages if you are at the bottom. If you scroll up to read past history, your position is preserved and an unobtrusive `⬇️ Nová zpráva` floating pill lets you jump down on demand.
- **Incremental Fast Loading:** Loads the last 30 turns instantly, with an `⬆️ Load older history` button to prepend earlier turns without jumping.
- **Live Background Sync:** Actively monitors the transcript file every 1.2s while open to stream in new responses in real-time, completely powering down when closed for 0.0% idle CPU.
- **Ghost Mode / Silent Background Prompt Injection:** Type prompts directly into the desktop chat overlay. The app can inject prompts directly into the agent input on the background without stealing your active window focus or popping up the IDE window over your work.

### 🎨 8 Handcrafted Retro Pixel-Art Mascots
Rendered on an HTML5 canvas with crisp nearest-neighbor pixel scaling and dynamic color palettes:
- 🐼 **Panda:** Zen coding master munching on bamboo.
- 🐧 **Tučňák (Penguin):** Linux Tux expert with cute waddling physics.
- 🐱 **Kočička (Cat):** Curious ginger cat with emerald green eyes.
- 🐘 **Slůně (Elephant):** Wise companion with long memory.
- 🦊 **Lištička (Fox):** Agile scout with a fluffy animated tail.
- 🐵 **Opička (Monkey):** Hyperactive keyboard hacker.
- 🐶 **Pejsek (Dog):** Loyal Shiba Inu companion with pink cheeks.
- 🐯 **Tygřík (Tiger):** Bold and energetic refactoring specialist.

### 🎭 Autonomous Life, Quirky Animations & Pet Activities (Extended Durations)
The mascots don't just idle or walk around! While your agent is quiet, companions spontaneously live their own lives on your taskbar with custom pixel-art animations, props, humorous quotes, and synthesized audio:
- 🎧 **Music & Groove Dance (~8.2s):** Puts on retro headphones, bobs its head, and drops musical notes `🎵 🎶 ✨ 🔥 🕺 ⭐` to a full **8-bar retro 8-bit lofi beat**.
- 🎶 **Whistling Walk (~6.0s):** Strolls along the taskbar whistling a **two-phrase cheerful tune** with realistic vibrato.
- ☕ **Coffee Break (~7.8s):** Sits down with a steaming mug, takes two relaxed sips with cartoon sip sounds, and lets steam rise (`☕ 💨 ✨`).
- 💤 **Power Nap (~8.2s):** Curls up with closed eyes and rising `💤` bubbles (5 cycles), waking with an energetic yawn (`🥱`).
- 🧘 **Desk Workout & Posture Reminder (~7.5s):** Does squats and stretches (*"🧘 Don't forget to straighten your back and rest your eyes!"*).
- 🍴 **Species-Specific Snacks (~7.8s):** Takes two crunchy bites with chewing sounds (Panda munches bamboo 🎍, Cat & Penguin nibble fish 🐟, Dog chomps bones 🦴, Monkey eats bananas 🍌, Tiger feasts on steak 🥩, Fox eats berries 🍓, Elephant eats apples 🍎).
- 🐛 **Desktop Bug Hunt (~7.0s):** Spots a creeping pixel bug `🐛`, stalks it suspensefully, leaps, and squashes it (`💥`) with victory celebration.
- 🤧 **Funny Sneezes (~5.5s):** Pre-sneeze comic tickle, cartoon sneeze, hop, and nose wipe.
- 🚶 **Walking (~5–9s):** Natural, relaxed stroll across the taskbar.

*(All activities trigger naturally and automatically without pressing any buttons. As soon as your agent starts coding, the companion instantly mutes audio and returns to its laptop).*

### ⚙️ In-Chat Companion Settings Panel
- Click the **`⚙️`** icon in the chat header to open the inline preferences panel:
  - **🔊 Sound & Melodies:** Master toggle for sound effects, synthesized beats, and tunes.
  - **⏱️ Animation Pacing:** Choose between 3 interval presets: *Often (15–30s)*, *Normal (30–60s)*, and *Rare (60–120s)*.
  - **🎭 9 Individual Animation Toggles:** Enable or disable any specific activities (Walking, Whistling, Dance, Coffee, Sleep, Stretch, Snack, Bug Hunt, Sneeze) with quick *Select All* / *Deselect All* actions.
  - **💬 Desktop Visuals:** Toggle speech bubbles and project name tags (`[📁 coucou-main]`).
  - **🎮 Test Animation:** Trigger an enabled animation on demand with the *▶️ Run Random Animation Now* test button.
  - **🔄 Reset to Defaults:** Restore all settings with one click. Preferences persist across restarts via `localStorage`.

### 🪟 Full-Screen Transparent Overlay with Pixel-Perfect Click-Through
- Runs as a borderless transparent overlay across your entire primary monitor.
- **Interactive Islands:** Only the mascot bodies, focus indicators, and open chat overlays accept mouse clicks and drags.
- **100% Click-Through (`WS_EX_TRANSPARENT`):** Every other pixel is completely transparent to the desktop, allowing uninterrupted clicking and typing in your regular applications.

### 🧘 Focus Mode (Ambient Taskbar Indicator)
- Press **`H`** (or use the tray menu) to collapse all companions into subtle, unobtrusive **4px glowing status dots** sitting cleanly directly on the bottom taskbar edge.
- The indicator color smoothly transitions based on IDE status (Amber = Thinking, Blue = Coding, Emerald = Finished, Crimson = Error). Click the dot or press `H` again to restore your companions.

---

## 🎮 Controls & Shortcuts

| Action / Hotkey | Description |
| :--- | :--- |
| **Left Click + Drag** | Pick up and throw any mascot anywhere on screen; gravity pulls them back with a soft bounce. |
| **Right Click (or `C`)** | Toggle the Two-Way Chat Mirror anchored directly above that mascot. |
| **Middle Click (Wheel)** | **Randomize Mascot (`🎲`):** Instantly switch companion to a random animal species with confetti/sparkles! |
| **Double Click** | Jump celebrate and bring the mascot's Antigravity IDE window to the foreground (`🎯`). |
| **Hover** | Mascot greets you with a friendly hop, paw wave, and audio chime. |
| **`R` or `Space`** | **Randomize Mascot (`🎲`):** Roll the dice and switch the active companion to a random animal. |
| **`🎲` in Chat Header** | Switch active mascot randomly right from the chat mirror overlay. |
| **`H`** | Toggle Focus Mode (4px ambient indicator on taskbar edge). |
| **`Esc`** | Close open chat overlay or diagnostics panel. |
| **`1` – `6`** | *(Developer test keys)* Simulate IDE states (`idle`, `thinking`, `working`, `finish`, `error`, `depart`). |

---

## 🏗️ Architecture & Communication Pipeline

```text
[ Antigravity IDE (Gemini CLI / Antigravity 2.0 / IDE Window) ]
                       │
                       ▼  Lifecycle events (PreInvocation, PreToolUse, Stop, PostInvocation)
           ~/.gemini/config/hooks.json
                       │
                       ▼  cmd.exe /c "<path>\coucou-hook.exe" --agent antigravity <Event>
              [ coucou-hook.exe ]  (Relay binary: extracts transcript text & question blocks)
                       │
                       ▼  Named Pipe: \\.\pipe\coucou-<UserSID>
           [ Tauri / Rust Backend (`pipe.rs`, `pet_manager.rs`) ]
                       │
                       ▼  Tauri IPC Events ("hook", "session-assigned", "session-removed")
          [ Webview Frontend (`main.ts` Multi-Pet Registry) ]
                       │
     ┌─────────────────┴─────────────────┐
     ▼                                   ▼
[ Mascot Window 1 (Tiger) ]    [ Mascot Window 2 (Dog) ]
(Taskbar X: ~260px)            (Taskbar X: ~440px)
```

---

## 🛠️ Building & Installation

### Prerequisites
- **Windows 10 or 11 (64-bit)**
- **Node.js** (v18+ or v22 recommended)
- **Rust toolchain** (`cargo`, `rustc` via [rustup.rs](https://rustup.rs))
- **Google Antigravity IDE**

### Build from Source
```powershell
# 1. Clone repository
git clone https://github.com/retar/coucou-antigravity.git
cd coucou-antigravity/windows

# 2. Install Node dependencies
npm install

# 3. Compile coucou-hook relay binary
cargo build --release -p coucou-hook

# 4. Copy hook binary to Coucou runtime location
mkdir -p "$env:LOCALAPPDATA\Coucou\bin"
copy /y target\release\coucou-hook.exe "$env:LOCALAPPDATA\Coucou\bin\coucou-hook.exe"

# 5. Build frontend & run unit tests
npm test
npm run build

# 6. Run desktop companion in development mode
npm run tauri dev
```

---

## 🧪 Automated Testing

The project includes an automated test suite of **12 unit tests** in TypeScript and **11 unit tests** in Rust that validate multi-window assignment, session aliasing, settings suppression, single-pet safety guards, and silent prompt injection:

```powershell
cd windows
npm test
```

Expected output:
```text
=== RUNNING MULTI-PET UNIT TESTS ===
✓ Test 1: Initial placeholder pet initialized (Tiger)
✓ Test 2: First window adopted without mutating animal species
✓ Test 3: Second window spawned 2nd distinct pet (Dog at x=440, Tiger at x=260)
✓ Test 4: Third window spawned 3rd distinct pet (Monkey at x=620)
✓ Test 5: Hook event successfully aliased to Pet 2 without creating duplicate
✓ Test 6: Closing Window 2 removed only Pet 2; Pet 1 and Pet 3 remain alive and active
✓ Test 7: Project distinction verified: Pet 1 is Panda [coucou-main], Pet 2 is Liška [minibagry]
✓ Test 8: Full conversation mirroring, tag sanitization & rich markdown verified
✓ Test 9: Silent background prompt dispatch & clipboard preservation verified
✓ Test 10: Project badge accurately displays workspace ('📁 coucou-main') and filters out open files ('README.md')
✓ Test 11: Settings window exception verified: opening settings never spawns a 'setting' mascot (100% OK)
✓ Test 12: Single pet preservation verified: mascot NEVER disappears when opening settings or unbinding window (100% OK)

ALL 12 MULTI-PET, CONVERSATION MIRROR & SETTINGS EXCEPTION TESTS PASSED SUCCESSFULLY! (100% OK)
```

---

## 💖 Credits & Acknowledgments

This project builds upon the fantastic original work of **Louis Raillé**:

- **Original Creator & Concept:** [Louis Raillé](https://github.com/louisraille)
- **Original Project:** Coucou / NotchBuddy (macOS desktop companion)
- **Special Thanks:** Enormous gratitude to Louis Raillé for the brilliant initial vision, whimsical design aesthetic, retro sound design, and elegant lightweight architecture that laid the foundation for this Windows port and Google Antigravity IDE integration.

Windows Port & Antigravity IDE Enhancements:
- Multi-Pet Engine (1 window = 1 pet, dynamic HWND discovery).
- Single-Pet Safety Safeguard (never left with 0 pets on the desktop).
- Settings window exception and project badge sanitization.
- Google Antigravity lifecycle hooks (`PreInvocation`, `PostInvocation`, `ask_question`).
- Two-way prompt injection, Ghost Mode, and full transcript response mirroring.
- 8-bit retro animal canvas engine, extended autonomous animations, and synthesized Web Audio.

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE) — originally Copyright (c) 2026 Louis Raillé.
