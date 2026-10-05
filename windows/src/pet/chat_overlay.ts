// Two-way Antigravity IDE Chat Overlay Mirror (Phase 5).
// Renders complete conversation history, reflects IDE events in real-time,
// and dispatches prompts directly into the project.

import "./chat.css";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import type { AnimalInfo } from "./animals";
import { cleanProjectBadge, type ShimejiPet } from "./shimeji";
import {
  getPetSettings,
  savePetSettings,
  updatePetSettings,
  resetPetSettings,
  ANIMATION_META,
  INTERVAL_PRESETS,
  type PetAnimationKey,
  type IntervalPreset,
} from "./pet_settings";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  time: string;
  toolName?: string;
  stepIndex?: number;
}

export class ChatOverlay {
  private container: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private avatarEl: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private statusBadgeEl: HTMLElement;
  private statusDotEl: HTMLElement;
  private statusTextEl: HTMLElement;
  private diagnosticsEl: HTMLElement;
  private settingsEl: HTMLElement;
  private scrollDownBtn: HTMLButtonElement;
  private isDiagnosticsOpen = false;
  public isSettingsOpen = false;
  private currentStatus = "idle";

  private pet: ShimejiPet;
  private animal: AnimalInfo;
  private windowLabel: string;
  public sessionId: string;
  public hwnd: number | null = null;
  public projectName: string | null = null;
  public windowTitle: string | null = null;

  public isOpen = false;
  private messages: ChatMessage[] = [];
  private syncPollTimer: number | null = null;
  private lastKnownMtime = 0;
  private lastKnownFileSize = 0;
  private totalHistoryCount = 0;
  private hasMoreHistory = false;
  private isLoadingHistory = false;

  constructor(parent: HTMLElement, pet: ShimejiPet, windowLabel = "island") {
    this.pet = pet;
    this.animal = pet.getAnimal();
    this.windowLabel = windowLabel;
    this.sessionId = pet.sessionId || "default";
    this.hwnd = pet.hwnd;

    this.container = document.createElement("div");
    this.container.className = "chat-overlay";

    // 1. Header
    const headerEl = document.createElement("div");
    headerEl.className = "chat-header";

    const leftGroup = document.createElement("div");
    leftGroup.className = "chat-header-left";

    this.avatarEl = document.createElement("div");
    this.avatarEl.className = "chat-avatar";
    this.avatarEl.textContent = this.animalEmoji();
    this.avatarEl.style.cursor = "pointer";
    this.avatarEl.title = "🎲 Klikni pro náhodnou změnu zvířátka";
    this.avatarEl.addEventListener("click", () => {
      this.pet.randomAnimal();
    });

    const titleGroup = document.createElement("div");
    titleGroup.className = "chat-title-group";

    this.titleEl = document.createElement("div");
    this.titleEl.className = "chat-title";

    this.statusBadgeEl = document.createElement("div");
    this.statusBadgeEl.className = "chat-status-badge status-idle";

    this.statusDotEl = document.createElement("span");
    this.statusDotEl.className = "chat-status-dot";

    this.statusTextEl = document.createElement("span");
    this.statusTextEl.className = "chat-status-text";
    this.statusTextEl.textContent = "Připraven";

    this.statusBadgeEl.appendChild(this.statusDotEl);
    this.statusBadgeEl.appendChild(this.statusTextEl);

    this.subtitleEl = document.createElement("div");
    this.subtitleEl.className = "chat-subtitle";
    this.updateHeaderProject();

    titleGroup.appendChild(this.titleEl);
    titleGroup.appendChild(this.statusBadgeEl);
    titleGroup.appendChild(this.subtitleEl);
    leftGroup.appendChild(this.avatarEl);
    leftGroup.appendChild(titleGroup);

    const actionGroup = document.createElement("div");
    actionGroup.className = "chat-header-actions";

    // Randomize animal mascot button (🎲)
    const randomAnimalBtn = document.createElement("button");
    randomAnimalBtn.className = "chat-random-animal-btn";
    randomAnimalBtn.innerHTML = "🎲";
    randomAnimalBtn.title = "Náhodně změnit zvířátko (R / Mezerník)";
    randomAnimalBtn.addEventListener("click", () => {
      this.pet.randomAnimal();
    });

    // Settings button (⚙️)
    const settingsBtn = document.createElement("button");
    settingsBtn.className = "chat-settings-btn";
    settingsBtn.innerHTML = "⚙️";
    settingsBtn.title = "Nastavení zvířátka (animace, zvuky, intervaly)";
    settingsBtn.addEventListener("click", () => {
      Sound.play("blip");
      this.toggleSettings();
    });

    // Report / Diagnostics button
    const reportBtn = document.createElement("button");
    reportBtn.className = "chat-report-btn";
    reportBtn.innerHTML = "📊";
    reportBtn.title = "Zobrazit diagnostický report spojení a událostí";
    reportBtn.addEventListener("click", () => {
      Sound.play("blip");
      void this.toggleDiagnostics();
    });

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "chat-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Zavřít chat (Esc)";
    closeBtn.addEventListener("click", () => this.close());

    actionGroup.appendChild(randomAnimalBtn);
    actionGroup.appendChild(settingsBtn);
    actionGroup.appendChild(reportBtn);
    actionGroup.appendChild(closeBtn);

    headerEl.appendChild(leftGroup);
    headerEl.appendChild(actionGroup);

    // 2. Messages container
    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "chat-messages";

    // 2b. Diagnostics container overlay
    this.diagnosticsEl = document.createElement("div");
    this.diagnosticsEl.className = "chat-diagnostics-view";
    this.diagnosticsEl.style.display = "none";

    // 2d. Settings container overlay
    this.settingsEl = document.createElement("div");
    this.settingsEl.className = "chat-settings-view";
    this.settingsEl.style.display = "none";

    // 2c. Floating smart scroll indicator
    this.scrollDownBtn = document.createElement("button");
    this.scrollDownBtn.className = "chat-scroll-down-badge";
    this.scrollDownBtn.innerHTML = "⬇️ Nová zpráva";
    this.scrollDownBtn.style.display = "none";
    this.scrollDownBtn.addEventListener("click", () => {
      this.scrollToBottom(true);
      this.hideScrollDownBadge();
    });

    // 3. Input bar
    const inputBar = document.createElement("div");
    inputBar.className = "chat-input-bar";

    this.inputEl = document.createElement("input");
    this.inputEl.className = "chat-input";
    this.inputEl.type = "text";
    this.inputEl.placeholder = "Napiš prompt pro Antigravity IDE... (Enter)";

    this.sendBtn = document.createElement("button");
    this.sendBtn.className = "chat-send-btn";
    this.sendBtn.innerHTML = "➤";
    this.sendBtn.title = "Odeslat prompt";

    inputBar.appendChild(this.inputEl);
    inputBar.appendChild(this.sendBtn);

    this.container.appendChild(headerEl);
    this.container.appendChild(this.messagesEl);
    this.container.appendChild(this.diagnosticsEl);
    this.container.appendChild(this.settingsEl);
    this.container.appendChild(this.scrollDownBtn);
    this.container.appendChild(inputBar);
    parent.appendChild(this.container);

    this.setupEvents();
    void this.loadConversationHistory(true);
  }

