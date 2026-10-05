// Antigravity Pet - Desktop Shimeji companion entry point (Multi-bot & Chat Mirror ready).
// Connects to Antigravity IDE events, animates pixel-art mascots, handles physics/drag and two-way chat mirror.

import "./style.css";
import "./pet/pet.css";
import "./pet/chat.css";
import { Bridge, IS_TAURI, onEvent } from "./core/bridge";
import { Sound } from "./core/sound";
import { State, type Settings } from "./core/state";
import { registerHookHandlers } from "./core/hooks";
import { ShimejiPet } from "./pet/shimeji";
import { ANIMAL_LIST, ANIMALS, getAnimalById, type AnimalId } from "./pet/animals";
import { ChatOverlay } from "./pet/chat_overlay";
import { getPetSettings, onPetSettingsChanged } from "./pet/pet_settings";

interface ActivePet {
  sessionId: string;
  pet: ShimejiPet;
  chat: ChatOverlay;
}

// KEEP IN SYNC: isSettingsName and isSettingsWindow are duplicated intentionally in:
//   - scripts/test_multi_pet.mjs (lines 68–112) — for unit testing without module imports
//   - src-tauri/src/window_finder.rs — is_settings_name() / is_settings_window()
// If you add a new locale/variant here, update ALL THREE locations!
export function isSettingsName(name?: string | null): boolean {
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

export function isSettingsWindow(title?: string | null, projectName?: string | null): boolean {
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


async function main() {
  const root = document.getElementById("root");
  if (!root) return;

  // 1. Audio preload & sound settings sync
  void Sound.preload();
  Sound.setEnabled(getPetSettings().soundEnabled);
  onPetSettingsChanged((s) => {
    Sound.setEnabled(s.soundEnabled);
  });

  // 2. Parse window URL parameters
  const params = new URLSearchParams(window.location.search);
  const urlSession = params.get("session");
  const urlAnimal = params.get("animal");
  const urlHwnd = params.get("hwnd") ? parseInt(params.get("hwnd")!, 10) : null;
  const windowLabel = urlSession
    ? `pet-${urlSession.replace(/[^a-zA-Z0-9-]/g, "")}`
    : "island";

  // 3. Boot information from Tauri
  const boot = await Bridge.boot();
  if (boot) {
    State.settings = { ...State.settings, ...boot.settings };
  }
  State.loadIntegrationTasks();

  // 4. Multi-pet Session Registry
  const activePets = new Map<string, ActivePet>();
  let lastActiveSession = urlSession || "default";

  function pushAllHitRects() {
    const allRects: [number, number, number, number][] = [];
    const uniquePets = new Set(activePets.values());
    for (const { pet, chat } of uniquePets) {
      if (pet.isFocusMode) {
        const indRect = pet.getFocusIndicatorElement().getBoundingClientRect();
        if (indRect.width > 0 && indRect.height > 0) {
          allRects.push([indRect.left - 8, indRect.top - 8, indRect.width + 16, indRect.height + 16]);
        }
        continue;
      }
      const actorRect = pet.getActorElement().getBoundingClientRect();
      if (actorRect.width > 0 && actorRect.height > 0) {
        allRects.push([actorRect.left - 8, actorRect.top - 8, actorRect.width + 16, actorRect.height + 16]);
      }
      if (chat.isOpen) {
        const chatRect = chat.getBoundingClientRect();
        if (chatRect.width > 0 && chatRect.height > 0) {
          allRects.push([chatRect.left - 6, chatRect.top - 6, chatRect.width + 12, chatRect.height + 12]);
        }
      }
    }
    void Bridge.setIslandRects(allRects);
  }

  // Hit-rect is pushed every ~100ms from within each pet's requestAnimationFrame loop (shimeji.ts).
  // pushAllHitRects() is called explicitly at key lifecycle events: pet spawn, destroy, chat open/close.
  // No extra setInterval needed — it would cause redundant IPC calls proportional to number of active pets.

  function getOrCreatePet(
    sessionId: string,
    animalHint?: string,
    hwnd?: number,
    projectName?: string,
    windowTitle?: string,
  ): ActivePet {
    // EXCEPTION: Never spawn a pet companion for a Settings window
    if (isSettingsWindow(windowTitle, projectName)) {
      const existing =
        activePets.get(sessionId) ||
        (hwnd ? Array.from(activePets.values()).find((p) => p.pet.hwnd === hwnd) : undefined);
      if (existing) return existing;
      return activePets.get(lastActiveSession) ?? Array.from(activePets.values())[0] ?? initialPet;
    }

    lastActiveSession = sessionId;

    // 1. Direct match by sessionId
    let existing = activePets.get(sessionId);
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
      for (const petEntry of activePets.values()) {
        if (petEntry.pet.hwnd === hwnd) {
          activePets.set(sessionId, petEntry);
          if (projectName || windowTitle) {
            petEntry.pet.setProjectInfo(projectName, windowTitle);
          }
          return petEntry;
        }
      }
    }

    // 3. Adopt an unbound idle pet (initial placeholder or remaining single pet) ONLY IF it has no window bound yet
    const uniquePetsList = Array.from(new Set(activePets.values()));
    const unboundEntry = uniquePetsList.find((p) => p.pet.hwnd == null);
    if (unboundEntry && sessionId !== "default") {
      for (const [id, p] of Array.from(activePets.entries())) {
        if (p === unboundEntry) {
          activePets.delete(id);
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
      activePets.set(sessionId, unboundEntry);
      return unboundEntry;
    }

    // 4. Spawn a BRAND NEW pet companion for this new window/session!
    // Pick a distinct animal mascot not used by any currently visible pet
    const usedAnimalIds = new Set(Array.from(activePets.values()).map((p) => p.pet.getAnimal().id));
    const available = ANIMAL_LIST.filter((a) => !usedAnimalIds.has(a));
    const chosenId: AnimalId =
      animalHint && animalHint in ANIMALS && !usedAnimalIds.has(animalHint as AnimalId)
        ? (animalHint as AnimalId)
        : available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : ANIMAL_LIST[Math.floor(Math.random() * ANIMAL_LIST.length)];
    const animal = getAnimalById(chosenId);

    // Stagger spawn position across the taskbar so companions don't overlap
    const uniquePets = Array.from(new Set(activePets.values()));
    const existingX = uniquePets.map((p) => p.pet.x);
    let spawnX = 260;
    if (existingX.length > 0) {
      const maxX = Math.max(...existingX);
      spawnX = maxX + 180;
    }
    const screenWidth = window.innerWidth || 1920;
    if (spawnX > screenWidth - 160) {
      spawnX = 140 + ((uniquePets.length * 160) % Math.max(300, screenWidth - 300));
    }

    const pet = new ShimejiPet(root!, animal, spawnX);
    pet.sessionId = sessionId;
    pet.hwnd = hwnd ?? null;
    if (projectName || windowTitle) {
      pet.setProjectInfo(projectName, windowTitle);
    }

    const chat = new ChatOverlay(root!, pet, windowLabel);
    chat.sessionId = sessionId;
    chat.hwnd = hwnd ?? null;
    if (projectName || windowTitle) {
      chat.setProjectInfo(projectName, windowTitle);
    }
    pet.chatOverlay = chat;

    pet.onContextMenu = () => {
      // Close other open chats to prevent screen clutter
      for (const other of activePets.values()) {
        if (other.pet !== pet && other.chat.isOpen) {
          other.chat.close();
        }
      }
      lastActiveSession = sessionId;
      chat.toggle();
    };

    const newActive: ActivePet = { sessionId, pet, chat };
    activePets.set(sessionId, newActive);

    // If there is already at least one companion, play greet sound and introduce the new companion
    if (uniquePets.length >= 1) {
      Sound.play("greet");
      pet.showBubble("👋 Nový parťák!", `Jsem ${animal.name} pro tvoje další okno!`);
    }

    pushAllHitRects();
    return newActive;
  }

  // Create initial mascot with a randomized animal
  const randomInitialAnimal = ANIMAL_LIST[Math.floor(Math.random() * ANIMAL_LIST.length)];
  const initialPet = getOrCreatePet(
    urlSession || "default",
    urlAnimal || randomInitialAnimal,
    urlHwnd || undefined,
  );

  function refreshPetLabels() {
    const uniquePets = Array.from(new Set(activePets.values()));
    if (uniquePets.length > 1) {
      uniquePets.forEach((p, idx) => {
        if (!p.pet.projectName) {
          p.pet.setProjectInfo(`Okno #${idx + 1}`);
        }
      });
    }
  }

  // 5. Handle dynamic session assignment event from Rust
  await onEvent<{
    sessionId: string;
    animalId: string;
    hwnd?: number;
    cwd?: string;
    windowTitle?: string;
    projectName?: string;
  }>("session-assigned", (data) => {
    // EXCEPTION: Never spawn a pet for a Settings window
    if (isSettingsWindow(data.windowTitle, data.projectName)) {
      return;
    }
    const active = getOrCreatePet(data.sessionId, data.animalId, data.hwnd, data.projectName, data.windowTitle);
    if (data.hwnd) {
      active.pet.hwnd = data.hwnd;
      active.chat.hwnd = data.hwnd;
    }
    if (data.projectName || data.windowTitle) {
      active.pet.setProjectInfo(data.projectName, data.windowTitle);
    }
    refreshPetLabels();
  });

  // 5a. Handle dynamic session metadata updates (window title or project changed)
  await onEvent<{
    sessionId: string;
    hwnd?: number;
    windowTitle?: string;
    projectName?: string;
  }>("session-updated", (data) => {
    // Do not rename an active project to Settings
    if (isSettingsName(data.projectName)) {
      return;
    }
    let targetPet: ActivePet | undefined = activePets.get(data.sessionId);
    if (!targetPet && data.hwnd) {
      for (const p of activePets.values()) {
        if (p.pet.hwnd === data.hwnd) {
          targetPet = p;
          break;
        }
      }
    }
    if (targetPet) {
      targetPet.pet.setProjectInfo(data.projectName, data.windowTitle);
    }
    refreshPetLabels();
  });

  // 5b. Handle dynamic session removal when IDE window closes
  await onEvent<{ sessionId: string; hwnd?: number }>("session-removed", (data) => {
    let targetPet: ActivePet | undefined = activePets.get(data.sessionId);
    if (!targetPet && data.hwnd) {
      for (const p of activePets.values()) {
        if (p.pet.hwnd === data.hwnd) {
          targetPet = p;
          break;
        }
      }
    }
    const uniquePets = Array.from(new Set(activePets.values()));
    // CRITICAL SAFEGUARD: Never destroy the last remaining mascot on the desktop!
    // If only one pet exists, it should simply become an idle desktop companion.
    if (uniquePets.length <= 1) {
      if (targetPet) {
        targetPet.pet.hwnd = null;
        targetPet.chat.hwnd = null;
        targetPet.pet.setProjectInfo(null, null);
        targetPet.chat.setProjectInfo(null, null);
      }
      return;
    }
    if (targetPet) {
      targetPet.pet.sayGoodbyeAndClose();
      const petToDestroy = targetPet;
      window.setTimeout(() => {
        petToDestroy.chat.destroy();
        petToDestroy.pet.destroy();
        for (const [id, p] of Array.from(activePets.entries())) {
          if (p === petToDestroy) {
            activePets.delete(id);
          }
        }
        pushAllHitRects();
      }, 5500);
    }
  });

  // Sync primary pet with active Antigravity IDE task
  State.subscribe(() => {
    let focusPet: ActivePet | undefined;
    if (State.focusTask?.hwnd) {
      for (const p of activePets.values()) {
        if (p.pet.hwnd === State.focusTask.hwnd) {
          focusPet = p;
          break;
        }
      }
    }
    if (!focusPet) {
      focusPet = activePets.get(lastActiveSession) ?? Array.from(activePets.values())[0];
    }
    if (focusPet) {
      focusPet.pet.syncWithTask(State.focusTask);
    }
  });

  if (State.focusTask) {
    initialPet.pet.syncWithTask(State.focusTask);
  }

  // 6. Hook routing for Antigravity events
  registerHookHandlers();

  await onEvent<Record<string, unknown>>("hook", (payload) => {
    const eventName = payload.hook_event_name as string | undefined;
    const sessionId =
      (payload.session_id as string | undefined) ??
      (payload.conversation_id as string | undefined) ??
      "default";
    const hwnd = typeof payload.hwnd === "number" ? payload.hwnd : undefined;

    const active = getOrCreatePet(sessionId, undefined, hwnd);
    const hookProject =
      (payload.projectName as string | undefined) ??
      (typeof payload.cwd === "string"
        ? payload.cwd.split(/[/\\]/).filter(Boolean).pop()
        : undefined);
    if (hookProject) {
      active.pet.setProjectInfo(hookProject);
    }
    refreshPetLabels();
    active.chat.ingestIdeEvent(payload);

    // CRITICAL: Always broadcast live hook events to any mascot whose chat overlay is currently OPEN!
    for (const petEntry of new Set(activePets.values())) {
      if (petEntry !== active && petEntry.chat.isOpen) {
        petEntry.chat.ingestIdeEvent(payload);
      }
    }

    // If task has stopped or completed, ensure all mascots complete their work/finish cycle
    if (eventName === "Stop" || eventName === "PostInvocation") {
      const focusPet = activePets.get(lastActiveSession);
      if (focusPet && focusPet !== active && !focusPet.chat.isOpen) {
        focusPet.chat.ingestIdeEvent(payload);
      }
      for (const petEntry of new Set(activePets.values())) {
        if (petEntry !== active && !petEntry.chat.isOpen) {
          petEntry.chat.ingestIdeEvent(payload);
        }
      }
    }

    if (eventName === "SessionEnd") {
      // CRITICAL SAFEGUARD: Never destroy the last remaining mascot on the desktop!
      // (Mirrors the same protection in the session-removed event handler)
      const uniquePetsNow = Array.from(new Set(activePets.values()));
      if (uniquePetsNow.length <= 1) {
        active.pet.hwnd = null;
        active.chat.hwnd = null;
        active.pet.setProjectInfo(null, null);
        active.chat.setProjectInfo(null, null);
        return;
      }
      active.pet.sayGoodbyeAndClose();
      const petToDestroy = active;
      window.setTimeout(() => {
        petToDestroy.chat.destroy();
        petToDestroy.pet.destroy();
        for (const [id, p] of Array.from(activePets.entries())) {
          if (p === petToDestroy) {
            activePets.delete(id);
          }
        }
        pushAllHitRects();
      }, 5500);
    }
  });

  // 7. Tray event handlers
  await onEvent<string>("tray", (what) => {
    const active = activePets.get(lastActiveSession) ?? initialPet;
    switch (what) {
      case "settings":
        void Bridge.openSettingsWindow();
        break;
      case "open":
        active.pet.showBubble("👋 Ahoj!", `Jsem tvůj pomocník ${active.pet.getAnimal().name}!`);
        Sound.play("greet");
        break;
      case "toggle_focus":
        for (const p of activePets.values()) {
          p.pet.toggleFocusMode();
        }
        break;
      case "pause":
        State.paused = !State.paused;
        void Bridge.setPaused(State.paused);
        for (const p of activePets.values()) {
          if (State.paused) {
            p.pet.showBubble("💤 Pauza", "Pozastaveno");
          } else {
            p.pet.showBubble("⚡ Aktivní", "Znovu sleduji Antigravity IDE");
          }
        }
        break;
    }
  });

  // 8. Screen & settings changes
  await onEvent<null>("screen-changed", () => void Bridge.reposition());
  await onEvent<Settings>("settings-changed", (s) => {
    State.settings = { ...State.settings, ...s };
  });

  // 9. Hotkeys
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const active = activePets.get(lastActiveSession) ?? initialPet;

    switch (e.key) {
      case "1":
        State.updateTask("integration_antigravity", "idle");
        break;
      case "2":
        State.updateTask("integration_antigravity", "thinking");
        State.appendStep("integration_antigravity", "Analyzuji kód a navrhuji řešení...");
        break;
      case "3":
        State.updateTask("integration_antigravity", "working");
        State.appendStep("integration_antigravity", "Upravuji soubor src/pet/shimeji.ts");
        break;
      case "4":
        State.updateTask("integration_antigravity", "finished");
        State.appendStep("integration_antigravity", "Všechny testy úspěšně prošly!");
        break;
      case "5":
        State.updateTask("integration_antigravity", "error");
        State.appendStep("integration_antigravity", "Chyba při kompilaci kódu");
        break;
      case "6":
        active.pet.sayGoodbyeAndClose();
        break;
      case "c":
      case "C":
        lastActiveSession = active.sessionId;
        active.chat.toggle();
        break;
      case "h":
      case "H":
        for (const p of activePets.values()) {
          p.pet.toggleFocusMode();
        }
        break;
      case "r":
      case "R":
      case " ":
        active.pet.randomAnimal();
        break;
    }
  });

  if (!IS_TAURI) {
    document.addEventListener("click", () => Sound.resume(), { once: true });
  }
}

void main();
