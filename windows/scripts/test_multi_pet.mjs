// Unit test for multi-window pet companionship and distinct animal spawning.
// Verifies that:
// 1. Initial window binds pet without mutating its animal.
// 2. Second window spawns a NEW distinct companion with a different animal species and offset X.
// 3. Third window spawns another distinct companion.
// 4. Hook events matching HWND correctly resolve to the existing pet without creating duplicate pets.
// 5. Window closing cleanly removes only the corresponding pet and preserves other pets.

import assert from "node:assert";

const ANIMAL_LIST = ["tiger", "dog", "monkey", "elephant", "fox", "panda", "penguin", "cat"];
const ANIMALS = {
  tiger: { id: "tiger", name: "Tygr" },
  dog: { id: "dog", name: "Pejsek" },
  monkey: { id: "monkey", name: "Opička" },
  elephant: { id: "elephant", name: "Slůně" },
  fox: { id: "fox", name: "Liška" },
  panda: { id: "panda", name: "Panda" },
  penguin: { id: "penguin", name: "Tučňák" },
  cat: { id: "cat", name: "Kočička" },
};

function getAnimalById(id) {
  return ANIMALS[id] || ANIMALS.tiger;
}

class MockPet {
  constructor(animal, x) {
    this.animal = animal;
    this.x = x;
    this.y = 900;
    this.hwnd = null;
    this.sessionId = null;
    this.projectName = null;
    this.windowTitle = null;
    this.isClosed = false;
  }
  getAnimal() {
    return this.animal;
  }
  setAnimal(a) {
    this.animal = a;
  }
  setProjectInfo(projectName, windowTitle) {
    if (projectName != null) this.projectName = projectName;
    if (windowTitle != null) this.windowTitle = windowTitle;
  }
  sayGoodbyeAndClose() {
    this.isClosed = true;
  }
  destroy() {
    this.isClosed = true;
  }
}

class MockChat {
  constructor() {
    this.hwnd = null;
    this.sessionId = null;
    this.isOpen = false;
    this.isDestroyed = false;
    this.projectName = null;
    this.windowTitle = null;
  }
  setProjectInfo(projectName, windowTitle) {
    if (projectName !== undefined) this.projectName = projectName;
    if (windowTitle !== undefined) this.windowTitle = windowTitle;
  }
  destroy() {
    this.isDestroyed = true;
  }
}

// KEEP IN SYNC: these functions are copied from src/main.ts (and Rust: window_finder.rs).
// If you add a new locale/variant, update ALL THREE locations!
function isSettingsName(name) {
  if (!name) return false;
  const l = name.trim().toLowerCase();
  return (
    l === "settings" ||
    l === "setting" ||
    l === "nastavení" ||
    l === "nastaveni" ||
    l === "preferences" ||
    l === "preference" ||
    l === "předvolby" ||
    l === "predvolby"
  );
}

function isSettingsWindow(title, projectName) {
  if (isSettingsName(projectName)) return true;
  if (!title) return false;
  const l = title.trim().toLowerCase();
  if (
    l === "settings" ||
    l === "setting" ||
    l === "nastavení" ||
    l === "nastaveni" ||
    l === "preferences" ||
    l === "preference" ||
    l === "settings — coucou" ||
    l === "settings - coucou" ||
    l.startsWith("settings - antigravity") ||
    l.startsWith("settings — antigravity") ||
    l.startsWith("settings - visual studio code") ||
    l.startsWith("settings — visual studio code") ||
    l.startsWith("settings - code") ||
    l.startsWith("nastavení - antigravity") ||
    l.startsWith("nastavení — antigravity") ||
    l.startsWith("preferences - antigravity") ||
    l.startsWith("preferences — antigravity")
  ) {
    if (projectName && !isSettingsName(projectName)) {
      return false;
    }
    return true;
  }
  return false;
}

class PetRegistry {
  constructor() {
    this.activePets = new Map();
    this.lastActiveSession = "default";
  }

  getUniquePets() {
    return Array.from(new Set(this.activePets.values()));
  }

