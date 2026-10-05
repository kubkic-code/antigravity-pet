// Thin wrapper over Tauri IPC commands and events for Antigravity Pet.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings } from "./state";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[coucou] ${cmd} failed`, err);
    return null;
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the pet lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  hookPath: string;
}

export interface HookStatus {
  installed: boolean;
  settingsPath: string;
  hookPath: string;
  hookReady: boolean;
}

export interface HookPreview {
  diff: string;
  backup: string;
  settingsPath: string;
  fingerprint: string;
}

async function callOrThrow<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error("not running inside Coucou");
  return invoke<T>(cmd, args);
}

export const Bridge = {
  boot: () => call<BootInfo>("boot"),

  saveSettings: (settings: Settings) => call<void>("save_settings", { settings }),

  /** Reposition window on monitor / resolution change */
  reposition: () => call<void>("reposition"),

  /** Pushes interactive shape for click-through testing */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Pushes multiple interactive shapes for click-through testing */
  setIslandRects: (rects: [number, number, number, number][]) =>
    call<void>("set_island_rects", { rects }),

  openUrl: (url: string) => call<void>("open_url", { url }),

  /** Focuses the Antigravity IDE window mapped to this hwnd, or finds active IDE window. Returns the HWND on success. */
  focusIdeWindow: (hwnd?: number | null) =>
    call<number | null>("focus_ide_window", { hwnd: hwnd ?? null }),

  /** Reposition the pet window on screen (physical coordinates). */
  setPetWindowPos: (x: number, y: number) => call<void>("set_pet_window_pos", { x, y }),

  /** Set the interactive clickable region for a specific pet window. */
  setPetRect: (windowLabel: string, x: number, y: number, width: number, height: number) =>
    call<void>("set_pet_rect", { windowLabel, x, y, width, height }),

  /** Close a pet session window. */
  closePetSession: (sessionId: string) => call<void>("close_pet_session", { sessionId }),

  /** Expands or collapses the pet window vertically for chat overlay. */
  setPetChatExpanded: (windowLabel: string, expanded: boolean) =>
    call<void>("set_pet_chat_expanded", { windowLabel, expanded }),

  /** Sends a prompt directly to the Antigravity IDE project session (Two-way mirror). */
  sendIdePrompt: (sessionId: string, prompt: string, hwnd?: number | null) =>
    call<PromptResult>("send_ide_prompt", { sessionId, prompt, hwnd: hwnd ?? null }),

  getDiagnosticsReport: () => call<DiagnosticsReport>("get_diagnostics_report"),
  copyDiagnosticsReport: () => call<boolean>("copy_diagnostics_report"),
  rescanIdeWindow: () => call<IdeWindowInfo | null>("rescan_ide_window"),

  quit: () => call<void>("quit_app"),

  openSettingsWindow: () => call<void>("open_settings_window"),

  /** Writes to %LOCALAPPDATA%\Coucou\coucou.log, next to the Rust lines. */
  log: (message: string) => call<void>("log_line", { message }),

  // ── Antigravity IDE hooks ─────────────────────────────────────────────────
  hooksStatus: () => call<HookStatus>("hooks_status"),
  hooksPreview: (install: boolean) => callOrThrow<HookPreview>("hooks_preview", { install }),
  hooksApply: (install: boolean, fingerprint: string) =>
    callOrThrow<string>("hooks_apply", { install, fingerprint }),

  approvalDecision: (requestId: string, decision: "allow" | "deny") =>
    call<void>("approval_decision", { requestId, decision }),
  approvalAck: (requestId: string) => call<void>("approval_ack", { requestId }),
  approvalDecline: (requestId: string) => call<void>("approval_decline", { requestId }),

  /** Tray -> Pause. */
  setPaused: (paused: boolean) => call<void>("set_paused", { paused }),

  /** Gets latest agent text response or question directly from transcript */
  getLatestIdeResponse: (sessionId?: string) =>
    call<string | null>("get_latest_ide_response", { sessionId: sessionId ?? null }),

  /** Gets recent conversation history (user prompts and assistant responses) */
  getConversationHistory: (sessionId?: string, limit?: number) =>
    call<ChatHistoryResponse>("get_conversation_history", {
      sessionId: sessionId ?? null,
      limit: limit ?? 30,
    }),

  /** Gets all conversation history without limit */
  getAllConversationHistory: (sessionId?: string) =>
    call<ChatHistoryResponse>("get_all_conversation_history", {
      sessionId: sessionId ?? null,
    }),

  /** Gets transcript file metadata (mtime and size) for ultra-lightweight change detection */
  getTranscriptMetadata: (sessionId?: string) =>
    call<TranscriptMetadata>("get_transcript_metadata", {
      sessionId: sessionId ?? null,
    }),
};

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  stepIndex: number;
}

export interface ChatHistoryResponse {
  sessionId: string;
  messages: ChatHistoryMessage[];
  totalMessages: number;
  hasMore: boolean;
  mtimeMs: number;
  fileSize: number;
}

export interface TranscriptMetadata {
  sessionId: string;
  mtimeMs: number;
  fileSize: number;
}

export interface IdeWindowInfo {
  hwnd: number;
  pid: number;
  title: string;
  className: string;
  processPath: string;
}

export interface HookEventLogEntry {
  timestamp: string;
  eventName: string;
  toolName?: string | null;
  sessionId?: string | null;
  summary: string;
}

export interface PromptDispatchLogEntry {
  timestamp: string;
  prompt: string;
  targetHwnd?: number | null;
  method: string;
  success: boolean;
  details: string;
}

export interface DiagnosticsReport {
  timestamp: string;
  pipeName: string;
  pipeConnected: boolean;
  hooksInstalled: boolean;
  hookPath: string;
  ideWindow?: IdeWindowInfo | null;
  recentEvents: HookEventLogEntry[];
  promptDispatches: PromptDispatchLogEntry[];
}

export interface PromptResult {
  success: boolean;
  targetHwnd?: number | null;
  method: string;
  message: string;
}

export type BridgeEvent =
  | { name: "cursor"; payload: { x: number; y: number } }
  | { name: "tray"; payload: string }
  | { name: "hook"; payload: Record<string, unknown> }
  | { name: "screen-changed"; payload: null };

export async function getLatestIdeResponse(sessionId?: string): Promise<string | null> {
  if (!IS_TAURI) return null;
  return invoke<string | null>("get_latest_ide_response", { sessionId: sessionId ?? null });
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}
