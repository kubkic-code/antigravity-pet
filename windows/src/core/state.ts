// App state — Reactive state store for Antigravity Pet & Multi-bot routing.

export type BotStateName =
  | "idle"
  | "thinking"
  | "working"
  | "finished"
  | "error"
  | "approval"
  | "ratelimit"
  | "question";

export type AgentSource = "claudeCode" | "n8n" | "agent";
export type PillBadge = "approval" | "finished" | "error";

export interface AgentTask {
  id: string;
  name: string;
  color: string;
  state: BotStateName;
  stepIndex: number;
  steps: string[];
  source: AgentSource;
  isIntegration: boolean;
  pillBadge?: PillBadge | null;
  sessionCwd?: string | null;
  hwnd?: number | null;
}

export interface ApprovalInfo {
  requestId: string;
  sessionId: string;
  tool: string;
  command: string;
}

const task = (
  id: string,
  name: string,
  color: string,
  source: AgentSource,
): AgentTask => ({
  id,
  name,
  color,
  state: "idle",
  stepIndex: 0,
  steps: [],
  source,
  isIntegration: true,
});

/** Primary agent task for Antigravity IDE */
export const INTEGRATION_AGENTS: AgentTask[] = [
  task("integration_antigravity", "Antigravity IDE", "#4F86F7", "agent"),
];

export interface Settings {
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  absenceInterval: number;
  activeIntegrations: string[];
  screen: "primary" | "cursor";
  autostart: boolean;
  hooksInstalled: boolean;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  absenceInterval: 180,
  activeIntegrations: ["antigravity"],
  screen: "primary",
  autostart: false,
  hooksInstalled: false,
  model: "antigravity",
};

type Listener = () => void;

class AppState {
  tasks: AgentTask[] = [];
  focusId: string | null = null;
  stateOverride: BotStateName | null = null;

  mouse = { x: 0, y: 0 };
  isPinned = false;
  paused = false;

  pendingApproval: ApprovalInfo | null = null;
  lastActivity = performance.now();
  settings: Settings = { ...DEFAULT_SETTINGS };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn();
  }

  get focusTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === this.focusId) ?? this.tasks[0] ?? null;
  }

  get effectiveState(): BotStateName {
    return this.stateOverride ?? this.focusTask?.state ?? "idle";
  }

  get otherTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.id !== this.focusId);
  }

  setFocus(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.focusId = id;
    t.pillBadge = null;
    this.notify();
  }

  updateTask(id: string, state: BotStateName) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.state = state;
    this.notify();
  }

  appendStep(id: string, step: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.steps.push(step);
    if (t.steps.length > 20) t.steps.shift();
    t.stepIndex = t.steps.length - 1;
    this.notify();
  }

  setPillBadge(id: string, badge: PillBadge | null) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.pillBadge = badge;
    this.notify();
  }

  loadIntegrationTasks() {
    for (const proto of INTEGRATION_AGENTS) {
      const idx = this.tasks.findIndex((t) => t.id === proto.id);
      if (idx < 0) this.tasks.push({ ...proto, steps: [] });
    }
    if (!this.focusId) this.focusId = "integration_antigravity";
    this.notify();
  }

  removeTask(id: string) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.tasks.splice(idx, 1);
    if (this.focusId === id) this.focusId = this.tasks[0]?.id ?? "integration_antigravity";
    this.notify();
  }

  upsertExternalAgent(id: string, name: string, color: string) {
    if (this.tasks.some((t) => t.id === id)) return;
    const at = this.tasks.findIndex((t) => t.id === "integration_antigravity") + 1;
    this.tasks.splice(at, 0, {
      id,
      name,
      color,
      state: "idle",
      stepIndex: 0,
      steps: [],
      source: "agent",
      isIntegration: false,
    });
    if (!this.focusId) this.focusId = id;
    this.notify();
  }
}

export const State = new AppState();