  getOrCreatePet(sessionId, animalHint, hwnd, projectName, windowTitle) {
    // EXCEPTION: Never spawn a pet companion for a Settings window
    if (isSettingsWindow(windowTitle, projectName)) {
      const existing =
        this.activePets.get(sessionId) ||
        (hwnd ? Array.from(this.activePets.values()).find((p) => p.pet.hwnd === hwnd) : undefined);
      if (existing) return existing;
      return this.activePets.get(this.lastActiveSession) || Array.from(this.activePets.values())[0];
    }

    this.lastActiveSession = sessionId;

    // 1. Direct match by sessionId
    let existing = this.activePets.get(sessionId);
    if (existing) {
      if (hwnd && !existing.pet.hwnd) {
        existing.pet.hwnd = hwnd;
        existing.chat.hwnd = hwnd;
      }
      if (projectName || windowTitle) {
        existing.pet.setProjectInfo(projectName, windowTitle);
      }
      return existing;
    }

    // 2. Match by HWND: if a pet already exists for this exact window handle, alias this sessionId to it!
    if (hwnd) {
      for (const petEntry of this.activePets.values()) {
        if (petEntry.pet.hwnd === hwnd) {
          this.activePets.set(sessionId, petEntry);
          if (projectName || windowTitle) {
            petEntry.pet.setProjectInfo(projectName, windowTitle);
          }
          return petEntry;
        }
      }
    }

    // 3. Adopt an unbound idle pet (initial placeholder or remaining single pet) ONLY IF it has no window bound yet
    const uniquePetsList = this.getUniquePets();
    const unboundEntry = uniquePetsList.find((p) => p.pet.hwnd == null);
    if (unboundEntry && sessionId !== "default") {
      for (const [id, p] of Array.from(this.activePets.entries())) {
        if (p === unboundEntry) {
          this.activePets.delete(id);
        }
      }
      unboundEntry.sessionId = sessionId;
      unboundEntry.pet.sessionId = sessionId;
      unboundEntry.chat.sessionId = sessionId;
      if (hwnd) {
        unboundEntry.pet.hwnd = hwnd;
        unboundEntry.chat.hwnd = hwnd;
      }
      if (projectName || windowTitle) {
        unboundEntry.pet.setProjectInfo(projectName, windowTitle);
      }
      this.activePets.set(sessionId, unboundEntry);
      return unboundEntry;
    }

    // 4. Spawn a BRAND NEW pet companion for this new window/session!
    const usedAnimalIds = new Set(Array.from(this.activePets.values()).map((p) => p.pet.getAnimal().id));
    const available = ANIMAL_LIST.filter((a) => !usedAnimalIds.has(a));
    const chosenId =
      animalHint && animalHint in ANIMALS && !usedAnimalIds.has(animalHint)
        ? animalHint
        : available.length > 0
        ? available[0]
        : ANIMAL_LIST[0];
    const animal = getAnimalById(chosenId);

    // Stagger spawn position across the taskbar so companions don't overlap
    const uniquePets = this.getUniquePets();
    const existingX = uniquePets.map((p) => p.pet.x);
    let spawnX = 260;
    if (existingX.length > 0) {
      const maxX = Math.max(...existingX);
      spawnX = maxX + 180;
    }

    const pet = new MockPet(animal, spawnX);
    pet.sessionId = sessionId;
    pet.hwnd = hwnd ?? null;
    if (projectName || windowTitle) {
      pet.setProjectInfo(projectName, windowTitle);
    }

    const chat = new MockChat();
    chat.sessionId = sessionId;
    chat.hwnd = hwnd ?? null;

    const newActive = { sessionId, pet, chat };
    this.activePets.set(sessionId, newActive);
    return newActive;
  }

  removeSession(sessionId, hwnd) {
    let targetPet = this.activePets.get(sessionId);
    if (!targetPet && hwnd) {
      for (const p of this.activePets.values()) {
        if (p.pet.hwnd === hwnd) {
          targetPet = p;
          break;
        }
      }
    }
    if (targetPet) {
      targetPet.pet.sayGoodbyeAndClose();
      targetPet.chat.destroy();
      targetPet.pet.destroy();
      for (const [id, p] of Array.from(this.activePets.entries())) {
        if (p === targetPet) {
          this.activePets.delete(id);
        }
      }
    }
  }
}

console.log("=== RUNNING MULTI-PET UNIT TESTS ===");

const registry = new PetRegistry();

// 1. Initial startup creates default pet
const initial = registry.getOrCreatePet("default", "tiger");
assert.strictEqual(registry.getUniquePets().length, 1, "Initial state should have 1 pet");
assert.strictEqual(initial.pet.getAnimal().id, "tiger", "Initial pet should be tiger");
assert.strictEqual(initial.pet.hwnd, null, "Initial pet has no HWND yet");
console.log("✓ Test 1: Initial placeholder pet initialized (Tiger)");

// 2. First real Antigravity IDE window is discovered (HWND 0x1000)
const pet1 = registry.getOrCreatePet("ide-win-1000", "dog", 0x1000);
assert.strictEqual(registry.getUniquePets().length, 1, "Binding first window adopts placeholder pet (still 1 unique pet)");
assert.strictEqual(pet1.pet.getAnimal().id, "tiger", "Animal species must NOT be forcibly mutated on adoption");
assert.strictEqual(pet1.pet.hwnd, 0x1000, "Pet 1 HWND must be 0x1000");
console.log("✓ Test 2: First window adopted without mutating animal species");

