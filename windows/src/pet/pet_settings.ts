// PetSettings — User-configurable companion preferences
// Controls enabled autonomous animations, sound effects, interval pacing, and desktop UI elements.

export type PetAnimationKey =
  | "walking"
  | "whistling"
  | "dance"
  | "coffee"
  | "sleep"
  | "stretch"
  | "snack"
  | "bugHunt"
  | "sneeze";

export type IntervalPreset = "often" | "normal" | "rare";

export interface PetSettings {
  soundEnabled: boolean;
  intervalPreset: IntervalPreset;
  showBubbles: boolean;
  showProjectTag: boolean;
  animations: Record<PetAnimationKey, boolean>;
}

export const ANIMATION_META: Record<PetAnimationKey, { label: string; icon: string }> = {
  walking: { label: "Chůze", icon: "🚶" },
  whistling: { label: "Pískání", icon: "🎵" },
  dance: { label: "Tanec s hudbou", icon: "🎧" },
  coffee: { label: "Kávová pauza", icon: "☕" },
  sleep: { label: "Šlofík", icon: "💤" },
  stretch: { label: "Rozcvička", icon: "🧘" },
  snack: { label: "Svačinka", icon: "🍴" },
  bugHunt: { label: "Lov brouka", icon: "🐛" },
  sneeze: { label: "Kýchání", icon: "🤧" },
};

export const INTERVAL_PRESETS: Record<IntervalPreset, { min: number; max: number; label: string }> = {
  often: { min: 15000, max: 30000, label: "Často (15–30 s)" },
  normal: { min: 30000, max: 60000, label: "Normálně (30–60 s)" },
  rare: { min: 60000, max: 120000, label: "Zřídka (60–120 s)" },
};

export const DEFAULT_PET_SETTINGS: PetSettings = {
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

const STORAGE_KEY = "coucou_pet_settings_v1";

let currentSettings: PetSettings = loadPetSettings();
const listeners = new Set<(settings: PetSettings) => void>();

export function getPetSettings(): PetSettings {
  return currentSettings;
}

export function loadPetSettings(): PetSettings {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PetSettings>;
        return {
          soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_PET_SETTINGS.soundEnabled,
          intervalPreset:
            parsed.intervalPreset && parsed.intervalPreset in INTERVAL_PRESETS
              ? parsed.intervalPreset
              : DEFAULT_PET_SETTINGS.intervalPreset,
          showBubbles: typeof parsed.showBubbles === "boolean" ? parsed.showBubbles : DEFAULT_PET_SETTINGS.showBubbles,
          showProjectTag:
            typeof parsed.showProjectTag === "boolean" ? parsed.showProjectTag : DEFAULT_PET_SETTINGS.showProjectTag,
          animations: {
            ...DEFAULT_PET_SETTINGS.animations,
            ...(parsed.animations || {}),
          },
        };
      }
    }
  } catch (err) {
    console.warn("[pet_settings] Failed to load settings from localStorage:", err);
  }
  return {
    ...DEFAULT_PET_SETTINGS,
    animations: { ...DEFAULT_PET_SETTINGS.animations },
  };
}

export function savePetSettings(settings: PetSettings): void {
  currentSettings = {
    ...settings,
    animations: { ...settings.animations },
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    }
  } catch (err) {
    console.warn("[pet_settings] Failed to persist settings to localStorage:", err);
  }
  notifyListeners();
}

export function updatePetSettings(partial: Partial<PetSettings>): void {
  const updated: PetSettings = {
    ...currentSettings,
    ...partial,
    animations: {
      ...currentSettings.animations,
      ...(partial.animations || {}),
    },
  };
  savePetSettings(updated);
}

export function resetPetSettings(): PetSettings {
  const reset = {
    ...DEFAULT_PET_SETTINGS,
    animations: { ...DEFAULT_PET_SETTINGS.animations },
  };
  savePetSettings(reset);
  return reset;
}

export function onPetSettingsChanged(fn: (settings: PetSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners(): void {
  for (const fn of listeners) {
    try {
      fn(currentSettings);
    } catch (err) {
      console.error("[pet_settings] Listener error:", err);
    }
  }
}
