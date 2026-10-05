// Antigravity IDE hook events -> state synchronization.
// Handles lifecycle events: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd, etc.

import { Bridge, onEvent } from "./bridge";
import { Sound } from "./sound";
import { State } from "./state";

const ANTIGRAVITY_ID = "integration_antigravity";

let pendingTimeout: number | null = null;

export interface HookPayload {
  hook_event_name?: string;
  request_id?: string;
  session_id?: string;
  cwd?: string;
  message?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  coucou_agent?: string;
  hwnd?: number | null;
}

function validateAgent(raw: string | undefined): string | null {
  if (!raw || raw.length > 24) return null;
  if (!/^[a-z0-9-]+$/.test(raw)) return null;
  return raw;
}

const FALLBACK_COLORS = ["#22C55E", "#EAB308", "#60A5FA", "#E879F9"];

function agentColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}

function lastPathComponent(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

const TOOL_LABELS: Record<string, string> = {
  Bash: "Spouští",
  Read: "Čte",
  Write: "Píše",
  Edit: "Upravuje",
  Glob: "Hledá",
  Grep: "Vyhledává",
  WebSearch: "Hledá na webu",
  WebFetch: "Stahuje",
  TodoWrite: "Úkoly",
  Task: "Subagent",
  LS: "Vypisuje",
  MultiEdit: "Upravuje",
  NotebookEdit: "Notebook",
  PowerShell: "Spouští",
};

function stepLabel(tool: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[tool] ?? tool;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const cmd = str("command");
  if (cmd) return `${label} · ${cmd.slice(0, 40)}`;
  const path = str("path");
  if (path) return `${label} · ${lastPathComponent(path)}`;
  const file = str("file_path");
  if (file) return `${label} · ${lastPathComponent(file)}`;
  const query = str("query");
  if (query) return `${label} · ${query.slice(0, 40)}`;
  return label;
}

const APPROVAL_FIELDS = [
  "command",
  "file_path",
  "path",
  "url",
  "query",
  "pattern",
  "prompt",
] as const;

function approvalTarget(tool: string, input: Record<string, unknown>): string {
  for (const field of APPROVAL_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      return `${tool} · ${value.trim()}`;
    }
  }
  return tool;
}

function upsert(projectName: string, cwd: string, hwnd?: number | null) {
  const t = State.tasks.find((x) => x.id === ANTIGRAVITY_ID);
  if (!t) return;
  t.name = projectName;
  if (cwd) t.sessionCwd = cwd;
  if (hwnd) t.hwnd = hwnd;
}

function clearSession() {
  const t = State.tasks.find((x) => x.id === ANTIGRAVITY_ID);
  if (!t) return;
  t.steps = [];
  t.stepIndex = 0;
  t.name = "Antigravity IDE";
  t.pillBadge = null;
}

export function registerHookHandlers() {
  void onEvent<HookPayload>("hook", (payload) => handleHook(payload));
}

function handleHook(payload: HookPayload) {
  if (State.paused) {
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }

  const name = payload.hook_event_name ?? "";
  const cwd = payload.cwd ?? "";
  const raw = lastPathComponent(cwd);
  const projectName = raw || "Antigravity Project";

  const validAgent = validateAgent(payload.coucou_agent);
  const agentId = validAgent && validAgent !== "antigravity" ? `agent_${validAgent}` : ANTIGRAVITY_ID;
  const isExternalAgent = validAgent !== null && validAgent !== "antigravity";

  const ensurePill = () => {
    if (isExternalAgent) {
      State.upsertExternalAgent(agentId, validAgent!, agentColor(validAgent!));
      const t = State.tasks.find((x) => x.id === agentId);
      if (t && payload.hwnd) t.hwnd = payload.hwnd;
    } else {
      upsert(projectName, cwd, payload.hwnd);
    }
  };

  switch (name) {
    case "SessionStart":
      ensurePill();
      Sound.play("work");
      break;

    case "UserPromptSubmit": {
      ensurePill();
      State.updateTask(agentId, "thinking");
      const asked = payload.prompt ?? payload.message;
      if (asked) State.appendStep(agentId, asked.slice(0, 60));
      break;
    }

    case "PreToolUse": {
      ensurePill();
      State.updateTask(agentId, "working");
      const tool = payload.tool_name ?? "Tool";
      State.appendStep(agentId, stepLabel(tool, payload.tool_input ?? {}));
      break;
    }

    case "PostToolUse":
      State.updateTask(agentId, "working");
      break;

    case "PostToolUseFailure":
      State.updateTask(agentId, "working");
      State.appendStep(agentId, "⚠ failed");
      break;

    case "Notification": {
      const message = payload.message ?? "";
      const lower = message.toLowerCase();
      if (lower.includes("rate limit") || lower.includes("limite d")) {
        State.updateTask(agentId, "ratelimit");
        Sound.play("error");
      } else if (message.endsWith("?")) {
        State.updateTask(agentId, "question");
        State.appendStep(agentId, message);
      }
      break;
    }

    case "Stop":
      State.updateTask(agentId, "finished");
      if (payload.message) State.appendStep(agentId, payload.message.slice(0, 60));
      Sound.play("finish");
      State.setPillBadge(agentId, "finished");
      window.setTimeout(() => {
        if (isExternalAgent) {
          State.removeTask(agentId);
        } else {
          State.updateTask(agentId, "idle");
          State.setPillBadge(agentId, null);
        }
      }, 5200);
      break;

    case "StopFailure":
      State.updateTask(agentId, "error");
      Sound.play("error");
      State.setPillBadge(agentId, "error");
      break;

    case "SessionEnd":
      if (isExternalAgent) {
        State.removeTask(agentId);
      } else {
        State.updateTask(agentId, "idle");
        clearSession();
      }
      break;

    case "SubagentStart":
      State.appendStep(agentId, "+ subagent");
      break;

    case "SubagentStop":
      State.appendStep(agentId, "• subagent done");
      break;

    case "PermissionRequest": {
      if (isExternalAgent) {
        if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
        break;
      }

      const requestId = payload.request_id ?? "";
      if (State.pendingApproval && State.pendingApproval.requestId !== requestId) {
        if (requestId) void Bridge.approvalDecline(requestId);
        break;
      }
      upsert(projectName, cwd);
      if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
      const tool = payload.tool_name ?? "Tool";
      const input = payload.tool_input ?? {};
      State.pendingApproval = {
        requestId,
        sessionId: payload.session_id ?? "",
        tool,
        command: approvalTarget(tool, input),
      };
      if (requestId) void Bridge.approvalAck(requestId);
      State.updateTask(ANTIGRAVITY_ID, "approval");
      Sound.play("blip");
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        if (!State.pendingApproval) return;
        State.pendingApproval = null;
        State.updateTask(ANTIGRAVITY_ID, "working");
        State.setPillBadge(ANTIGRAVITY_ID, null);
        State.notify();
      }, 110_000);
      break;
    }

    default:
      break;
  }
  State.notify();
}