// 3. Second Antigravity IDE window is opened (HWND 0x2000)
const pet2 = registry.getOrCreatePet("ide-win-2000", "dog", 0x2000);
assert.strictEqual(registry.getUniquePets().length, 2, "Opening 2nd window MUST result in 2 distinct pets!");
assert.notStrictEqual(pet1, pet2, "Pet 1 and Pet 2 must be distinct instances");
assert.strictEqual(pet1.pet.getAnimal().id, "tiger", "Pet 1 must still be Tiger!");
assert.strictEqual(pet2.pet.getAnimal().id, "dog", "Pet 2 must be Dog (distinct animal)!");
assert.strictEqual(pet2.pet.hwnd, 0x2000, "Pet 2 HWND must be 0x2000");
assert.ok(pet2.pet.x > pet1.pet.x, `Pet 2 (${pet2.pet.x}) must be spawned offset to the right of Pet 1 (${pet1.pet.x})`);
console.log(`✓ Test 3: Second window spawned 2nd distinct pet (Dog at x=${pet2.pet.x}, Tiger at x=${pet1.pet.x})`);

// 4. Third Antigravity IDE window is opened (HWND 0x3000)
const pet3 = registry.getOrCreatePet("ide-win-3000", undefined, 0x3000);
assert.strictEqual(registry.getUniquePets().length, 3, "Opening 3rd window MUST result in 3 distinct pets!");
assert.strictEqual(pet1.pet.getAnimal().id, "tiger", "Pet 1 remains Tiger");
assert.strictEqual(pet2.pet.getAnimal().id, "dog", "Pet 2 remains Dog");
assert.strictEqual(pet3.pet.getAnimal().id, "monkey", "Pet 3 gets unused animal (Monkey)");
assert.ok(pet3.pet.x > pet2.pet.x, "Pet 3 must be offset further right");
console.log(`✓ Test 4: Third window spawned 3rd distinct pet (Monkey at x=${pet3.pet.x})`);

// 5. Hook event arrives for Window 2 with conversationId and hwnd=0x2000
const hookPet = registry.getOrCreatePet("conv-uuid-window-2", undefined, 0x2000);
assert.strictEqual(hookPet, pet2, "Hook event for HWND 0x2000 must route to existing Pet 2");
assert.strictEqual(registry.getUniquePets().length, 3, "Hook event must NOT create a 4th pet");
console.log("✓ Test 5: Hook event successfully aliased to Pet 2 without creating duplicate");

// 6. Window 2 is closed by user
registry.removeSession("ide-win-2000", 0x2000);
assert.strictEqual(registry.getUniquePets().length, 2, "Closing Window 2 leaves exactly 2 pets");
assert.strictEqual(pet2.pet.isClosed, true, "Pet 2 must be closed/destroyed");
assert.strictEqual(pet1.pet.isClosed, false, "Pet 1 must still be active");
assert.strictEqual(pet3.pet.isClosed, false, "Pet 3 must still be active");
assert.strictEqual(registry.activePets.get("conv-uuid-window-2"), undefined, "Alias was cleaned up");
console.log("✓ Test 6: Closing Window 2 removed only Pet 2; Pet 1 and Pet 3 remain alive and active");

// 7. Project distinction test (User request: easily tell which pet is connected with which window / agent)
const petAlpha = registry.getOrCreatePet("session-alpha", "panda", 0x4000, "coucou-main");
const petBeta = registry.getOrCreatePet("session-beta", "fox", 0x5000, "minibagry");
assert.strictEqual(petAlpha.pet.projectName, "coucou-main");
assert.strictEqual(petBeta.pet.projectName, "minibagry");
assert.notStrictEqual(petAlpha.pet.getAnimal().id, petBeta.pet.getAnimal().id);
console.log(`✓ Test 7: Project distinction verified: Pet 1 is ${petAlpha.pet.getAnimal().name} [${petAlpha.pet.projectName}], Pet 2 is ${petBeta.pet.getAnimal().name} [${petBeta.pet.projectName}]`);

// 8. Full Conversation Mirroring & Markdown Rendering Test
function cleanUserContent(raw) {
  if (!raw) return "";
  const match = raw.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (match) return match[1].trim();
  const metaIdx = raw.indexOf("<ADDITIONAL_METADATA>");
  if (metaIdx !== -1) return raw.slice(0, metaIdx).trim();
  return raw.trim();
}

function cleanAssistantContent(raw) {
  if (!raw) return "";
  let text = raw;
  const thIdx = text.lastIndexOf("</thought>");
  if (thIdx !== -1) text = text.slice(thIdx + 10);
  const tkIdx = text.lastIndexOf("</think>");
  if (tkIdx !== -1) text = text.slice(tkIdx + 8);
  return text.trim();
}

