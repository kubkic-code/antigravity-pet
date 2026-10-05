// Shimeji desktop companion engine for Antigravity IDE.
// Renders pixel-art animations, physics, walking, dragging, sound cues, and hit-testing.

import "./pet.css";
import {
  type AnimalInfo,
  type PetState,
  ANIMAL_LIST,
  getAnimalById,
  getAnimalEmoji,
  getAnimalMatrix,
  getRandomAnimal,
  renderSpriteToCanvas,
} from "./animals";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { AgentTask } from "../core/state";
import {
  getPetSettings,
  onPetSettingsChanged,
  INTERVAL_PRESETS,
  type PetAnimationKey,
} from "./pet_settings";

export function cleanProjectBadge(projectName?: string | null, windowTitle?: string | null): string | null {
  if (!projectName) return null;
  const trimmed = projectName.trim();
  if (!trimmed) return null;

  // Check if projectName was mistakenly set to a file or settings
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

export class ShimejiPet {
  private container: HTMLElement;
  private actorEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private shadowEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private bubbleTitleEl: HTMLElement;
  private bubbleBodyEl: HTMLElement;
  private tagEl: HTMLElement;
  private focusIndicatorEl: HTMLElement;

  private animal: AnimalInfo;
  private state: PetState = "idle";
  private facing: "left" | "right" = "right";
  private frame = 0;

  // Focus Mode (Režim soustředění)
  public isFocusMode = false;

  // Physics & placement (within the transparent desktop window)
  public x = 320;
  public y = 900;
  private velocityX = 0;
  private velocityY = 0;
  private readonly gravity = 0.85;

  public getGroundY(): number {
    const h = window.innerHeight || 1080;
    // Actor is 96px tall, Windows taskbar is ~48px at the bottom.
    // Placing y at h - 48 - 96 - 6 puts the mascot paws and shadow cleanly on top of the taskbar.
    return Math.max(100, h - 48 - 96 - 6);
  }

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private petStartX = 0;
  private petStartY = 0;
  private wanderTimer: number | null = null;
  private bubbleTimeout: number | null = null;
  private stateWatchdogTimeout: number | null = null;

  public hwnd: number | null = null;
  public sessionId: string | null = null;
  public projectName: string | null = null;
  public windowTitle: string | null = null;
  public onContextMenu?: () => void;
  public chatOverlay?: {
    isOpen: boolean;
    close: () => void;
    getBoundingClientRect: () => DOMRect;
    updateStatus?: (state: string, text?: string) => void;
    updateAnimal?: (animal: AnimalInfo) => void;
    setProjectInfo?: (projectName?: string | null, windowTitle?: string | null) => void;
    hwnd?: number | null;
  } | null = null;

  private settingsUnsub: (() => void) | null = null;

  public getActorElement(): HTMLElement {
    return this.actorEl;
  }

  public getFocusIndicatorElement(): HTMLElement {
    return this.focusIndicatorEl;
  }

  constructor(parent: HTMLElement, initialAnimal?: AnimalInfo, initialX?: number) {
    this.container = document.createElement("div");
    this.container.className = "shimeji-container";
    parent.appendChild(this.container);

    this.y = this.getGroundY();
    if (initialX !== undefined) {
      this.x = initialX;
    }

    this.animal = initialAnimal ?? getRandomAnimal();

    // Create actor elements
    this.actorEl = document.createElement("div");
    this.actorEl.className = "pet-actor";

    this.shadowEl = document.createElement("div");
    this.shadowEl.className = "pet-shadow";

    this.canvasEl = document.createElement("canvas");
    this.canvasEl.className = "pet-canvas";

    this.tagEl = document.createElement("div");
    this.tagEl.className = "pet-tag";
    this.updateTag();
    this.tagEl.style.display = getPetSettings().showProjectTag ? "" : "none";

    // Speech / thought bubble
    this.bubbleEl = document.createElement("div");
    this.bubbleEl.className = "pet-bubble";
    this.bubbleTitleEl = document.createElement("div");
    this.bubbleTitleEl.className = "pet-bubble-title";
    this.bubbleBodyEl = document.createElement("div");
    this.bubbleBodyEl.className = "pet-bubble-body";

    this.bubbleEl.appendChild(this.bubbleTitleEl);
    this.bubbleEl.appendChild(this.bubbleBodyEl);

    // Focus Mode 4px indicator dot (Grill-Me Focus Mode)
    this.focusIndicatorEl = document.createElement("div");
    this.focusIndicatorEl.className = "focus-indicator status-idle";
    this.focusIndicatorEl.title = "Režim soustředění · Stiskněte 'H' nebo klikněte pro návrat zvířátka";

    this.actorEl.appendChild(this.shadowEl);
    this.actorEl.appendChild(this.bubbleEl);
    this.actorEl.appendChild(this.canvasEl);
    this.actorEl.appendChild(this.tagEl);
    this.actorEl.appendChild(this.focusIndicatorEl);
    this.container.appendChild(this.actorEl);

    this.setupInteractions();
    this.startAnimationLoop();
    this.scheduleWandering();
    this.render();
    this.updatePosition();
    this.pushHitRect();

    this.settingsUnsub = onPetSettingsChanged((settings) => {
      this.tagEl.style.display = settings.showProjectTag ? "" : "none";
      this.scheduleWandering();
    });
  }

  public getAnimal(): AnimalInfo {
    return this.animal;
  }

  public setAnimal(animal: AnimalInfo) {
    this.animal = animal;
    this.updateTag();
    this.render();
  }

  private updateTag() {
    const emoji = getAnimalEmoji(this.animal.id);
    const projectLabel = this.projectName ? `📁 ${this.projectName}` : "";
    this.tagEl.innerHTML = `
      <span class="pet-tag-dot" style="background:${this.animal.palette.primary};box-shadow:0 0 6px ${this.animal.palette.primary};"></span>
      <span class="pet-tag-emoji">${emoji}</span>
      <span class="pet-tag-name">${this.animal.name}</span>
      ${projectLabel ? `<span class="pet-tag-project" title="${this.windowTitle || this.projectName}">${projectLabel}</span>` : ""}
    `;
    this.actorEl.style.setProperty("--pet-accent", this.animal.palette.primary);
    this.actorEl.style.setProperty("--pet-glow", this.animal.palette.primary + "4d");
    this.updateActorTitle();
  }

  private updateActorTitle() {
    const info = this.projectName ? ` · Propojeno s: 📁 ${this.projectName}` : "";
    this.actorEl.title = `${this.animal.name}${info} (Dvojklik pro zaměření okna)`;
  }

  public setProjectInfo(projectName?: string | null, windowTitle?: string | null) {
    if (windowTitle != null) this.windowTitle = windowTitle;
    const cleaned = cleanProjectBadge(projectName, this.windowTitle);
    if (cleaned != null) {
      this.projectName = cleaned;
    } else if (projectName != null && !this.projectName) {
      const fromTitle = cleanProjectBadge(this.windowTitle, undefined);
      if (fromTitle) this.projectName = fromTitle;
    }
    this.updateTag();
    this.chatOverlay?.setProjectInfo?.(this.projectName, this.windowTitle);
  }

  /**
   * Randomly changes the mascot to another distinct animal species.
   */
  public randomAnimal(excludeCurrent = true): AnimalInfo {
    const list = ANIMAL_LIST.filter((id) => !excludeCurrent || id !== this.animal.id);
    const chosenId = list[Math.floor(Math.random() * list.length)] ?? ANIMAL_LIST[0];
    const chosen = getAnimalById(chosenId);
    this.setAnimal(chosen);
    this.chatOverlay?.updateAnimal?.(chosen);
    Sound.play("pop");
    this.spawnSparkle("✨");
    this.spawnSparkle("🎲");
    this.showBubble("🎲 Změna zvířátka!", `Teď jsem ${chosen.name}!`, 3000);
    return chosen;
  }

  public nextAnimal() {
    return this.randomAnimal(true);
  }

  public destroy() {
    if (this.settingsUnsub) {
      this.settingsUnsub();
      this.settingsUnsub = null;
    }
    this.container.remove();
  }

  /**
   * Syncs the pet's behavior and animations with Antigravity IDE state.
   */
  public syncWithTask(task: AgentTask | null | undefined) {
    if (!task) return;

    if (task.hwnd) {
      this.hwnd = task.hwnd;
    }

    const state = task.state;
    const lastStep = task.steps[task.steps.length - 1] ?? "";

    if (state === "working") {
      if (this.state !== "working") {
        this.setState("working");
        Sound.play("work");
      }
      this.showBubble("💻 Kóduji", lastStep || "Provádím akci v projektu...");
    } else if (state === "thinking") {
      if (this.state !== "thinking") {
        this.setState("thinking");
        Sound.play("think");
      }
      this.showBubble("💭 Přemýšlím", lastStep || "Analyzuji kód...");
    } else if (state === "finished") {
      if (this.state !== "finish") {
        this.setState("finish");
        Sound.play("finish");
        this.spawnSparkle("🎉");
        this.spawnSparkle("⭐");
      }
      this.showBubble("✨ Hotovo", lastStep || "Úkol byl dokončen!");
      window.setTimeout(() => {
        if (this.state === "finish") {
          this.setState("idle");
          this.hideBubble();
        }
      }, 5000);
    } else if (state === "error") {
      if (this.state !== "error") {
        this.setState("error");
        Sound.play("error");
      }
      this.showBubble("⚠️ Chyba", lastStep || "Nastala chyba při provádění");
    } else if (state === "idle" && (this.state === "working" || this.state === "thinking")) {
      this.setState("idle");
      this.hideBubble();
    }

    // Always update 4px indicator color based on latest IDE state
    this.updateFocusIndicator(state);

    // Sync live status with chat overlay
    this.chatOverlay?.updateStatus?.(state, lastStep);
  }

  /**
   * Focus Mode (Režim soustředění):
   * Collapses the pet into a tiny, unobtrusive 4px glowing dot that shifts color based on IDE state.
   */
  public toggleFocusMode(enable?: boolean) {
    this.isFocusMode = enable !== undefined ? enable : !this.isFocusMode;
    this.actorEl.classList.toggle("focus-mode", this.isFocusMode);

    if (this.isFocusMode) {
      // Dock the pet cleanly to ground level so the indicator lies directly on the taskbar
      this.y = this.getGroundY();
      this.velocityY = 0;
      this.updatePosition();
      Sound.play("wink");
      this.hideBubble();
      this.updateFocusIndicator(this.state);
    } else {
      Sound.play("pop");
      this.render();
      this.updatePosition();
    }
    this.pushHitRect();
    requestAnimationFrame(() => this.pushHitRect());
  }

  public updateFocusIndicator(state: string) {
    this.focusIndicatorEl.className = "focus-indicator";
    if (state === "working") {
      this.focusIndicatorEl.classList.add("status-working");
      this.focusIndicatorEl.title = "Režim soustředění: 💻 Kóduji · Klikněte pro návrat";
    } else if (state === "thinking") {
      this.focusIndicatorEl.classList.add("status-thinking");
      this.focusIndicatorEl.title = "Režim soustředění: 💭 Přemýšlím · Klikněte pro návrat";
    } else if (state === "finished" || state === "finish") {
      this.focusIndicatorEl.classList.add("status-finished");
      this.focusIndicatorEl.title = "Režim soustředění: ✨ Hotovo · Klikněte pro návrat";
    } else if (state === "error") {
      this.focusIndicatorEl.classList.add("status-error");
      this.focusIndicatorEl.title = "Režim soustředění: ⚠️ Chyba · Klikněte pro návrat";
    } else {
      this.focusIndicatorEl.classList.add("status-idle");
      this.focusIndicatorEl.title = "Režim soustředění: 💤 Klid · Klikněte pro návrat";
    }
  }

  /**
   * Session ended: Mascot waves goodbye, pauses for 5 seconds, then gracefully closes (Grill-Me A3).
   */
  public sayGoodbyeAndClose() {
    this.setState("finish");
    Sound.play("greet");
    this.showBubble("👋 Měj se hezky!", "Relace ukončena...");
    this.spawnSparkle("👋");

    // Fade out and close after 5 seconds
    window.setTimeout(() => {
      this.container.style.transition = "opacity 0.8s ease, transform 0.8s ease";
      this.container.style.opacity = "0";
      this.container.style.transform = "scale(0.8) translateY(20px)";
    }, 4200);

    window.setTimeout(() => {
      if (this.sessionId) {
        void Bridge.closePetSession(this.sessionId);
      }
    }, 5000);
  }

  public getState(): PetState {
    return this.state;
  }

  public setState(nextState: PetState) {
    if (this.state === nextState) return;
    // Stop any active melody when:
    // - leaving dance or walk (whistling) state
    // - entering any agent-driven or drag state
    if (
      this.state === "dance" ||
      this.state === "walk" ||
      nextState === "working" ||
      nextState === "thinking" ||
      nextState === "drag"
    ) {
      Sound.stopAllMelodies();
    }
    this.state = nextState;
    this.frame = 0;
    this.updateFocusIndicator(nextState);
    this.render();

    if (this.stateWatchdogTimeout != null) {
      window.clearTimeout(this.stateWatchdogTimeout);
      this.stateWatchdogTimeout = null;
    }

    if (nextState === "idle") {
      this.hideBubble();
    }

    if (nextState === "working" || nextState === "thinking") {
      // Safety watchdog: if IDE stops or response was received without hook, auto-recover in 12s
      this.stateWatchdogTimeout = window.setTimeout(() => {
        if (this.state === "working" || this.state === "thinking") {
          this.setState("finish");
          this.showBubble("✨ Hotovo", "Úkol byl dokončen!", 3500);
          this.chatOverlay?.updateStatus?.("finished", "Dokončeno ✨");
          window.setTimeout(() => {
            if (this.state === "finish") {
              this.setState("idle");
              this.hideBubble();
              this.chatOverlay?.updateStatus?.("idle");
            }
          }, 3500);
        }
      }, 12000);
    }
  }

  public showBubble(title: string, message: string, durationMs?: number) {
    if (!getPetSettings().showBubbles) return;
    const dotClass =
      this.state === "working"
        ? "working"
        : this.state === "finish"
        ? "finished"
        : this.state === "error"
        ? "error"
        : "";

    this.bubbleTitleEl.innerHTML = `<span class="status-dot ${dotClass}"></span>${title}`;
    this.bubbleBodyEl.textContent = message;
    this.bubbleEl.classList.add("is-visible");

    if (this.bubbleTimeout != null) {
      window.clearTimeout(this.bubbleTimeout);
    }

    const duration = durationMs ?? (this.state === "working" ? 5000 : 4000);
    this.bubbleTimeout = window.setTimeout(() => this.hideBubble(), duration);
  }

  public hideBubble() {
    this.bubbleEl.classList.remove("is-visible");
  }

  private render() {
    const matrix = getAnimalMatrix(this.animal, this.state, this.frame);
    renderSpriteToCanvas(this.canvasEl, matrix, this.animal.palette, 4);

    this.actorEl.classList.toggle("facing-left", this.facing === "left");
    this.actorEl.classList.toggle("facing-right", this.facing === "right");
    this.actorEl.classList.toggle("is-dragging", this.isDragging);
    this.actorEl.classList.toggle("state-idle", this.state === "idle");
    this.actorEl.classList.toggle("state-working", this.state === "working");
    this.actorEl.classList.toggle("state-thinking", this.state === "thinking");
    this.actorEl.classList.toggle("state-finish", this.state === "finish");
    this.actorEl.classList.toggle("state-sleep", this.state === "sleep");
    this.actorEl.classList.toggle("state-coffee", this.state === "coffee");
    this.actorEl.classList.toggle("state-dance", this.state === "dance");
    this.actorEl.classList.toggle("state-stretch", this.state === "stretch");
    this.actorEl.classList.toggle("state-snack", this.state === "snack");
  }

  private updatePosition() {
    this.actorEl.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;

    // Shadow squish / size when airborne
    const distFromGround = this.getGroundY() - this.y;
    const shadowScale = Math.max(0.2, 1 - distFromGround / 140);
    const shadowOpacity = Math.max(0.1, 1 - distFromGround / 120);
    this.shadowEl.style.transform = `scale(${shadowScale})`;
    this.shadowEl.style.opacity = `${shadowOpacity}`;
  }

  /** Pushes the exact interactive bounding boxes to Rust so click-through works cleanly. */
  public pushHitRect() {
    if (this.isFocusMode) {
      const rect = this.focusIndicatorEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        void Bridge.setIslandRect(rect.left - 8, rect.top - 8, rect.width + 16, rect.height + 16);
      }
      return;
    }

    const rects: [number, number, number, number][] = [];

    // Mascot actor hit rect
    const actorRect = this.actorEl.getBoundingClientRect();
    if (actorRect.width > 0 && actorRect.height > 0) {
      rects.push([actorRect.left - 8, actorRect.top - 8, actorRect.width + 16, actorRect.height + 16]);
    }

    // Chat overlay hit rect if open
    if (this.chatOverlay?.isOpen) {
      const chatRect = this.chatOverlay.getBoundingClientRect();
      if (chatRect.width > 0 && chatRect.height > 0) {
        rects.push([chatRect.left - 6, chatRect.top - 6, chatRect.width + 12, chatRect.height + 12]);
      }
    }

    if (rects.length > 0) {
      void Bridge.setIslandRects(rects);
    }
  }

  private startAnimationLoop() {
    let lastTickTime = performance.now();
    let lastHitPush = 0;

    const loop = (now: number) => {
      // 1. Frame cycle for retro 8-bit mascot (~250ms per frame)
      if (now - lastTickTime > 260) {
        lastTickTime = now;
        this.frame++;
        if (!this.isFocusMode) {
          this.render();
        }
      }

      // 2. Physics & movement
      if (this.isDragging) {
        // Position controlled by mouse drag
      } else {
        // Gravity & ground alignment
        const ground = this.getGroundY();
        if (this.y > ground && !this.isDragging) {
          // Mascot was sunken or ground level shifted: elevate cleanly to taskbar top
          this.y = ground;
          this.velocityY = 0;
          this.updatePosition();
        } else if (this.y < ground) {
          this.velocityY += this.gravity;
          this.y += this.velocityY;
          if (this.y >= ground) {
            this.y = ground;
            if (this.velocityY > 2.5) {
              // Bounce
              this.velocityY = -this.velocityY * 0.28;
              Sound.play("blip");
            } else {
              this.velocityY = 0;
              if (this.state === "drag") {
                this.setState("idle");
              }
            }
          }
          this.updatePosition();
        }

        // Horizontal walking along full screen width
        if (this.state === "walk" && !this.isFocusMode) {
          this.x += this.velocityX;
          const minX = 20;
          const maxX = (window.innerWidth || 1920) - 110;

          if (this.x <= minX) {
            this.x = minX;
            this.velocityX = Math.abs(this.velocityX);
            this.facing = "right";
          } else if (this.x >= maxX) {
            this.x = maxX;
            this.velocityX = -Math.abs(this.velocityX);
            this.facing = "left";
          }
          this.updatePosition();
        }
      }

      // 3. Update hit-testing rect periodically (~every 100ms)
      if (now - lastHitPush > 100) {
        lastHitPush = now;
        this.pushHitRect();
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  /** Physics jump helper used by fun interactions and celebratory states */
  public jump(power = -7) {
    if (this.isFocusMode || this.isDragging) return;
    this.velocityY = power;
  }

  /** Autonomous life & activities along the taskbar */
  private scheduleWandering() {
    if (this.wanderTimer != null) {
      window.clearTimeout(this.wanderTimer);
      this.wanderTimer = null;
    }
    const settings = getPetSettings();
    const preset = INTERVAL_PRESETS[settings.intervalPreset] ?? INTERVAL_PRESETS.normal;
    const delay = preset.min + Math.random() * (preset.max - preset.min);
    this.wanderTimer = window.setTimeout(() => {
      if (this.state === "idle" && !this.isDragging && !this.isFocusMode) {
        this.triggerAutonomousActivity();
      }
      this.scheduleWandering();
    }, delay);
  }

  private triggerAutonomousActivity() {
    const settings = getPetSettings();
    const enabledList: PetAnimationKey[] = (Object.keys(settings.animations) as PetAnimationKey[])
      .filter((k) => settings.animations[k]);

    if (enabledList.length === 0) {
      return;
    }

    // 25% of rolls: pet just stays resting peacefully in idle
    if (Math.random() < 0.25) {
      return;
    }

    const picked = enabledList[Math.floor(Math.random() * enabledList.length)];
    this.runActivity(picked);
  }

  public runActivity(activity: PetAnimationKey) {
    switch (activity) {
      case "walking":
        this.startWalking();
        break;
      case "whistling":
        this.startWhistling();
        break;
      case "dance":
        this.startDanceBreak();
        break;
      case "coffee":
        this.startCoffeeBreak();
        break;
      case "snack":
        this.startSnackTime();
        break;
      case "stretch":
        this.startGymStretch();
        break;
      case "sleep":
        this.startPowerNap();
        break;
      case "sneeze":
        this.startSneeze();
        break;
      case "bugHunt":
        this.startBugHunt();
        break;
    }
  }

  /**
   * Manually trigger a random enabled autonomous activity immediately (for testing / settings).
   */
  public triggerRandomActivityNow(): boolean {
    if (this.isFocusMode || this.isDragging || this.state === "working" || this.state === "thinking") {
      return false;
    }
    const settings = getPetSettings();
    const enabledList: PetAnimationKey[] = (Object.keys(settings.animations) as PetAnimationKey[])
      .filter((k) => settings.animations[k]);

    if (enabledList.length === 0) {
      this.showBubble("⚠️ Nastavení", "Všechny animace jsou v nastavení vypnuté!", 3000);
      return false;
    }

    const picked = enabledList[Math.floor(Math.random() * enabledList.length)];
    this.runActivity(picked);
    return true;
  }

  private startWalking() {
    this.setState("walk");
    this.facing = Math.random() > 0.5 ? "right" : "left";
    this.velocityX = (this.facing === "right" ? 1 : -1) * (0.75 + Math.random() * 0.6);

    // Stroll along the taskbar longer (~5-9s)
    const walkDuration = 4800 + Math.random() * 4200;
    window.setTimeout(() => {
      if (this.state === "walk") {
        this.velocityX = 0;
        this.setState("idle");
      }
    }, walkDuration);
  }

  private startWhistling() {
    this.setState("walk");
    this.facing = Math.random() > 0.5 ? "right" : "left";
    this.velocityX = (this.facing === "right" ? 0.6 : -0.6);

    // Whistling melody synthesized via Web Audio API (~5.2s)
    Sound.playWhistle();
    this.spawnSparkle("🎶");

    window.setTimeout(() => {
      if (this.state === "walk") this.spawnSparkle("🎵");
    }, 800);

    window.setTimeout(() => {
      if (this.state === "walk") this.spawnSparkle("✨");
    }, 2000);

    window.setTimeout(() => {
      if (this.state === "walk") this.spawnSparkle("🎶");
    }, 3400);

    window.setTimeout(() => {
      if (this.state === "walk") this.spawnSparkle("🌟");
    }, 4800);

    const whistleQuotes = [
      "🎶 Pískám si do kroku...",
      "🎵 Veselá melodie na liště!",
      "🎶 Čistá hlava, čistý kód!",
      "🎵 Písnička pro lepší soustředění ✨",
    ];
    const quote = whistleQuotes[Math.floor(Math.random() * whistleQuotes.length)];
    this.showBubble("🎶 Pískání", quote, 5500);

    window.setTimeout(() => {
      if (this.state === "walk") {
        this.velocityX = 0;
        this.setState("idle");
      }
    }, 6000);
  }

  private startCoffeeBreak() {
    this.setState("coffee");
    Sound.playSip();
    this.spawnSparkle("☕");

    window.setTimeout(() => {
      if (this.state === "coffee") this.spawnSparkle("💨");
    }, 1000);

    window.setTimeout(() => {
      if (this.state === "coffee") {
        Sound.playSip();
        this.spawnSparkle("✨");
      }
    }, 3600);

    window.setTimeout(() => {
      if (this.state === "coffee") {
        this.spawnSparkle("☕");
        this.spawnSparkle("💨");
      }
    }, 5500);

    const coffeeQuotes = [
      "☕ Káva = tekutá syntaxe...",
      "☕ Doplňuji kofein pro čistý kód!",
      "☕ Pauza na espresso před commitem.",
      "☕ Mmm, čerstvá káva na liště!",
    ];
    const quote = coffeeQuotes[Math.floor(Math.random() * coffeeQuotes.length)];
    this.showBubble("☕ Kávová pauza", quote, 6800);

    window.setTimeout(() => {
      if (this.state === "coffee") {
        this.setState("idle");
      }
    }, 7800);
  }

  private startPowerNap() {
    this.setState("sleep");
    Sound.playNapChime();
    const sleepQuotes = [
      "💤 Zzz... Ladím sny v pozadí...",
      "💤 Jen na chvilku zavřu oči...",
      "💤 Zzz... Garbage collector mé mysli...",
      "💤 Power nap pro rychlejší algoritmy...",
    ];
    const quote = sleepQuotes[Math.floor(Math.random() * sleepQuotes.length)];
    this.showBubble("💤 Šlofík", quote, 6500);

    let zzzCount = 0;
    const zzzInterval = window.setInterval(() => {
      if (this.state === "sleep" && zzzCount < 5) {
        this.spawnSparkle("💤");
        zzzCount++;
      } else {
        window.clearInterval(zzzInterval);
      }
    }, 1200);

    window.setTimeout(() => {
      if (this.state === "sleep") {
        Sound.play("blip");
        this.showBubble("🥱 Už jsem vzhůru!", "Plný energie na další řádky kódu!", 2800);
        this.setState("idle");
      }
    }, 8200);
  }

  private startDanceBreak() {
    this.setState("dance");
    // Play full groovy 8-bit chiptune beat through headphones (~7.5s)!
    Sound.playMusicBeat(7.5);
    this.spawnSparkle("🎧");

    window.setTimeout(() => {
      if (this.state === "dance") {
        this.spawnSparkle("🎵");
        this.spawnSparkle("✨");
      }
    }, 900);

    window.setTimeout(() => {
      if (this.state === "dance") {
        this.spawnSparkle("🎶");
        this.spawnSparkle("🔥");
      }
    }, 2400);

    window.setTimeout(() => {
      if (this.state === "dance") {
        this.spawnSparkle("🕺");
        this.spawnSparkle("⭐");
      }
    }, 4500);

    window.setTimeout(() => {
      if (this.state === "dance") {
        this.spawnSparkle("🎧");
        this.spawnSparkle("✨");
      }
    }, 6200);

    const danceQuotes = [
      "🎧 Hraje retro 8-bit lofi beats...",
      "🎵 Tento beat píše funkce za mě!",
      "🕺 Drop the bass, squash the bug!",
      "🎶 Dobrá muzika = 2x rychlejší commit!",
    ];
    const quote = danceQuotes[Math.floor(Math.random() * danceQuotes.length)];
    this.showBubble("🎵 Music vibes", quote, 7200);

    window.setTimeout(() => {
      if (this.state === "dance") {
        this.setState("idle");
      }
    }, 8200);
  }

  private startGymStretch() {
    this.setState("stretch");
    Sound.play("pop");
    this.spawnSparkle("💪");
    this.spawnSparkle("✨");

    window.setTimeout(() => {
      if (this.state === "stretch") {
        Sound.play("pop");
        this.spawnSparkle("🤸");
      }
    }, 2400);

    window.setTimeout(() => {
      if (this.state === "stretch") {
        this.spawnSparkle("🧘");
        this.spawnSparkle("✨");
      }
    }, 4800);

    const stretchQuotes = [
      "🧘 Nezapomeň se narovnat a protáhnout záda!",
      "💪 3 dřepy a refaktoring jde sám od ruky.",
      "🤸 Protahuji tlapky... ergonomie je základ!",
      "👀 Podívej se do dálky z okna, ať si odpočinou oči!",
    ];
    const quote = stretchQuotes[Math.floor(Math.random() * stretchQuotes.length)];
    this.showBubble("🧘 Rozcvička", quote, 6800);

    window.setTimeout(() => {
      if (this.state === "stretch") {
        this.setState("idle");
      }
    }, 7500);
  }

  private startSnackTime() {
    this.setState("snack");
    Sound.playMunch();

    const snackInfo: Record<string, { emoji: string; text: string }> = {
      panda: { emoji: "🎍", text: "🎍 Křupavý bambus je nejlepší syntaxe!" },
      cat: { emoji: "🐟", text: "🐟 Mňam, čerstvá rybička z datasetu!" },
      dog: { emoji: "🦴", text: "🦴 Moje oblíbená kostička!" },
      monkey: { emoji: "🍌", text: "🍌 Banán plný draslíku a algoritmů!" },
      tiger: { emoji: "🥩", text: "🥩 Pořádná porce energie pro tygra!" },
      fox: { emoji: "🍓", text: "🍓 Sladké lesní jahody!" },
      penguin: { emoji: "🐟", text: "🐟 Lahodná zmrzlá rybka!" },
      elephant: { emoji: "🍎", text: "🍎 Křupavé jablíčko!" },
    };

    const info = snackInfo[this.animal.id] ?? { emoji: "🍎", text: "🍎 Svačinka pro doplnění cukru!" };
    this.spawnSparkle(info.emoji);

    window.setTimeout(() => {
      if (this.state === "snack") this.spawnSparkle("❤️");
    }, 1000);

    window.setTimeout(() => {
      if (this.state === "snack") {
        Sound.playMunch();
        this.spawnSparkle("✨");
      }
    }, 3400);

    window.setTimeout(() => {
      if (this.state === "snack") this.spawnSparkle("😋");
    }, 5200);

    this.showBubble("🍴 Svačinka", info.text, 6800);

    window.setTimeout(() => {
      if (this.state === "snack") {
        this.setState("idle");
      }
    }, 7800);
  }

  private startBugHunt() {
    this.setState("thinking");
    this.showBubble("🔍 Pozor!", "Vidím na liště podezřelého brouka...", 3000);
    this.spawnSparkle("🐛");

    window.setTimeout(() => {
      if (this.state === "thinking") {
        this.jump();
        this.setState("finish");
        Sound.play("finish");
        this.spawnSparkle("💥");
        this.spawnSparkle("✨");
        this.showBubble("🐛💥 Zašlápnuto!", "Brouk v kódu vyřešen! Plocha je čistá.", 3800);

        window.setTimeout(() => {
          if (this.state === "finish") {
            this.setState("idle");
          }
        }, 4000);
      }
    }, 2800);
  }

  private startSneeze() {
    this.showBubble("🤧", "...něco mě šimrá v nose...", 1800);

    window.setTimeout(() => {
      // Preemption guard: if agent started working/thinking during the tickle delay, abort sneeze
      if (this.state !== "working" && this.state !== "thinking" && !this.isDragging) {
        Sound.playSneeze(() => {
          // Callback triggers synchronously when the "-CHOO!" explosive burst hits
          if (this.state !== "working" && this.state !== "thinking" && !this.isDragging) {
            this.jump(-8);
            this.spawnSparkle("✨");
            this.spawnSparkle("💨");
            this.showBubble("🤧 A-PČÍK!", "Omlouvám se, asi je v kódu moc prachu!", 3500);
          }
        });
      }
    }, 1800);
  }

  private setupInteractions() {
    // 1. Mouse Dragging & Middle-click Randomizer
    this.actorEl.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        // Middle click (wheel click): randomly change animal mascot!
        e.preventDefault();
        e.stopPropagation();
        this.randomAnimal();
        return;
      }
      if (e.button === 0) {
        // Left click: start dragging
        Sound.stopAllMelodies();
        this.isDragging = true;
        this.setState("drag");
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.petStartX = this.x;
        this.petStartY = this.y;
        this.velocityY = 0;
        Sound.play("pop");
        e.preventDefault();
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        const newX = this.petStartX + dx;
        const newY = this.petStartY + dy;
        this.x = Math.max(0, Math.min((window.innerWidth || 1920) - 96, newX));
        this.y = Math.max(0, Math.min(this.getGroundY() + 10, newY));
        this.updatePosition();
      }
    });

    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.velocityY = 0; // Let gravity pull it down
        this.pushHitRect();
      }
    });

    // Clicking the 4px Focus Indicator restores the animal
    this.focusIndicatorEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFocusMode(false);
    });

    // 2. Double-click: Focus IDE window & joyful celebration jump (Grill-Me A4)
    this.actorEl.addEventListener("dblclick", () => {
      this.setState("finish");
      Sound.play("finish");
      this.spawnSparkle("🎯");
      this.spawnSparkle("✨");
      const proj = this.projectName || "Antigravity IDE";
      this.showBubble(`🎯 Okno: ${proj}`, "Aktivuji tvoje IDE...");
      void Bridge.focusIdeWindow(this.hwnd || undefined).then((targetHwnd) => {
        if (targetHwnd) {
          this.hwnd = targetHwnd;
          if (this.chatOverlay) {
            this.chatOverlay.hwnd = targetHwnd;
          }
        }
      });
      this.chatOverlay?.updateStatus?.("idle");
      window.setTimeout(() => {
        if (this.state === "finish") {
          this.setState("idle");
          this.hideBubble();
        }
      }, 2500);
    });

    // 3. Right-click: Open chat overlay (Grill-Me A2) or cycle animal
    this.actorEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.onContextMenu) {
        this.onContextMenu();
      } else {
        this.nextAnimal();
      }
    });

    // 4. Hover effect: greeting animation, friendly wave & sound
    let hoverCooldown = 0;
    let greetingTimeout: number | null = null;
    this.actorEl.addEventListener("mouseenter", () => {
      if (this.isFocusMode || this.isDragging) return;
      const now = Date.now();
      if (now - hoverCooldown > 1200) {
        hoverCooldown = now;
        Sound.play("greet");

        // Trigger visual hop and wave animation
        this.actorEl.classList.add("is-greeting");
        if (greetingTimeout != null) {
          window.clearTimeout(greetingTimeout);
        }
        greetingTimeout = window.setTimeout(() => {
          this.actorEl.classList.remove("is-greeting");
          greetingTimeout = null;
        }, 650);

        // Spawn friendly waving hand particle
        this.spawnSparkle("👋");

        // If mascot is idle or wandering, show friendly greeting speech bubble
        if (this.state === "idle" || this.state === "walk") {
          const greetings = [
            `Ahoj! 👋`,
            `${this.animal.name} tě zdraví! 🐾`,
            `Jsem tady! ✨`,
            `Ahojky! 👋`,
          ];
          const text = greetings[Math.floor(Math.random() * greetings.length)];
          this.showBubble("👋 Pozdrav", text, 1800);
        }
      }
    });

  }

  public spawnSparkle(emoji: string) {
    const sparkle = document.createElement("div");
    sparkle.className = "pet-sparkle";
    sparkle.textContent = emoji;
    sparkle.style.left = `${Math.round(this.x + 24 + Math.random() * 32)}px`;
    sparkle.style.top = `${Math.round(this.y - 12 + Math.random() * 20)}px`;
    this.container.appendChild(sparkle);

    window.setTimeout(() => {
      sparkle.remove();
    }, 800);
  }
}
