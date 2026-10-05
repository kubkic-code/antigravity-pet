// Settings window — Antigravity Pet preferences and hook status.

import "./settings.css";
import { Bridge, onEvent, type HookStatus } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import { h, clear } from "../core/dom";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable bits ─────────────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

// ── Antigravity IDE Hooks section ─────────────────────────────────────────────

function hooksSection(status: HookStatus): HTMLElement {
  const body = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  const section = h(
    "section",
    {},
    h("h2", {}, statusDot(status.installed), h("span", { text: "Antigravity IDE Hooks" })),
    body,
  );

  const rebuild = async () => {
    const fresh = await Bridge.hooksStatus();
    if (fresh) Object.assign(status, fresh);
    clear(body);
    draw();
    const head = section.querySelector("h2")!;
    head.replaceChildren(
      statusDot(status.installed),
      h("span", { text: "Antigravity IDE Hooks" }),
    );
  };

  function draw() {
    if (!status.hookReady) {
      body.append(
        h("div", {
          class: "notice err",
          text: `The hook helper is missing from ${status.hookPath}. Build coucou-hook.exe first.`,
        }),
      );
      return;
    }

    const state = h("div", { class: "row" });
    const btn = h("button", {
      class: status.installed ? "danger" : "primary",
      text: status.installed ? "Remove hooks" : "Install hooks",
    });

    btn.addEventListener("click", () => {
      btn.disabled = true;
      void previewFlow(!status.installed);
    });

    state.append(
      h("span", {
        class: "hint",
        text: status.installed
          ? "Hooks are active. Antigravity IDE automatically notifies your desktop mascots."
          : "Not installed yet. Click below to register hooks into your configuration.",
      }),
      h("span", { class: "spacer" }),
      btn,
    );
    body.append(state);

    if (status.settingsPath) {
      body.append(
        h("div", {
          class: "path",
          text: `Target: ${status.settingsPath}`,
        }),
      );
    }
  }

  async function previewFlow(install: boolean) {
    clear(body);
    let preview;
    try {
      preview = await Bridge.hooksPreview(install);
    } catch (err) {
      body.append(
        h("div", { class: "notice err", text: `Could not prepare preview: ${String(err)}` }),
        h("button", { text: "Back", onclick: () => { clear(body); draw(); } }),
      );
      return;
    }

    if (!preview) {
      clear(body);
      draw();
      return;
    }

    body.append(
      h("div", {
        class: "hint",
        text: install
          ? "Here is the change that will be written into your configuration:"
          : "Here is the change to revert and remove hooks:",
      }),
      renderDiff(preview.diff),
    );

    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Confirm and write" : "Confirm removal",
    });

    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const backup = await Bridge.hooksApply(install, preview.fingerprint);
        clear(body);
        body.append(
          h("div", {
            class: "notice ok",
            text: `Done. Previous settings saved as ${backup}.`,
          }),
        );
        window.setTimeout(() => void rebuild(), 2600);
      } catch (err) {
        confirm.disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });

    body.append(
      h(
        "div",
        { class: "row" },
        confirm,
        h("button", {
          text: "Cancel",
          onclick: () => {
            clear(body);
            draw();
          },
        }),
      ),
    );
  }

  draw();
  return section;
}

// ── General section ───────────────────────────────────────────────────────────

function generalSection(): HTMLElement {
  const volume = h("input", {
    type: "range",
    min: "0",
    max: "0.2",
    step: "0.005",
    value: String(settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
    void save();
  });

  const screen = h("select", {}) as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: "Main display" }),
    h("option", { value: "cursor", text: "Display under the cursor" }),
  );
  screen.value = settings.screen;
  screen.addEventListener("change", () => {
    settings.screen = screen.value as Settings["screen"];
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { text: "General" })),
    h(
      "div",
      { class: "row" },
      h("label", { text: "Sound" }),
      toggle(settings.soundEnabled, (v) => {
        settings.soundEnabled = v;
        void save();
      }),
      volume,
    ),
    h("div", { class: "row" }, h("label", { text: "Mascots live on" }), screen),
    h(
      "div",
      { class: "row" },
      h("label", { text: "Launch at startup" }),
      toggle(settings.autostart, (v) => {
        settings.autostart = v;
        void save();
      }),
    ),
  );
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...settings, ...boot.settings };
    version = boot.version;
  }
  const status = (await Bridge.hooksStatus()) ?? {
    installed: false,
    settingsPath: "",
    hookPath: "",
    hookReady: false,
  };

  clear(root);
  root.append(
    h("h1", {}, h("span", { text: "Antigravity Pet" }), h("span", { class: "version", text: version })),
    hooksSection(status),
    generalSection(),
    h("div", {
      class: "hint",
      text: "Connected to Antigravity IDE via local Windows named pipes.",
    }),
  );

  void onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
  });
}

void main();