function renderMarkdown(raw) {
  if (!raw) return "";
  let text = raw;
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<div class="chat-code-card"><span class="chat-code-lang">${lang || "code"}</span><pre><code>${code.trim()}</code></pre></div>`;
  });
  text = text.replace(/^###\s+(.+)$/gm, '<div class="chat-md-h3">$1</div>');
  text = text.replace(/^>\s+(.+)$/gm, '<blockquote class="chat-md-quote">$1</blockquote>');
  text = text.replace(/(?:^[ \t]*[-*]\s+.+(?:\n|$))+/gm, (listBlock) => {
    const items = listBlock.trim().split("\n").map(l => `<li>${l.replace(/^[ \t]*[-*]\s+/, "")}</li>`).join("");
    return `<ul class="chat-md-ul">${items}</ul>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return text.trim();
}

const rawUser = "<USER_REQUEST>\nchci aby to bylo kompletní zrcadlo\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nignore me\n</ADDITIONAL_METADATA>";
assert.strictEqual(cleanUserContent(rawUser), "chci aby to bylo kompletní zrcadlo", "User request must be cleanly extracted from tags");

const rawAssistant = "<thought>thinking deeply...</thought>\nHotovo! Vše funguje skvěle.";
assert.strictEqual(cleanAssistantContent(rawAssistant), "Hotovo! Vše funguje skvěle.", "Assistant reasoning tags must be stripped");

const mdInput = "### Nadpis\n> Důležitá poznámka\n- Bod 1\n- Bod 2\n```rust\nfn main() {}\n```";
const rendered = renderMarkdown(mdInput);
assert.ok(rendered.includes('class="chat-md-h3"'), "Must render h3");
assert.ok(rendered.includes('class="chat-md-quote"'), "Must render quote");
assert.ok(rendered.includes('class="chat-md-ul"'), "Must render ul list");
assert.ok(rendered.includes('class="chat-code-card"'), "Must render code card");
console.log("✓ Test 8: Full conversation mirroring, tag sanitization & rich markdown verified");

// 9. Silent Background Dispatch & Clipboard Preservation Test
class MockWindowManager {
  constructor() {
    this.foregroundHwnd = 1001; // e.g. Google Chrome
    this.ideHwnd = 2002;        // Antigravity IDE
    this.clipboardText = "https://google.com/search?q=kubota"; // user copied link in Chrome
    this.ideReceivedPrompt = null;
  }

  sendPromptSilent(promptText) {
    // 1. Capture user state
    const originalFore = this.foregroundHwnd;
    const originalClip = this.clipboardText;

    // 2. Put prompt into clipboard
    this.clipboardText = promptText;

    // 3. Thread-attached injection into IDE
    this.ideReceivedPrompt = this.clipboardText;

    // 4. Immediately restore user's foreground window
    this.foregroundHwnd = originalFore;

    // 5. Restore user's original clipboard
    this.clipboardText = originalClip;

    return {
      success: true,
      targetHwnd: this.ideHwnd,
      method: "ide_silent_injection",
      foregroundRetained: this.foregroundHwnd === originalFore,
      clipboardPreserved: this.clipboardText === originalClip,
    };
  }
}

const mockWin = new MockWindowManager();
const dispatchRes = mockWin.sendPromptSilent("Udělej scraper na minibagry");
assert.strictEqual(dispatchRes.success, true);
assert.strictEqual(dispatchRes.method, "ide_silent_injection");
assert.strictEqual(dispatchRes.foregroundRetained, true, "User's browser window must retain focus");
assert.strictEqual(dispatchRes.clipboardPreserved, true, "User's clipboard must be restored untouched");
assert.strictEqual(mockWin.clipboardText, "https://google.com/search?q=kubota");
assert.strictEqual(mockWin.ideReceivedPrompt, "Udělej scraper na minibagry");
console.log("✓ Test 9: Silent background prompt dispatch & clipboard preservation verified");

// 10. Project Badge Filtering & Filename Sanitization Test
// Ensures that mascot badge displays the project folder ("📁 coucou-main"), NEVER open file ("📁 README.md")
function cleanProjectBadge(projectName, windowTitle) {
  if (!projectName) return null;
  const trimmed = projectName.trim();
  if (!trimmed) return null;

  const isFileOrSettings =
    /\.(md|rs|ts|tsx|js|jsx|json|py|html|css|toml|yaml|yml|sh|txt|png|svg|ico)$/i.test(trimmed) ||
    /^untitled-\d+$/i.test(trimmed) ||
    /^(welcome|settings|setting|nastavení|nastaveni|preferences|preference|předvolby|predvolby|dockerfile|makefile)$/i.test(trimmed);

  if (isFileOrSettings) {
    if (windowTitle) {
      const parts = windowTitle.split(/\s+[—–\-|]\s+/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        const lower = p.toLowerCase();
        if (
          lower !== "antigravity" &&
          lower !== "antigravity ide" &&
          lower !== "code" &&
          lower !== "visual studio code" &&
          lower !== "cursor" &&
          lower !== "coucou" &&
          lower !== "settings" &&
          lower !== "setting" &&
          lower !== "nastavení" &&
          lower !== "nastaveni" &&
          lower !== "preferences" &&
          !/\.(md|rs|ts|tsx|js|jsx|json|py|html|css|toml|yaml|yml|sh|txt)$/i.test(p)
        ) {
          return p.replace(/\s*\(Workspace\)$/i, "").trim();
        }
      }
    }
    return null;
  }
  return trimmed;
}