  public getBoundingClientRect(): DOMRect {
    return this.container.getBoundingClientRect();
  }

  public updateAnimal(animal: AnimalInfo) {
    this.animal = animal;
    this.avatarEl.textContent = this.animalEmoji();
    this.sendBtn.style.background = this.animal.palette.primary;
    this.updateHeaderProject();
  }

  public toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public open() {
    if (this.isOpen) return;
    this.isOpen = true;

    // Anchor chat bubble directly above this specific pet companion
    const petCenterX = this.pet.x + 36;
    const chatWidth = 440;
    const screenWidth = window.innerWidth || 1920;
    let targetLeft = petCenterX - chatWidth / 2;
    targetLeft = Math.max(16, Math.min(screenWidth - chatWidth - 16, targetLeft));
    this.container.style.left = `${Math.round(targetLeft)}px`;
    this.container.style.transform = "translateY(0) scale(1)";

    this.container.classList.add("is-open");
    Sound.play("open");

    // Tell Rust to expand window upwards
    void Bridge.setPetChatExpanded(this.windowLabel, true);
    this.pet.pushHitRect();

    // Start live sync poller and fetch fresh conversation transcript
    this.startSyncPolling();
    void this.loadConversationHistory(true);

    window.setTimeout(() => {
      this.inputEl.focus();
      this.scrollToBottom(false);
      this.pet.pushHitRect();
    }, 120);
  }

  public close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.container.style.transform = "translateY(12px) scale(0.96)";
    this.container.classList.remove("is-open");
    Sound.play("close");

    // Stop live polling when closed to guarantee 0.0% CPU idle
    this.stopSyncPolling();
    this.hideScrollDownBadge();

