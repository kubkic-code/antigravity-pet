// Animal mascot definitions and 8-bit pixel-art generator for Antigravity Pet (Shimeji).

export type AnimalId = "tiger" | "dog" | "monkey" | "elephant" | "fox" | "panda" | "penguin" | "cat";

export type PetState =
  | "idle"
  | "walk"
  | "thinking"
  | "working"
  | "finish"
  | "error"
  | "drag"
  | "sleep"
  | "coffee"
  | "dance"
  | "stretch"
  | "snack";

export interface AnimalPalette {
  primary: string;
  secondary: string;
  accent: string;
  belly: string;
  eyes: string;
  detail: string;
  highlight: string;
}

export interface AnimalInfo {
  id: AnimalId;
  name: string;
  species: string;
  emoji: string;
  palette: AnimalPalette;
  description: string;
}

export function getAnimalEmoji(id: string): string {
  switch (id) {
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

export const ANIMALS: Record<AnimalId, AnimalInfo> = {
  tiger: {
    id: "tiger",
    name: "Tygřík",
    species: "Tiger",
    emoji: "🐯",
    palette: {
      primary: "#ff8c1a",
      secondary: "#e06000",
      accent: "#221c1c", // Dark espresso stripes
      belly: "#fff8f0",  // Creamy white belly
      eyes: "#18181b",   // Deep obsidian eyes
      detail: "#fb7185", // Cute pink nose & ears
      highlight: "#ffffff",
    },
    description: "Statečný a energický tygřík, který rád řeší složité problémy.",
  },
  dog: {
    id: "dog",
    name: "Pejsek",
    species: "Shiba Inu",
    emoji: "🐶",
    palette: {
      primary: "#e89843", // Warm golden honey
      secondary: "#be6b20",
      accent: "#221c1c",
      belly: "#ffffff",
      eyes: "#18181b",
      detail: "#fb7185",
      highlight: "#ffffff",
    },
    description: "Věrný pejsek, který nadšeně vrtí ocáskem při každém dokončeném úkolu.",
  },
  monkey: {
    id: "monkey",
    name: "Opička",
    species: "Monkey",
    emoji: "🐵",
    palette: {
      primary: "#854d0e",
      secondary: "#5c3306",
      accent: "#fed7aa", // Soft golden peach face
      belly: "#ffedd5",
      eyes: "#18181b",
      detail: "#ea580c",
      highlight: "#ffffff",
    },
    description: "Hravá opička, která hbitě ťuká do klávesnice a skáče radostí.",
  },
  elephant: {
    id: "elephant",
    name: "Sloník",
    species: "Elephant",
    emoji: "🐘",
    palette: {
      primary: "#7da2bf", // Dreamy pastel blue
      secondary: "#577b99",
      accent: "#9bbcd8",
      belly: "#c4ddf2",
      eyes: "#18181b",
      detail: "#f472b6", // Baby pink ears
      highlight: "#ffffff",
    },
    description: "Moudrý a klidný sloník s roztomilým chobotem a velkýma ušima.",
  },
  fox: {
    id: "fox",
    name: "Lištička",
    species: "Fox",
    emoji: "🦊",
    palette: {
      primary: "#f95700", // Vibrant fire fox orange
      secondary: "#c83e00",
      accent: "#18181b", // Midnight socks & ear tips
      belly: "#ffffff", // Pure white chest & tail tip
      eyes: "#18181b",
      detail: "#fb7185",
      highlight: "#ffffff",
    },
    description: "Chytrá lištička s huňatým ocáskem, která vidí chyby dřív než kompilátor.",
  },
  panda: {
    id: "panda",
    name: "Panda",
    species: "Giant Panda",
    emoji: "🐼",
    palette: {
      primary: "#ffffff", // Crisp white
      secondary: "#e2e8f0",
      accent: "#18181b", // Velvet black patches & vest
      belly: "#ffffff",
      eyes: "#18181b",
      detail: "#22c55e", // Emerald green bamboo shoot
      highlight: "#f472b6", // Rosy cheeks
    },
    description: "Klidný zenový medvídek panda, který chroustá bambus a krotí chybové logy.",
  },
  penguin: {
    id: "penguin",
    name: "Tučňák",
    species: "Penguin (Tux)",
    emoji: "🐧",
    palette: {
      primary: "#1e293b", // Slate navy coat
      secondary: "#0f172a",
      accent: "#f59e0b", // Golden feet and beak
      belly: "#ffffff", // Clean white belly
      eyes: "#38bdf8", // Cyan glowing eyes
      detail: "#f97316", // Vibrant orange beak
      highlight: "#ffffff",
    },
    description: "Programátorská ikona Tučňák Tux – mistr terminálu a systémových hovorů.",
  },
  cat: {
    id: "cat",
    name: "Kočička",
    species: "Neko Cat",
    emoji: "🐱",
    palette: {
      primary: "#fb923c", // Warm ginger orange
      secondary: "#ea580c",
      accent: "#c2410c", // Dark ginger stripes
      belly: "#fef3c7", // Soft cream chest
      eyes: "#10b981", // Emerald green eyes
      detail: "#f472b6", // Cute pink ears & nose
      highlight: "#ffffff",
    },
    description: "Hravá zrzavá kočička, která spokojeně vrní při zelených testech.",
  },
};

export const ANIMAL_LIST: AnimalId[] = ["tiger", "dog", "monkey", "elephant", "fox", "panda", "penguin", "cat"];

/** Pick a random animal from the registry */
export function getRandomAnimal(): AnimalInfo {
  const idx = Math.floor(Math.random() * ANIMAL_LIST.length);
  return ANIMALS[ANIMAL_LIST[idx]];
}

export function getAnimalById(id: string | null | undefined): AnimalInfo {
  if (id && id in ANIMALS) {
    return ANIMALS[id as AnimalId];
  }
  return ANIMALS.tiger;
}

/**
 * 20x20 pixel-art frame matrix.
 * Symbols:
 * '.' = transparent
 * 'P' = primary body color
 * 'S' = secondary / shadow body color
 * 'B' = belly / muzzle color
 * 'A' = accent color (stripes, markings, ear tips)
 * 'E' = eyes
 * 'D' = detail (cheeks, pink ears, nose)
 * 'W' = white / highlight
 * 'L' = laptop / tool dark metal (#374151)
 * 'C' = laptop screen / cyan glow (#38bdf8)
 * 'K' = keyboard keys (#9ca3af)
 * 'G' = celebration star gold (#fbbf24)
 * 'R' = error red (#ef4444)
 */

type PixelRow = string;
export type SpriteMatrix = PixelRow[];

/** Generates the pixel matrix for a given animal and state/frame */
export function getAnimalMatrix(animal: AnimalInfo, state: PetState, frame: number): SpriteMatrix {
  const id = animal.id;

  switch (state) {
    case "idle":
      return frame % 2 === 0 ? getIdleFrame1(id) : getIdleFrame2(id);

    case "walk":
      return frame % 2 === 0 ? getWalkFrame1(id) : getWalkFrame2(id);

    case "thinking":
      return frame % 2 === 0 ? getThinkingFrame1(id) : getThinkingFrame2(id);

    case "working":
      return frame % 2 === 0 ? getWorkingFrame1(id) : getWorkingFrame2(id);

    case "finish":
      return frame % 2 === 0 ? getFinishFrame1(id) : getFinishFrame2(id);

    case "error":
      return frame % 2 === 0 ? getErrorFrame1(id) : getErrorFrame2(id);

    case "drag":
      return getDragFrame(id);

    case "sleep":
      return frame % 2 === 0 ? getSleepFrame1(id) : getSleepFrame2(id);

    case "coffee":
      return frame % 2 === 0 ? getCoffeeFrame1(id) : getCoffeeFrame2(id);

    case "dance":
      return frame % 2 === 0 ? getDanceFrame1(id) : getDanceFrame2(id);

    case "stretch":
      return frame % 2 === 0 ? getStretchFrame1(id) : getStretchFrame2(id);

    case "snack":
      return frame % 2 === 0 ? getSnackFrame1(id) : getSnackFrame2(id);

    default:
      return getIdleFrame1(id);
  }
}

// ── Frames Definitions ────────────────────────────────────────────────────────

function getTigerIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    "....A......A........",
    "...AAA....AAA.......",
    "...ADA....ADA.......",
    "..APPPPAAPPPPA......",
    "..APAPPPPPPAPA......",
    "..APPWEPPWEPPA......",
    "..APPPPAAPPPPA......",
    "...PPBBDBBPPP.......",
    "...PPBBBBBBPP.......",
    "....PPPPPPPP........",
    "...PABBBBAPPP.......",
    "..PPABBBBAPPPP......",
    "..PPABBBBAPPPA......",
    "..PPPPPPPPPP.A......",
    "...PP.....PP.A......",
    "...PP.....PP.A......",
    "...WW.....WW.A......",
    "....................",
  ];
}