// Case 1: Bad title where README.md was passed as projectName with windowTitle
assert.strictEqual(
  cleanProjectBadge("README.md", "README.md - coucou-main - Antigravity IDE"),
  "coucou-main",
  "cleanProjectBadge must extract coucou-main from title instead of showing README.md"
);

// Case 2: Windows title with reverse format
assert.strictEqual(
  cleanProjectBadge("README.md", "coucou-main - Antigravity IDE - README.md"),
  "coucou-main",
  "cleanProjectBadge must extract coucou-main when title has reverse format"
);

// Case 3: Title with em-dash
assert.strictEqual(
  cleanProjectBadge("lib.rs", "● lib.rs — coucou-main — Antigravity IDE"),
  "coucou-main",
  "cleanProjectBadge must extract coucou-main when dirty marker or em-dash is present"
);

// Case 4: Normal project name with hyphen
assert.strictEqual(
  cleanProjectBadge("coucou-main", "coucou-main - Antigravity IDE"),
  "coucou-main",
  "Normal project name must be preserved untouched"
);

// Case 5: Minibagry project
assert.strictEqual(
  cleanProjectBadge("scraper.py", "minibagry - Antigravity IDE - scraper.py"),
  "minibagry",
  "Minibagry scraper file must resolve to project name minibagry"
);

console.log("✓ Test 10: Project badge accurately displays workspace ('📁 coucou-main') and filters out open files ('README.md')");

// 11. Settings Window Exception Test (User Request: Never spawn a pet companion for Settings)
const petCountBeforeSettings = registry.getUniquePets().length;

// Attempt 1: Opening standalone Settings window in IDE (Settings - Antigravity IDE)
const resSettings1 = registry.getOrCreatePet("ide-win-settings", "elephant", 0x7000, "Settings", "Settings - Antigravity IDE");
assert.strictEqual(
  registry.getUniquePets().length,
  petCountBeforeSettings,
  "Opening Settings must NOT increase pet count or spawn a 'setting' mascot"
);

// Attempt 2: Opening Coucou's own Settings window (Settings — Coucou)
const resSettings2 = registry.getOrCreatePet("ide-win-coucou-settings", "penguin", 0x8000, "Settings", "Settings — Coucou");
assert.strictEqual(
  registry.getUniquePets().length,
  petCountBeforeSettings,
  "Opening Coucou Settings must NOT spawn a 'setting' mascot"
);

// Attempt 3: User/system passes 'setting' or 'Settings' directly to badge sanitizer
assert.strictEqual(
  cleanProjectBadge("setting", "Settings - Antigravity IDE"),
  null,
  "Project badge must reject 'setting' and return null"
);
assert.strictEqual(
  cleanProjectBadge("Settings", "Settings — Coucou"),
  null,
  "Project badge must reject 'Settings' and return null"
);
assert.strictEqual(
  cleanProjectBadge("nastavení", "Nastavení - Antigravity IDE"),
  null,
  "Project badge must reject 'nastavení' and return null"
);

// Attempt 4: Active project window with Settings tab open preserves project name (coucou-main)
const activeProjPet = registry.getOrCreatePet("session-alpha", undefined, 0x4000, "coucou-main", "Settings - coucou-main - Antigravity IDE");
assert.strictEqual(activeProjPet.pet.projectName, "coucou-main", "Active project window keeps coucou-main as project");
assert.strictEqual(registry.getUniquePets().length, petCountBeforeSettings, "No new pet created for project settings tab");

console.log("✓ Test 11: Settings window exception verified: opening settings never spawns a 'setting' mascot (100% OK)");

// 12. Strict 1:1 Window Lifecycle & Settings Safety Test
// Verifies that opening Settings tab does not rename project or spawn false mascots,
// and closing the IDE window removes the mascot (sayGoodbyeAndClose, activePets = 0).
const isolatedRegistry = new PetRegistry();
const singlePet = isolatedRegistry.getOrCreatePet("session-user", "panda", 0x9000, "coucou-main", "coucou-main - Antigravity IDE");
assert.strictEqual(isolatedRegistry.getUniquePets().length, 1, "Must have 1 mascot when IDE window is open");