    // Tell Rust to collapse window back down
    void Bridge.setPetChatExpanded(this.windowLabel, false);
    this.pet.pushHitRect();
  }

  public isNearBottom(): boolean {
    const threshold = 70;
    return this.messagesEl.scrollHeight - this.messagesEl.scrollTop - this.messagesEl.clientHeight <= threshold;
  }

  public showScrollDownBadge() {
    this.scrollDownBtn.style.display = "flex";
  }

  public hideScrollDownBadge() {
    this.scrollDownBtn.style.display = "none";
  }

  public scrollToBottom(smooth = false) {
    if (smooth) {
      this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight, behavior: "smooth" });
    } else {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private startSyncPolling() {
    this.stopSyncPolling();
    this.syncPollTimer = window.setInterval(async () => {
      if (!this.isOpen) return;
      try {
        const meta = await Bridge.getTranscriptMetadata(this.sessionId);
        if (meta) {
          if (meta.mtimeMs !== this.lastKnownMtime || meta.fileSize !== this.lastKnownFileSize) {
            this.lastKnownMtime = meta.mtimeMs;
            this.lastKnownFileSize = meta.fileSize;
            await this.loadConversationHistory(false);
          }
        }
      } catch (e) {
        console.warn("[chat_overlay] transcript poll error:", e);
      }
    }, 1200);
  }

  private stopSyncPolling() {
    if (this.syncPollTimer != null) {
      window.clearInterval(this.syncPollTimer);
      this.syncPollTimer = null;
    }
  }

  public updateStatus(state: string, text?: string) {
    this.currentStatus = state;
    this.statusBadgeEl.className = `chat-status-badge status-${state}`;
    let label = text;
    if (!label) {
      switch (state) {
        case "working":
          label = "Kóduji...";
          break;
        case "thinking":
          label = "Přemýšlím...";
          break;
        case "finished":
        case "finish":
          label = "Dokončeno ✨";
          break;
        case "approval_needed":
          label = "Čeká na schválení ⚠️";
          break;
        case "error":
          label = "Chyba ❌";
          break;
        default:
          label = "Připraven";
      }
    }
    this.statusTextEl.textContent = label;
  }

  /**
   * Loads and mirrors conversation history from the active Antigravity IDE transcript.
   */
  public async loadConversationHistory(isInitial: boolean, loadAll = false): Promise<boolean> {
    if (this.isLoadingHistory) return false;
    this.isLoadingHistory = true;

    try {
      const resp = loadAll
        ? await Bridge.getAllConversationHistory(this.sessionId)
        : await Bridge.getConversationHistory(this.sessionId, 30);

      if (resp && resp.messages) {
        this.lastKnownMtime = resp.mtimeMs;
        this.lastKnownFileSize = resp.fileSize;
        this.totalHistoryCount = resp.totalMessages;
        this.hasMoreHistory = resp.hasMore;

        const newMessages: ChatMessage[] = resp.messages.map((m) => {
          let time = "";
          if (m.timestamp) {
            const d = new Date(m.timestamp);
            if (!isNaN(d.getTime())) {
              time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            }
          }
          if (!time) {
            time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            time,
            stepIndex: m.stepIndex,
          };
        });

        // If no messages at all in transcript, show friendly mascot greeting
        if (newMessages.length === 0) {
          if (this.messages.length === 0) {
            this.addGreetingMessage();
          }
          this.isLoadingHistory = false;
          return true;
        }

        // Compare if messages changed
        const isSame =
          this.messages.length === newMessages.length &&
          this.messages.every((m, idx) => m.id === newMessages[idx]?.id && m.content === newMessages[idx]?.content);

        if (isSame && !isInitial) {
          this.isLoadingHistory = false;
          return true;
        }

        const wasNearBottom = this.isNearBottom();
        const prevScrollHeight = this.messagesEl.scrollHeight;
        const prevScrollTop = this.messagesEl.scrollTop;

        this.messages = newMessages;
        this.renderAllMessages();

        if (loadAll) {
          this.messagesEl.scrollTop = this.messagesEl.scrollHeight - prevScrollHeight + prevScrollTop;
        } else if (isInitial || wasNearBottom) {
          this.scrollToBottom(isInitial ? false : true);
          this.hideScrollDownBadge();
        } else {
          this.showScrollDownBadge();
        }

        this.isLoadingHistory = false;
        return true;
      }
    } catch (err) {
      console.error("[chat_overlay] loadConversationHistory failed:", err);
    }

    this.isLoadingHistory = false;
    return false;
  }

  private renderAllMessages() {
    this.messagesEl.innerHTML = "";

    if (this.hasMoreHistory) {
      const remaining = Math.max(0, this.totalHistoryCount - this.messages.length);
      const loadBtn = document.createElement("button");
      loadBtn.className = "chat-load-more-btn";
      loadBtn.textContent = `⬆️ Načíst starší historii (${remaining} zpráv)`;
      loadBtn.addEventListener("click", () => {
        void this.loadConversationHistory(false, true);
      });
      this.messagesEl.appendChild(loadBtn);
    }

    for (const msg of this.messages) {
      const el = document.createElement("div");
      el.className = `chat-msg msg-${msg.role}`;
      if (msg.role === "assistant") {
        el.style.borderLeftColor = this.animal.palette.primary;
      }

      if (msg.role === "tool") {
        el.innerHTML = `<div class="chat-msg-body">${this.renderMarkdown(msg.content)}</div>`;
      } else {
        el.innerHTML = `<div class="chat-msg-body">${this.renderMarkdown(msg.content)}</div><span class="chat-msg-time">${msg.time}</span>`;
      }
      this.messagesEl.appendChild(el);
    }
  }

  /**
   * Two-Way Mirror: Ingests an event arriving from Antigravity IDE and reflects it in real-time.
   */
  public ingestIdeEvent(payload: Record<string, unknown>) {
    const eventName = (payload.hook_event_name as string) ?? "";
    const prompt = (payload.prompt as string) ?? "";
    const message = (payload.message as string) ?? "";
    const tool = (payload.tool_name as string) ?? "";

    if (eventName === "UserPromptSubmit") {
      this.updateStatus("working");
      this.pet.setState("working");
      if (prompt) {
        this.pet.showBubble("💻 Kóduji", prompt.slice(0, 90));
      }
      void this.loadConversationHistory(false);
    } else if (eventName === "PreToolUse") {
      const toolInput = (payload.tool_input as Record<string, unknown>) ?? {};
      const cmd =
        (toolInput.CommandLine as string) ??
        (toolInput.command as string) ??
        (toolInput.commandLine as string) ??
        "";
      const file =
        (toolInput.TargetFile as string) ??
        (toolInput.AbsolutePath as string) ??
        (toolInput.SearchPath as string) ??
        (toolInput.file_path as string) ??
        (toolInput.path as string) ??
        "";

      if (tool === "ask_question") {
        this.updateStatus("thinking", "Čekám na odpověď 🤔");
        this.pet.setState("thinking");
        let qText = "Agent se ptá na upřesnění v IDE...";
        if (Array.isArray(toolInput.questions) && toolInput.questions.length > 0) {
          const firstQ = toolInput.questions[0] as Record<string, unknown>;
          if (typeof firstQ.question === "string") {
            qText = firstQ.question;
          }
        }
        this.pet.showBubble("❓ Otázka", qText.slice(0, 90));
        void this.loadConversationHistory(false);
      } else if (tool === "run_command") {
        this.updateStatus("approval_needed", "Povolení příkazu ⚠️");
        this.pet.setState("thinking");
        this.pet.showBubble("⚠️ Povolit příkaz?", (cmd || "Příkaz").slice(0, 75));
      } else if (
        tool === "replace_file_content" ||
        tool === "write_to_file" ||
        tool === "multi_replace_file_content"
      ) {
        this.updateStatus("working", "Úprava kódu 📝");
        this.pet.setState("working");
        const fileName = file ? file.split(/[\\/]/).pop() : "";
        this.pet.showBubble("📝 Úprava", (fileName || "Soubor").slice(0, 75));
      } else {
        this.updateStatus("working");
        const fileName = file ? file.split(/[\\/]/).pop() : "";
        const detail = fileName || cmd ? ` (${fileName || cmd})` : "";
        this.pet.setState("working");
        this.pet.showBubble("🔧 Nástroj", `${tool}${detail}`.slice(0, 85));
      }
    } else if (eventName === "PostToolUse") {
      this.updateStatus("thinking", "Zpracovávám výsledek...");
      this.pet.setState("thinking");
    } else if (eventName === "PermissionRequest") {
      this.updateStatus("approval_needed", "Čeká na schválení ⚠️");
      this.pet.setState("thinking");
      this.pet.showBubble("⚠️ Schválení", "Čeká na schválení v IDE");
    } else if (eventName === "Stop" || eventName === "PostInvocation") {
      this.updateStatus("finished", "Dokončeno ✨");
      this.pet.setState("finish");
      const displayMsg = message || "Úkol dokončen!";
      this.pet.showBubble("✨ Hotovo", displayMsg.slice(0, 90));
      void this.loadConversationHistory(false);
      window.setTimeout(() => {
        if (this.currentStatus === "finished") {
          this.updateStatus("idle");
          this.pet.setState("idle");
          this.pet.hideBubble();
        }
      }, 6000);
      if (this.isDiagnosticsOpen) {
        void this.refreshDiagnostics();
      }
    } else if (eventName === "Notification") {
      void this.loadConversationHistory(false);
    }
  }

  public async toggleDiagnostics() {
    this.isDiagnosticsOpen = !this.isDiagnosticsOpen;
    if (this.isDiagnosticsOpen) {
      if (this.isSettingsOpen) {
        this.isSettingsOpen = false;
        this.settingsEl.style.display = "none";
      }
      this.diagnosticsEl.style.display = "flex";
      await this.refreshDiagnostics();
    } else {
      this.diagnosticsEl.style.display = "none";
    }
  }

  public toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
    if (this.isSettingsOpen) {
      if (this.isDiagnosticsOpen) {
        this.isDiagnosticsOpen = false;
        this.diagnosticsEl.style.display = "none";
      }
      this.settingsEl.style.display = "flex";
      this.renderSettingsView();
    } else {
      this.settingsEl.style.display = "none";
    }
  }

  public renderSettingsView() {
    const settings = getPetSettings();
    this.settingsEl.innerHTML = `
      <div class="chat-settings-header">
        <div class="chat-settings-title">⚙️ Nastavení Zvířátka</div>
        <div class="chat-settings-header-actions">
          <button class="chat-settings-btn-action" id="settings-reset" title="Obnovit vše na výchozí hodnoty">🔄 Reset</button>
          <button class="chat-settings-btn-action" id="settings-close" title="Zavřít nastavení">✕</button>
        </div>
      </div>

      <!-- 1. Zvuky -->
      <div class="chat-settings-card">
        <div class="chat-settings-card-title">🔊 Zvuky & Melodie</div>
        <label class="chat-toggle-row">
          <span class="chat-toggle-label">Přehrávat zvuky, melodie a efekty</span>
          <input type="checkbox" id="setting-sound-enabled" class="chat-toggle-checkbox" ${settings.soundEnabled ? "checked" : ""}>
          <span class="chat-toggle-switch"></span>
        </label>
      </div>

      <!-- 2. Intervaly -->
      <div class="chat-settings-card">
        <div class="chat-settings-card-title">⏱️ Interval mezi náhodnými animacemi</div>
        <div class="chat-preset-group">
          ${(["often", "normal", "rare"] as IntervalPreset[]).map((preset) => `
            <button class="chat-preset-btn ${settings.intervalPreset === preset ? "is-active" : ""}" data-preset="${preset}">
              ${INTERVAL_PRESETS[preset].label}
            </button>
          `).join("")}
        </div>
      </div>

      <!-- 3. Animace (9 přepínačů) -->
      <div class="chat-settings-card">
        <div class="chat-settings-card-header">
          <div class="chat-settings-card-title">🎭 Povolené Animace na Liště</div>
          <div class="chat-batch-actions">
            <button class="chat-batch-btn" id="anim-select-all">Vybrat vše</button>
            <button class="chat-batch-btn" id="anim-deselect-all">Zrušit vše</button>
          </div>
        </div>
        <div class="chat-anim-grid">
          ${(Object.keys(ANIMATION_META) as PetAnimationKey[]).map((key) => {
            const meta = ANIMATION_META[key];
            const isChecked = settings.animations[key];
            return `
              <label class="chat-anim-item">
                <input type="checkbox" class="chat-anim-checkbox" data-anim-key="${key}" ${isChecked ? "checked" : ""}>
                <span class="chat-anim-icon">${meta.icon}</span>
                <span class="chat-anim-name">${meta.label}</span>
              </label>
            `;
          }).join("")}
        </div>
      </div>

      <!-- 4. Zobrazení prvků -->
      <div class="chat-settings-card">
        <div class="chat-settings-card-title">💬 Vzhled na Ploše</div>
        <label class="chat-toggle-row">
          <span class="chat-toggle-label">Komiksové bubliny s hláškami nad zvířátkem</span>
          <input type="checkbox" id="setting-bubbles-enabled" class="chat-toggle-checkbox" ${settings.showBubbles ? "checked" : ""}>
          <span class="chat-toggle-switch"></span>
        </label>
        <label class="chat-toggle-row" style="margin-top:6px;">
          <span class="chat-toggle-label">Štítek projektu u nožiček [📁 projekt]</span>
          <input type="checkbox" id="setting-tag-enabled" class="chat-toggle-checkbox" ${settings.showProjectTag ? "checked" : ""}>
          <span class="chat-toggle-switch"></span>
        </label>
      </div>

      <!-- 5. Testovací tlačítko -->
      <div class="chat-settings-card">
        <div class="chat-settings-card-title">🎮 Vyzkoušet Animaci</div>
        <button class="chat-test-anim-btn" id="settings-test-anim">
          ▶️ Spustit náhodnou animaci ihned
        </button>
        <div id="settings-test-status" class="chat-test-status" style="display:none;"></div>
      </div>
    `;

    // Event listeners
    this.settingsEl.querySelector("#settings-close")?.addEventListener("click", () => {
      this.toggleSettings();
    });

    this.settingsEl.querySelector("#settings-reset")?.addEventListener("click", () => {
      resetPetSettings();
      Sound.play("pop");
      this.renderSettingsView();
    });

    const soundCb = this.settingsEl.querySelector("#setting-sound-enabled") as HTMLInputElement | null;
    soundCb?.addEventListener("change", () => {
      updatePetSettings({ soundEnabled: soundCb.checked });
      if (soundCb.checked) Sound.play("blip");
    });

    const bubblesCb = this.settingsEl.querySelector("#setting-bubbles-enabled") as HTMLInputElement | null;
    bubblesCb?.addEventListener("change", () => {
      updatePetSettings({ showBubbles: bubblesCb.checked });
      Sound.play("pop");
    });

    const tagCb = this.settingsEl.querySelector("#setting-tag-enabled") as HTMLInputElement | null;
    tagCb?.addEventListener("change", () => {
      updatePetSettings({ showProjectTag: tagCb.checked });
      Sound.play("pop");
    });

    // Preset buttons
    this.settingsEl.querySelectorAll(".chat-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = (btn as HTMLElement).dataset.preset as IntervalPreset;
        if (preset) {
          updatePetSettings({ intervalPreset: preset });
          Sound.play("blip");
          this.settingsEl.querySelectorAll(".chat-preset-btn").forEach((b) => {
            b.classList.toggle("is-active", (b as HTMLElement).dataset.preset === preset);
          });
        }
      });
    });

    // Individual animation checkboxes
    this.settingsEl.querySelectorAll(".chat-anim-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        const input = cb as HTMLInputElement;
        const key = input.dataset.animKey as PetAnimationKey;
        if (key) {
          const current = getPetSettings();
          current.animations[key] = input.checked;
          savePetSettings(current);
          Sound.play("pop");
        }
      });
    });

    // Select all / Deselect all
    this.settingsEl.querySelector("#anim-select-all")?.addEventListener("click", () => {
      const current = getPetSettings();
      (Object.keys(current.animations) as PetAnimationKey[]).forEach((k) => {
        current.animations[k] = true;
      });
      savePetSettings(current);
      Sound.play("blip");
      this.renderSettingsView();
    });

    this.settingsEl.querySelector("#anim-deselect-all")?.addEventListener("click", () => {
      const current = getPetSettings();
      (Object.keys(current.animations) as PetAnimationKey[]).forEach((k) => {
        current.animations[k] = false;
      });
      savePetSettings(current);
      Sound.play("pop");
      this.renderSettingsView();
    });

    // Test animation button
    this.settingsEl.querySelector("#settings-test-anim")?.addEventListener("click", () => {
      const statusEl = this.settingsEl.querySelector("#settings-test-status") as HTMLElement | null;
      const triggered = this.pet.triggerRandomActivityNow();
      if (statusEl) {
        statusEl.style.display = "block";
        if (triggered) {
          statusEl.textContent = "Animace byla spuštěna na liště! ✨";
          statusEl.className = "chat-test-status success";
          Sound.play("wink");
        } else {
          statusEl.textContent = "Nelze spustit (zvířátko je zaneprázdněné nebo jsou animace vypnuté).";
          statusEl.className = "chat-test-status warning";
        }
        window.setTimeout(() => {
          if (statusEl) statusEl.style.display = "none";
        }, 3000);
      }
    });
  }

  public async refreshDiagnostics() {
    if (!this.isDiagnosticsOpen) return;
    this.diagnosticsEl.innerHTML = `<div style="color:#94a3b8;font-size:11px;padding:12px;">Načítám diagnostiku...</div>`;
    try {
      const rep = await Bridge.getDiagnosticsReport();
      if (!rep) {
        this.diagnosticsEl.innerHTML = `<div style="color:#94a3b8;font-size:11px;padding:12px;">Diagnostická data nejsou k dispozici.</div>`;
        return;
      }
      const win = rep.ideWindow;
      const winStatus = win ? "Připojeno 🟢" : "Hledám... 🟡";

      this.diagnosticsEl.innerHTML = `
        <div class="chat-diag-header">
          <div class="chat-diag-title">📊 Diagnostický Report Coucou</div>
          <div class="chat-diag-actions">
            <button class="chat-diag-btn" id="diag-refresh">🔄 Obnovit</button>
            <button class="chat-diag-btn" id="diag-copy">📋 Kopírovat</button>
            <button class="chat-diag-btn" id="diag-close">✕</button>
          </div>
        </div>

        <div class="chat-diag-card">
          <div class="chat-diag-row">
            <span>Stav okna IDE:</span>
            <span class="chat-diag-val">${winStatus}</span>
          </div>
          ${win ? `
          <div class="chat-diag-row">
            <span>HWND:</span>
            <span class="chat-diag-val">0x${win.hwnd.toString(16).toUpperCase()} (${win.hwnd})</span>
          </div>
          <div class="chat-diag-row">
            <span>PID:</span>
            <span class="chat-diag-val">${win.pid}</span>
          </div>
          <div class="chat-diag-row">
            <span>Titulek:</span>
            <span class="chat-diag-val" title="${this.escapeHtml(win.title)}">${this.escapeHtml(win.title || "(bez titulku)")}</span>
          </div>
          <div class="chat-diag-row">
            <span>Proces:</span>
            <span class="chat-diag-val" title="${this.escapeHtml(win.processPath)}">${this.escapeHtml(win.processPath.split(/[\\\\/]/).pop() || "")}</span>
          </div>
          ` : `
          <div style="color:#f59e0b;font-size:10px;margin-top:2px;">
            Žádné okno Antigravity IDE nebylo detekováno.
          </div>
          `}
        </div>

        <div class="chat-diag-card">
          <div class="chat-diag-row">
            <span>Named Pipe:</span>
            <span class="chat-diag-val">${rep.pipeConnected ? "Aktivní 🟢" : "Neaktivní 🔴"}</span>
          </div>
          <div class="chat-diag-row">
            <span>Hooky (~/.gemini):</span>
            <span class="chat-diag-val">${rep.hooksInstalled ? "Nainstalováno ✅" : "Nenainstalováno ❌"}</span>
          </div>
        </div>

        <div class="chat-diag-card">
          <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">Poslední Hook Události (${rep.recentEvents.length}):</div>
          ${rep.recentEvents.length === 0 ? `
            <div style="color:#64748b;font-size:10px;">Zatím nebyly zachyceny žádné události.</div>
          ` : `
            <table class="chat-diag-table">
              <thead>
                <tr>
                  <th>Čas</th>
                  <th>Událost</th>
                  <th>Popis</th>
                </tr>
              </thead>
              <tbody>
                ${rep.recentEvents.slice(-5).reverse().map(e => `
                  <tr>
                    <td>${e.timestamp.split(" ")[1] || e.timestamp}</td>
                    <td><strong>${e.eventName}</strong></td>
                    <td>${this.escapeHtml(e.summary)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </div>

        <div class="chat-diag-card">
          <div style="font-weight:700;color:#f8fafc;margin-bottom:4px;">Odeslané Prompty (${rep.promptDispatches.length}):</div>
          ${rep.promptDispatches.length === 0 ? `
            <div style="color:#64748b;font-size:10px;">Zatím nebyl odeslán žádný prompt.</div>
          ` : `
            <table class="chat-diag-table">
              <thead>
                <tr>
                  <th>Čas</th>
                  <th>Stav</th>
                  <th>Prompt</th>
                </tr>
              </thead>
              <tbody>
                ${rep.promptDispatches.slice(-3).reverse().map(p => `
                  <tr>
                    <td>${p.timestamp.split(" ")[1] || p.timestamp}</td>
                    <td>${p.success ? "✅" : "⚠️"}</td>
                    <td title="${this.escapeHtml(p.prompt)}">${this.escapeHtml(p.prompt.slice(0, 32))}...</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `}
        </div>
      `;

      this.diagnosticsEl.querySelector("#diag-refresh")?.addEventListener("click", () => {
        Sound.play("wink");
        void this.refreshDiagnostics();
      });

      this.diagnosticsEl.querySelector("#diag-copy")?.addEventListener("click", async () => {
        Sound.play("pop");
        const ok = await Bridge.copyDiagnosticsReport();
        const btn = this.diagnosticsEl.querySelector("#diag-copy") as HTMLButtonElement | null;
        if (btn) btn.textContent = ok ? "Zkopírováno! ✨" : "Chyba";
        window.setTimeout(() => {
          if (btn) btn.textContent = "📋 Kopírovat";
        }, 2000);
      });

      this.diagnosticsEl.querySelector("#diag-close")?.addEventListener("click", () => {
        this.toggleDiagnostics();
      });
    } catch (err) {
      this.diagnosticsEl.innerHTML = `<div style="color:#ef4444;font-size:11px;padding:12px;">Chyba načítání: ${err}</div>`;
    }
  }

  /**
   * Rich Markdown Renderer for chat messages:
   * - Headings (#, ##, ###)
   * - Fenced code blocks with code card and one-click copy button
   * - Inline code
   * - Unordered & Ordered lists
   * - Blockquotes
   * - Bold & Italic
   * - Clickable links
   */
  public renderMarkdown(raw: string): string {
    if (!raw) return "";

    // 1. Separate code blocks to protect them from inline markdown parsing
    const codeBlocks: string[] = [];
    let text = raw.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      const idx = codeBlocks.length;
      const escapedCode = this.escapeHtml(code.trim());
      const safeLang = this.escapeHtml(lang.trim() || "code");
      codeBlocks.push(`
        <div class="chat-code-card">
          <div class="chat-code-header">
            <span class="chat-code-lang">${safeLang}</span>
            <button class="chat-code-copy-btn" type="button">📋 Kopírovat</button>
          </div>
          <pre class="chat-code-pre"><code>${escapedCode}</code></pre>
        </div>
      `);
      return `\n%%CODEBLOCK_${idx}%%\n`;
    });

    // 2. Escape HTML for the non-code portions
    text = this.escapeHtml(text);

    // 3. Headers: ### h3, ## h2, # h1
    text = text.replace(/^###\s+(.+)$/gm, '<div class="chat-md-h3">$1</div>');
    text = text.replace(/^##\s+(.+)$/gm, '<div class="chat-md-h2">$1</div>');
    text = text.replace(/^#\s+(.+)$/gm, '<div class="chat-md-h1">$1</div>');

    // 4. Blockquotes: > quote
    text = text.replace(/^>\s+(.+)$/gm, '<blockquote class="chat-md-quote">$1</blockquote>');

    // 5. Unordered lists: lines starting with - or *
    text = text.replace(/(?:^[ \t]*[-*]\s+.+(?:\n|$))+/gm, (listBlock) => {
      const items = listBlock
        .trim()
        .split("\n")
        .map((line) => {
          const content = line.replace(/^[ \t]*[-*]\s+/, "");
          return `<li>${content}</li>`;
        })
        .join("");
      return `<ul class="chat-md-ul">${items}</ul>`;
    });

    // 6. Ordered lists: lines starting with 1. 2. etc.
    text = text.replace(/(?:^[ \t]*\d+\.\s+.+(?:\n|$))+/gm, (listBlock) => {
      const items = listBlock
        .trim()
        .split("\n")
        .map((line) => {
          const content = line.replace(/^[ \t]*\d+\.\s+/, "");
          return `<li>${content}</li>`;
        })
        .join("");
      return `<ol class="chat-md-ol">${items}</ol>`;
    });

    // 7. Inline code: `code`
    text = text.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 8. Bold and Italic: **bold**, *italic*
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

    // 9. Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="chat-link" href="$2" target="_blank" rel="noopener">$1</a>');

    // 10. Horizontal rule: ---
    text = text.replace(/^---$/gm, '<hr class="chat-md-hr">');

    // 11. Line breaks: preserve single line breaks within regular text
    text = text.replace(/\n(?!(?:<\/?(ul|ol|li|blockquote|div|pre|code|hr)))/g, "<br>");

    // 12. Re-insert protected code blocks
    codeBlocks.forEach((block, idx) => {
      text = text.replace(`%%CODEBLOCK_${idx}%%`, block);
      text = text.replace(`<br>%%CODEBLOCK_${idx}%%<br>`, block);
      text = text.replace(`%%CODEBLOCK_${idx}%%<br>`, block);
      text = text.replace(`<br>%%CODEBLOCK_${idx}%%`, block);
    });

    return text.trim();
  }

  public addMessage(role: "user" | "assistant" | "tool", content: string, toolName?: string) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const msg: ChatMessage = {
      id: "msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      role,
      content,
      time,
      toolName,
    };
    this.messages.push(msg);

    const wasNearBottom = this.isNearBottom();

    const el = document.createElement("div");
    el.className = `chat-msg msg-${role}`;
    if (role === "assistant") {
      el.style.borderLeftColor = this.animal.palette.primary;
    }

    if (role === "tool") {
      el.innerHTML = `<div class="chat-msg-body">${this.renderMarkdown(content)}</div>`;
    } else {
      el.innerHTML = `<div class="chat-msg-body">${this.renderMarkdown(content)}</div><span class="chat-msg-time">${time}</span>`;
    }

    this.messagesEl.appendChild(el);

    if (wasNearBottom || role === "user") {
      this.scrollToBottom(true);
      this.hideScrollDownBadge();
    } else {
      this.showScrollDownBadge();
    }
  }

  private addGreetingMessage() {
    this.addMessage(
      "assistant",
      `Ahoj! Jsem ${this.animal.name}. Tento chat je obousměrným zrcadlem tvého Antigravity IDE. Napiš mi prompt a já ho pošlu přímo do tvého projektu! ✨`,
    );
  }

  private sendPrompt() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = "";
    this.inputEl.blur();
    this.addMessage("user", text);
    Sound.play("send");

    // Put mascot into working state and update chat status
    this.updateStatus("working");
    this.pet.setState("working");
    this.pet.showBubble("💻 Kóduji", text.slice(0, 50), 5000);

    // Periodic poller: check for agent response in transcript
    let attempts = 0;
    const pollInterval = window.setInterval(async () => {
      attempts++;
      if (this.currentStatus !== "working" && this.currentStatus !== "thinking") {
        window.clearInterval(pollInterval);
        return;
      }

      await this.loadConversationHistory(false);
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && !lastMsg.content.includes("Kóduji")) {
        window.clearInterval(pollInterval);
        this.updateStatus("finished", "Dokončeno ✨");
        this.pet.setState("finish");
        this.pet.showBubble("✨ Hotovo", "Odpověď přijata!", 3500);
        Sound.play("finish");
        window.setTimeout(() => {
          if (this.currentStatus === "finished") {
            this.updateStatus("idle");
            this.pet.setState("idle");
            this.pet.hideBubble();
          }
        }, 4000);
        return;
      }

      if (attempts >= 60) {
        window.clearInterval(pollInterval);
        if (this.currentStatus === "working" || this.currentStatus === "thinking") {
          this.updateStatus("idle", "Připraven");
          this.pet.setState("idle");
          this.pet.hideBubble();
        }
      }
    }, 1500);

    // Dispatch prompt to Antigravity IDE project session
    void Bridge.sendIdePrompt(this.sessionId, text, this.hwnd || this.pet.hwnd).then((res) => {
      if (res?.targetHwnd) {
        this.hwnd = res.targetHwnd;
        this.pet.hwnd = res.targetHwnd;
      }
      if (res && !res.success && res.message) {
        this.addMessage("tool", `ℹ️ ${res.message}`);
      }
      if (this.isDiagnosticsOpen) {
        void this.refreshDiagnostics();
      }
    });
  }

  private setupEvents() {
    this.sendBtn.addEventListener("click", () => this.sendPrompt());

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendPrompt();
      } else if (e.key === "Escape") {
        this.close();
      }
    });

    // Monitor scroll for smart scrolling badge
    this.messagesEl.addEventListener("scroll", () => {
      if (this.isNearBottom()) {
        this.hideScrollDownBadge();
      }
    });

    // Copy code button click delegation
    this.messagesEl.addEventListener("click", async (e) => {
      const target = e.target as HTMLElement;
      if (target && target.classList.contains("chat-code-copy-btn")) {
        const card = target.closest(".chat-code-card");
        const codeEl = card?.querySelector("pre code");
        if (codeEl) {
          const codeText = codeEl.textContent || "";
          try {
            await navigator.clipboard.writeText(codeText);
            Sound.play("pop");
            target.textContent = "Zkopírováno! ✨";
            window.setTimeout(() => {
              target.textContent = "📋 Kopírovat";
            }, 2000);
          } catch (err) {
            console.error("Clipboard copy error:", err);
          }
        }
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.close();
      }
    });

    // Clicking outside the chat box closes it
    window.addEventListener("mousedown", (e) => {
      if (!this.isOpen) return;
      const target = e.target as Node;
      if (!this.container.contains(target) && !this.pet.getActorElement().contains(target)) {
        this.close();
      }
    });

    // Window blur closes chat overlay cleanly
    window.addEventListener("blur", () => {
      if (this.isOpen) {
        this.close();
      }
    });
  }

  private animalEmoji(): string {
    switch (this.animal.id) {
      case "tiger":
        return "🐯";
      case "dog":
        return "🐶";
      case "monkey":
        return "🐵";
      case "elephant":
        return "🐘";
      case "fox":
        return "🦊";
      case "panda":
        return "🐼";
      case "penguin":
        return "🐧";
      case "cat":
        return "🐱";
      default:
        return "🐾";
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
    this.updateHeaderProject();
  }

  private updateHeaderProject() {
    const animalName = this.animal.name;
    if (this.projectName) {
      this.titleEl.innerHTML = `<span>${animalName}</span> <span class="chat-project-badge" title="${this.escapeHtml(this.windowTitle || this.projectName)}">📁 ${this.escapeHtml(this.projectName)}</span>`;
      this.subtitleEl.textContent = `Propojeno s oknem: ${this.projectName}`;
    } else {
      this.titleEl.textContent = `${animalName} · IDE Mirror`;
      this.subtitleEl.textContent = "Obousměrné zrcadlo Antigravity";
    }
  }

  public destroy() {
    this.stopSyncPolling();
    this.container.remove();
  }
}