function getFoxIdle(): SpriteMatrix {
  return [
    "....................",
    "...AA......AA.......",
    "...AAA....AAA.......",
    "...AWA....AWA.......",
    "..APPPPAAPPPPA......",
    "..APPPPPPPPPPA......",
    "..APPWEPPWEPPA......",
    "...PPWWDDWWPP.......",
    "....PPWWWWPP........",
    ".....PPPPPP.........",
    "....PPBBBBPP...W....",
    "...PPPBBBBPPP.WW....",
    "...PPPBBBBPPP.PP....",
    "...PPPPPPPPPPP.PP...",
    "....PPPPPPPPPPPPP...",
    "....PPPPPPPPPPP.....",
    ".....PP.....PP......",
    ".....AA.....AA......",
    ".....AA.....AA......",
    "....................",
  ];
}

function getDogIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    "....S......S........",
    "...SSS....SSS.......",
    "...SDS....SDS.......",
    "..SPPPPAAPPPPS......",
    "..SPWP....PWPS......",
    "..PPPE....EPPP......",
    "...PBBDBBDBBP.......",
    "...PBBBBBBBP........",
    "....PPPPPPPP...P....",
    "...PPBBBBBBPPP.P....",
    "..PPPBBBBBBPPPP.....",
    "..PPPBBBBBBPPPP.....",
    "...PPPPPPPPPP.......",
    "....PP.....PP.......",
    "....PP.....PP.......",
    "....WW.....WW.......",
    "....WW.....WW.......",
    "....................",
  ];
}

function getPandaIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    "...AA......AA.......",
    "..AAAA....AAAA......",
    "..AAAA....AAAA......",
    "...PPPPPPPPPP.......",
    "..PAAPPAAPPAAP......",
    "..PAWEPAWEAPAP......",
    "..PAAPPAAPPAAP......",
    "...PPPDDDDPPP.......",
    "....PPBDBBPP........",
    "...AABBBBBBAA.......",
    "..AAABBBBBBAAA......",
    "..AAABBBBBBAAA.D....",
    "...AABBBBBBAA..D....",
    "....AAAAAAAA........",
    "....AA....AA........",
    "....AA....AA........",
    "....AA....AA........",
    "....................",
  ];
}

function getCatIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    "....A......A........",
    "...ADA....ADA.......",
    "..ADDA....ADDA......",
    "..APPPPAAPPPPA......",
    "..APPPPPPPPPPA......",
    "..APPWEPPWEPPA......",
    "..PPPPDDDPPPPA......",
    "..PPPPBBPBBBPA...A..",
    "...PPPBBPBBP.....A..",
    "....PPPPPPP.....A...",
    "...PBBBBBBBP...A....",
    "..PPBBBBBBBP...A....",
    "..PPBBBBBBBPAAA.....",
    "..PPPPPPPPPPP.......",
    "...PP.....PP........",
    "...WW.....WW........",
    "...WW.....WW........",
    "....................",
  ];
}

function getPenguinIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    ".......PPPP.........",
    "......PPPPPP........",
    ".....PPEPPEPP.......",
    ".....PPWEPPEPP......",
    "......PDDDDP........",
    ".....PPPPPPPP.......",
    "....PPPPPPPPPP......",
    "...PP.PBBBBPP.P.....",
    "...PP.PBBBBPP.P.....",
    "...PP.PBBBBPP.P.....",
    "...PP.PBBBBPP.P.....",
    "....P.PBBBBPP.P.....",
    "......PPPPPP........",
    "......AAAAAA........",
    ".....AA....AA.......",
    "....AAA....AAA......",
    "....................",
    "....................",
  ];
}

function getMonkeyIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    "....A.PPPP.A........",
    "...AAAPPPPPAAA......",
    "..AAAAPPPPPAAAA.....",
    "..AAAPAAAAAPAAA.....",
    "...AAPEAAPEAAP......",
    "...AAPWEAPWEAP......",
    "....AAADBDAAP....P..",
    ".....AAAAAAP.....P..",
    "......PPPP.......P..",
    ".....PPPPPP.....P...",
    "....PBBBBBP.P...P...",
    "....PBBBBBPP...P....",
    "....PBBBBBP...P.....",
    "....PPPPPPP..P......",
    ".....PP...PP........",
    ".....AA...AA........",
    ".....AA...AA........",
    "....................",
  ];
}

function getElephantIdle(): SpriteMatrix {
  return [
    "....................",
    "....................",
    ".....A..PP..A.......",
    "....AAAPPPPPAA......",
    "...AAAPPPPPAAA......",
    "...ADPEPPDDPAA......",
    "...ADPEPPWEPAA......",
    "....APPBPPBPPA......",
    "....APPPWPPA........",
    ".....APPPPPP........",
    "......APPPP.........",
    "......PPPPPPP.......",
    ".....PBBBBBBBP......",
    ".....PBBBBBBBP......",
    ".....PBBBBBBBP......",
    ".....PPPPPPPPP......",
    ".....PP.....PP......",
    ".....PP.....PP......",
    ".....WW.....WW......",
    "....................",
  ];
}

function getIdleFrame1(id: AnimalId): SpriteMatrix {
  switch (id) {
    case "tiger":
      return getTigerIdle();
    case "fox":
      return getFoxIdle();
    case "dog":
      return getDogIdle();
    case "panda":
      return getPandaIdle();
    case "cat":
      return getCatIdle();
    case "penguin":
      return getPenguinIdle();
    case "monkey":
      return getMonkeyIdle();
    case "elephant":
      return getElephantIdle();
    default:
      return getTigerIdle();
  }
}

function getIdleFrame2(id: AnimalId): SpriteMatrix {
  const base = getIdleFrame1(id).map((row) => row.slice());
  // Happy eye blink
  return base.map((row) => row.replace(/E/g, "D").replace(/W/g, "D"));
}

function getWalkFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  if (id === "penguin") {
    f[15] = "......AAAAAA........";
    f[16] = ".....AAA...AA.......";
    f[17] = "....AAAA...A........";
    return f;
  }
  const lastRow = f.length - 2;
  f[lastRow - 2] = f[lastRow - 2].replace(/PP\.\.\.\.\.PP/, "PPP....PP");
  f[lastRow - 1] = f[lastRow - 1].replace(/PP\.\.\.\.\.PP/, "PPP......PP");
  return f;
}

function getWalkFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  if (id === "penguin") {
    f[15] = "......AAAAAA........";
    f[16] = ".....AA...AAA.......";
    f[17] = ".....A...AAAA.......";
    return f;
  }
  const lastRow = f.length - 2;
  f[lastRow - 2] = f[lastRow - 2].replace(/PP\.\.\.\.\.PP/, "PP....PPP");
  f[lastRow - 1] = f[lastRow - 1].replace(/PP\.\.\.\.\.PP/, "PP......PPP");
  return f;
}

function getThinkingFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "............WW......";
  f[1] = "...........W..W.....";
  f[2] = f[2].slice(0, 13) + "W" + f[2].slice(14);
  return f;
}

function getThinkingFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "............WW......";
  f[1] = "...........WGGW.....";
  f[2] = f[2].slice(0, 13) + "W" + f[2].slice(14);
  return f;
}

function getWorkingFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[10] = f[10].slice(0, 13) + "...C.....";
  f[11] = f[11].slice(0, 13) + ".CCC....";
  f[12] = f[12].slice(0, 13) + ".LLC....";
  f[13] = f[13].slice(0, 11) + "LLLL.....";
  f[14] = f[14].slice(0, 9) + "LLLLKK.....";
  return f;
}

function getWorkingFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[1] = f[1].slice(0, 13) + "..C.....";
  f[2] = f[2].slice(0, 13) + ".CC.....";
  f[10] = f[10].slice(0, 13) + "........";
  f[11] = f[11].slice(0, 13) + ".LLC....";
  f[12] = f[12].slice(0, 13) + ".CCC....";
  f[13] = f[13].slice(0, 11) + "LLLL.....";
  f[14] = f[14].slice(0, 9) + "LLLLKK.....";
  return f;
}

function getFinishFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "....G.........G.....";
  f[1] = "...GGG.......GGG....";
  f[2] = "....G." + f[2].slice(6, 14) + ".G.....";
  return f;
}

function getFinishFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "...GGG.......GGG....";
  f[1] = "..GGGGG.....GGGGG...";
  f[2] = "...GGG" + f[2].slice(6, 14) + "GGG....";
  return f.map((row) => row.replace(/E/g, "D").replace(/W/g, "D"));
}

function getErrorFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "..........RR........";
  f[1] = ".........RRRR.......";
  f[2] = "..........RR........";
  return f.map((row) => row.replace(/E/g, "R"));
}

function getErrorFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[0] = "..........RR........";
  f[1] = "..........RR........";
  return f.map((row) => row.replace(/E/g, "R"));
}

function getDragFrame(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  const lastRow = f.length - 2;
  f[lastRow - 2] = f[lastRow - 2].replace(/PP\.\.\.\.\.PP/, "..PP.PP..");
  f[lastRow - 1] = f[lastRow - 1].replace(/PP\.\.\.\.\.PP/, "..PP.PP..");
  return f;
}

function getSleepFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  const sleeping = f.map((row) => row.replace(/E/g, "D").replace(/W/g, "D"));
  sleeping[0] = "............W.......";
  sleeping[1] = "...........WW.......";
  return sleeping;
}

function getSleepFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  const sleeping = f.map((row) => row.replace(/E/g, "D").replace(/W/g, "D"));
  sleeping[0] = "...........WWW......";
  sleeping[1] = "..........WW.WW.....";
  return sleeping;
}

function getCoffeeFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[11] = f[11].slice(0, 13) + "..W.....";
  f[12] = f[12].slice(0, 13) + ".W......";
  f[13] = f[13].slice(0, 13) + "MMMM....";
  f[14] = f[14].slice(0, 13) + "MMMM....";
  f[15] = f[15].slice(0, 13) + ".MMM....";
  return f;
}

function getCoffeeFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[11] = f[11].slice(0, 13) + ".W......";
  f[12] = f[12].slice(0, 13) + "..W.....";
  f[13] = f[13].slice(0, 13) + "MMMM....";
  f[14] = f[14].slice(0, 13) + "MMMM....";
  f[15] = f[15].slice(0, 13) + ".MMM....";
  return f.map((row) => row.replace(/E/g, "D"));
}

function getDanceFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[3] = f[3].slice(0, 3) + "HHHHHHHHHH" + f[3].slice(13);
  f[4] = f[4].slice(0, 2) + "HH" + f[4].slice(4, 12) + "HH" + f[4].slice(14);
  f[5] = f[5].slice(0, 2) + "HH" + f[5].slice(4, 12) + "HH" + f[5].slice(14);
  f[0] = "...Y..........Y.....";
  f[1] = "...YY........YY.....";
  return f;
}

function getDanceFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[3] = f[3].slice(0, 3) + "HHHHHHHHHH" + f[3].slice(13);
  f[4] = f[4].slice(0, 2) + "HH" + f[4].slice(4, 12) + "HH" + f[4].slice(14);
  f[5] = f[5].slice(0, 2) + "HH" + f[5].slice(4, 12) + "HH" + f[5].slice(14);
  f[0] = "....Y..........Y....";
  f[1] = "....YY........YY....";
  return f.map((row) => row.replace(/E/g, "D"));
}

function getStretchFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  f[2] = f[2].slice(0, 2) + "PP" + f[2].slice(4, 12) + "PP" + f[2].slice(14);
  f[3] = f[3].slice(0, 2) + "PP" + f[3].slice(4, 12) + "PP" + f[3].slice(14);
  return f;
}

function getStretchFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  return f.map((row) => row.replace(/E/g, "D").replace(/W/g, "D"));
}

function getSnackFrame1(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  let snackChars = "FFFF";
  if (id === "cat" || id === "penguin") snackChars = "OOOO";
  else if (id === "dog") snackChars = "WWWW";
  else if (id === "monkey") snackChars = "YYYY";
  else if (id === "tiger") snackChars = "RRRR";
  else if (id === "fox") snackChars = "RRDD";
  else if (id === "elephant") snackChars = "RRRR";

  f[10] = f[10].slice(0, 11) + snackChars + f[10].slice(15);
  f[11] = f[11].slice(0, 11) + snackChars + f[11].slice(15);
  return f;
}

function getSnackFrame2(id: AnimalId): SpriteMatrix {
  const f = getIdleFrame1(id).map((row) => row.slice());
  let snackChars = "FFFF";
  if (id === "cat" || id === "penguin") snackChars = "OOOO";
  else if (id === "dog") snackChars = "WWWW";
  else if (id === "monkey") snackChars = "YYYY";
  else if (id === "tiger") snackChars = "RRRR";
  else if (id === "fox") snackChars = "RRDD";
  else if (id === "elephant") snackChars = "RRRR";

  f[11] = f[11].slice(0, 11) + snackChars + f[11].slice(15);
  f[12] = f[12].slice(0, 12) + ".." + f[12].slice(14);
  return f.map((row) => row.replace(/E/g, "D"));
}

/**
 * Renders a SpriteMatrix directly onto an HTML Canvas element.
 * Pixel art is drawn crisply without anti-aliasing.
 */
export function renderSpriteToCanvas(
  canvas: HTMLCanvasElement,
  matrix: SpriteMatrix,
  palette: AnimalPalette,
  scale = 4,
) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const height = matrix.length;
  const width = matrix[0]?.length ?? 20;

  const targetWidth = width * scale;
  const targetHeight = height * scale;

  // Render at native device pixels to ensure tack-sharp pixel art on 125%/150%/200% displays
  canvas.width = Math.round(targetWidth * dpr);
  canvas.height = Math.round(targetHeight * dpr);
  canvas.style.width = `${targetWidth}px`;
  canvas.style.height = `${targetHeight}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const px = scale * dpr;

  for (let y = 0; y < height; y++) {
    const row = matrix[y];
    for (let x = 0; x < width; x++) {
      const char = row[x];
      if (char === ".") continue;

      let color = palette.primary;
      switch (char) {
        case "P":
          color = palette.primary;
          break;
        case "S":
          color = palette.secondary;
          break;
        case "B":
          color = palette.belly;
          break;
        case "A":
          color = palette.accent;
          break;
        case "E":
          color = palette.eyes;
          break;
        case "D":
          color = palette.detail;
          break;
        case "W":
          color = palette.highlight;
          break;
        case "L":
          color = "#374151"; // Laptop gray
          break;
        case "C":
          color = "#38bdf8"; // Cyan screen glow
          break;
        case "K":
          color = "#9ca3af"; // Keyboard
          break;
        case "G":
          color = "#fbbf24"; // Gold star
          break;
        case "R":
          color = "#ef4444"; // Error red
          break;
        case "M":
          color = "#92400e"; // Coffee mug brown
          break;
        case "H":
          color = "#06b6d4"; // Cyan/teal headphones
          break;
        case "F":
          color = "#22c55e"; // Green bamboo / leaf
          break;
        case "Y":
          color = "#facc15"; // Yellow music note / star / banana
          break;
        case "O":
          color = "#f97316"; // Orange fish / snack
          break;
      }

      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x * px), Math.round(y * px), Math.ceil(px), Math.ceil(px));
    }
  }
}