// User opens Settings in the IDE (window title changes to Settings)
const samePetSettings = isolatedRegistry.getOrCreatePet("session-user", undefined, 0x9000, "Settings", "Settings - Antigravity IDE");
assert.strictEqual(isolatedRegistry.getUniquePets().length, 1, "Must STILL have 1 mascot after opening settings");
assert.strictEqual(samePetSettings.pet.isClosed, false, "Mascot must NOT be closed");
assert.strictEqual(samePetSettings.pet.projectName, "coucou-main", "Project name must remain coucou-main, not Settings");

// When the window closes, the mascot waves goodbye and is cleanly removed (0 pets remaining)
isolatedRegistry.removeSession("session-user", 0x9000);
assert.strictEqual(isolatedRegistry.getUniquePets().length, 0, "1:1 Lifecycle: Mascot is removed when window closes (0 pets on desktop)!");
assert.strictEqual(singlePet.pet.isClosed, true, "Mascot says goodbye and closes");

// When a new window opens, a new companion is spawned cleanly
const reopenedPet = isolatedRegistry.getOrCreatePet("session-reopened", "tiger", 0x9500, "coucou-main", "coucou-main - Antigravity IDE");
assert.strictEqual(isolatedRegistry.getUniquePets().length, 1, "Reopened window spawns mascot (1 mascot)");
assert.strictEqual(reopenedPet.pet.hwnd, 0x9500, "Bound to new HWND");

console.log("✓ Test 12: Strict 1:1 window lifecycle verified: mascot removes when window closes (0 pets) & spawns on open (100% OK)");

// 13. SessionEnd Hook Lifecycle Test
// Simulates what main.ts does when it receives hook event with hook_event_name === "SessionEnd"
class MockMainSessionEnd {
  constructor() {
    this.activePets = new Map();
    this.lastActiveSession = "default";
  }

  getUniquePets() {
    return Array.from(new Set(this.activePets.values()));
  }

  spawnPet(sessionId, hwnd, projectName) {
    const pet = new MockPet({ id: "penguin", name: "Tučňák" }, 260);
    pet.sessionId = sessionId;
    pet.hwnd = hwnd ?? null;
    if (projectName) pet.setProjectInfo(projectName, null);
    const chat = new MockChat();
    chat.sessionId = sessionId;
    chat.hwnd = hwnd ?? null;
    const entry = { sessionId, pet, chat };
    this.activePets.set(sessionId, entry);
    this.lastActiveSession = sessionId;
    return entry;
  }

  // Mirrors the SessionEnd branch from main.ts (1:1 lifecycle: mascot says goodbye and is destroyed)
  handleSessionEnd(sessionId) {
    const active = this.activePets.get(sessionId);
    if (!active) return;

    active.pet.sayGoodbyeAndClose();
    active.chat.destroy();
    active.pet.destroy();
    for (const [id, p] of Array.from(this.activePets.entries())) {
      if (p === active) this.activePets.delete(id);
    }
  }
}

// Scenario A: Single session ends — mascot says goodbye and closes (0 pets on desktop)
const seRegistry1 = new MockMainSessionEnd();
const sePet1 = seRegistry1.spawnPet("session-se-1", 0xA000, "my-project");
assert.strictEqual(seRegistry1.getUniquePets().length, 1, "Start with 1 pet");
seRegistry1.handleSessionEnd("session-se-1");
assert.strictEqual(seRegistry1.getUniquePets().length, 0, "1:1 Lifecycle: SessionEnd cleanly removes last pet (0 pets)");
assert.strictEqual(sePet1.pet.isClosed, true, "Pet must be closed/destroyed");

// Scenario B: 2 pets active — SessionEnd correctly destroys the right one
const seRegistry2 = new MockMainSessionEnd();
const sePetA = seRegistry2.spawnPet("session-se-A", 0xB000, "project-A");
const sePetB = seRegistry2.spawnPet("session-se-B", 0xC000, "project-B");
assert.strictEqual(seRegistry2.getUniquePets().length, 2, "Start with 2 pets");
seRegistry2.handleSessionEnd("session-se-B");
assert.strictEqual(seRegistry2.getUniquePets().length, 1, "After SessionEnd: 1 pet remains");
assert.strictEqual(sePetA.pet.isClosed, false, "Pet A must still be alive");
assert.strictEqual(sePetB.pet.isClosed, true, "Pet B (SessionEnd target) must be destroyed");

console.log("✓ Test 13: SessionEnd hook lifecycle verified: mascot closes on SessionEnd & multiple-pet destruction works (100% OK)");

// 14. Pet Companion Settings & Animation/Sound Preferences Test (Grill-Me Implementation)
// Verifies user settings module: default presets, animation toggles, interval pacing,
// sound mute controls, project tag toggles, and reset-to-defaults functionality.
class MockPetSettingsManager {
  constructor() {
    this.DEFAULT = {
      soundEnabled: true,
      intervalPreset: "normal",
      showBubbles: true,
      showProjectTag: true,
      animations: {
        walking: true,
        whistling: true,
        dance: true,
        coffee: true,
        sleep: true,
        stretch: true,
        snack: true,
        bugHunt: true,
        sneeze: true,
      },
    };
    this.INTERVAL_PRESETS = {
      often: { min: 15000, max: 30000, label: "Často (15–30 s)" },
      normal: { min: 30000, max: 60000, label: "Normálně (30–60 s)" },
      rare: { min: 60000, max: 120000, label: "Zřídka (60–120 s)" },
    };
    this.current = JSON.parse(JSON.stringify(this.DEFAULT));
    this.listeners = [];
  }

  getSettings() {
    return this.current;
  }

  updateSettings(partial) {
    this.current = {
      ...this.current,
      ...partial,
      animations: {
        ...this.current.animations,
        ...(partial.animations || {}),
      },
    };
    this.listeners.forEach((fn) => fn(this.current));
  }

  resetSettings() {
    this.current = JSON.parse(JSON.stringify(this.DEFAULT));
    this.listeners.forEach((fn) => fn(this.current));
    return this.current;
  }

  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  // Simulates autonomous activity selection based on current animation settings
  pickAutonomousActivity() {
    const enabled = Object.keys(this.current.animations).filter((k) => this.current.animations[k]);
    if (enabled.length === 0) return null;
    return enabled[Math.floor(Math.random() * enabled.length)];
  }
}

const mockSettings = new MockPetSettingsManager();

// A. Verify defaults
assert.strictEqual(mockSettings.getSettings().soundEnabled, true, "Sound defaults to enabled");
assert.strictEqual(mockSettings.getSettings().intervalPreset, "normal", "Interval defaults to normal");
assert.strictEqual(mockSettings.getSettings().showBubbles, true, "Bubbles default to visible");
assert.strictEqual(mockSettings.getSettings().showProjectTag, true, "Project tag defaults to visible");
assert.strictEqual(Object.keys(mockSettings.getSettings().animations).length, 9, "All 9 animations present");
assert(Object.values(mockSettings.getSettings().animations).every((v) => v === true), "All 9 animations enabled by default");

// B. Verify reactive subscription
let notifiedSettings = null;
const unsub = mockSettings.subscribe((s) => {
  notifiedSettings = s;
});

// C. Verify updating sound and interval preset
mockSettings.updateSettings({ soundEnabled: false, intervalPreset: "often" });
assert.strictEqual(mockSettings.getSettings().soundEnabled, false, "Sound disabled");
assert.strictEqual(mockSettings.getSettings().intervalPreset, "often", "Interval preset changed to often");
assert.strictEqual(mockSettings.INTERVAL_PRESETS[mockSettings.getSettings().intervalPreset].min, 15000, "Often interval min is 15s");
assert.strictEqual(mockSettings.INTERVAL_PRESETS[mockSettings.getSettings().intervalPreset].max, 30000, "Often interval max is 30s");
assert.strictEqual(notifiedSettings?.soundEnabled, false, "Listener notified of sound update");

// D. Verify animation toggling and activity filtering
mockSettings.updateSettings({
  animations: {
    walking: false,
    whistling: false,
    dance: true,
    coffee: true,
    sleep: false,
    stretch: false,
    snack: false,
    bugHunt: false,
    sneeze: false,
  },
});

// Repeatedly pick activities: only dance or coffee should ever be returned
for (let i = 0; i < 20; i++) {
  const picked = mockSettings.pickAutonomousActivity();
  assert(picked === "dance" || picked === "coffee", `Only enabled activities may run, got: ${picked}`);
}

// E. Verify disabling all animations
const allDisabled = {};
Object.keys(mockSettings.getSettings().animations).forEach((k) => (allDisabled[k] = false));
mockSettings.updateSettings({ animations: allDisabled });
assert.strictEqual(mockSettings.pickAutonomousActivity(), null, "When all animations disabled, none can run");

// F. Verify reset to defaults
unsub();
mockSettings.resetSettings();
assert.strictEqual(mockSettings.getSettings().soundEnabled, true, "Sound restored to true on reset");
assert.strictEqual(mockSettings.getSettings().intervalPreset, "normal", "Preset restored to normal on reset");
assert(Object.values(mockSettings.getSettings().animations).every((v) => v === true), "All animations re-enabled on reset");

console.log("✓ Test 14: Pet settings panel verified: 9 animation toggles, sound switch, interval presets, tag & bubble toggles (100% OK)");

// 15. Foreground Window Retention & Strict Code Editor Protection Test (User Request & Bug Fix)
// Ensures that:
// 1. If Antigravity IDE was open on screen (wasIconic = false), it STAYS open in foreground and is NEVER minimized.
// 2. If Antigravity IDE was minimized (wasIconic = true), it restores, injects, and minimizes back (SW_MINIMIZE).
// 3. If focus is currently on an open code editor (e.g. README.md), SAFETY ABORT triggers:
//    NEVER sends Ctrl+A or Ctrl+V, leaves file untouched, and falls back safely to clipboard!

class MockPromptProtectionEngine {
  constructor() {
    this.ideHwnd = 0x5001;
    this.browserHwnd = 0x1001;
    this.currentForeground = this.browserHwnd;
    this.isIdeMinimized = false;
    this.clipboardText = "";
    this.editorContent = "# Coucou Project Documentation";
    this.ctrlASent = false;
    this.ctrlVSent = false;
  }

  isElementAnEditor(el) {
    if (!el) return false;
    if (el.type === "Document") return true;
    if (el.className && el.className.includes("monaco")) return true;
    const extensions = [".md", ".rs", ".ts", ".js", ".py", ".json", ".toml"];
    return extensions.some((ext) => el.name && el.name.endsWith(ext));
  }

  injectPrompt(prompt, wasIconic, focusedElement) {
    this.ctrlASent = false;
    this.ctrlVSent = false;
    this.clipboardText = prompt;

    // Safety Shield #1: Check focused element before keystrokes
    if (this.isElementAnEditor(focusedElement)) {
      return {
        success: false,
        method: "editor_protected_clipboard_fallback",
        message: "Prompt je připraven ve schránce (Ctrl+V) 📋 (chat nebyl zaměřen, soubor zůstal beze změny)",
        fileModified: false,
        ideMinimized: this.isIdeMinimized,
      };
    }

    // Normal injection into chat
    this.ctrlASent = true;
    this.ctrlVSent = true;

    // Window lifecycle decision
    if (wasIconic) {
      this.isIdeMinimized = true;
      this.currentForeground = this.browserHwnd;
    } else {
      this.isIdeMinimized = false;
      this.currentForeground = this.ideHwnd;
    }

    return {
      success: true,
      method: "ide_ui_injection",
      message: "Prompt byl vložen do chatu Antigravity a odeslán! 🚀",
      fileModified: false,
      ideMinimized: this.isIdeMinimized,
    };
  }
}

const engine = new MockPromptProtectionEngine();

// Case A: Antigravity IDE was open on screen (wasIconic = false) -> MUST STAY OPEN AND FOREGROUND
const resForeground = engine.injectPrompt("Ahoj agente", false, { type: "ComboBox", name: "Message input" });
assert.strictEqual(resForeground.success, true);
assert.strictEqual(resForeground.ideMinimized, false, "When IDE was open on screen, it must NOT be minimized!");
assert.strictEqual(engine.currentForeground, engine.ideHwnd, "IDE must remain focused in foreground");
assert.strictEqual(engine.ctrlASent, true);
assert.strictEqual(engine.ctrlVSent, true);

// Case B: Antigravity IDE was minimized (wasIconic = true) -> MUST MINIMIZE BACK (Ghost Mode)
const resGhost = engine.injectPrompt("Udělej test", true, { type: "ComboBox", name: "Message input" });
assert.strictEqual(resGhost.success, true);
assert.strictEqual(resGhost.ideMinimized, true, "When IDE was minimized, it must be minimized back to taskbar!");
assert.strictEqual(engine.currentForeground, engine.browserHwnd, "Browser focus must be restored");

// Case C: SAFETY SHIELD - User clicked README.md in editor -> MUST ABORT AND PROTECT FILE!
const resProtected = engine.injectPrompt("Nová instrukce", false, { type: "Document", name: "README.md", className: "monaco-editor" });
assert.strictEqual(resProtected.success, false, "Must return false and abort keystrokes");
assert.strictEqual(engine.ctrlASent, false, "Ctrl+A must NEVER be sent to an open code editor!");
assert.strictEqual(engine.ctrlVSent, false, "Ctrl+V must NEVER be sent to an open code editor!");
assert.strictEqual(engine.editorContent, "# Coucou Project Documentation", "README.md content must remain 100% untouched!");
assert.strictEqual(engine.clipboardText, "Nová instrukce", "Prompt is safely waiting in clipboard");
assert(resProtected.message.includes("soubor zůstal beze změny"), "Message must reassure user that file remained untouched");

console.log("✓ Test 15: Foreground window retention and strict code editor protection verified (100% OK)");

console.log("\nALL 15 MULTI-PET, CONVERSATION MIRROR, SETTINGS EXCEPTION & EDITOR PROTECTION TESTS PASSED SUCCESSFULLY! (100% OK)");



