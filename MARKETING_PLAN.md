# 🚀 Marketingový Plán: Antigravity Pet (Windows)

> **Cíl plánu:** Dostat aplikaci mezi tisíce vývojářů po celém světě, vybudovat komunitu fanoušků na GitHubu a využít tuto pozornost jako odrazový můstek pro tvé další projekty.

---

## 1. Exekutivní Shrnutí & Hodnocení Potenciálu

### Proč se Antigravity Pet uchytí?
* **Emocionální & Nostalgický magnet:** Vývojáři tráví 8–12 hodin denně před monitorem. Nástroje jako *VS Code Pets* (1 000 000+ instalací) nebo *Desktop Goose* dokázaly, že lidé milují virtuální společníky na ploše.
* **Jízda na AI vlně:** Google Antigravity a Claude Code zažívají obrovský rozmach. Vývojáři aktivně vyhledávají pluginy, motivy a doplňky.
* **Prázdná díra na trhu (Windows):** Původní projekt Coucou/NotchBuddy existoval výhradně pro macOS a MacBook Notch. Windows komunita (více než 70 % trhu) byla dosud zcela opomenuta.
* **Reálná funkční hodnota:** Není to jen dekorace — vizualizuje myšlení AI agenta v reálném čase (kódování, schvalování změn, dokončení úkolu), nabízí obousměrné zrcadlo chatu a autentické 8-bitové zvukové efekty.

---

## 2. Fáze 0: Příprava Produktu (Odstranění bariér)

Neprogramátor ani zaneprázdněný senior vývojář nebude kompilovat kód v terminálu. Instalace musí být na 1 kliknutí.

* [x] **Jednoklikový instalátor (`AntigravityPet-Setup.exe`):**
  * Vytvořen pomocí Tauri a NSIS.
  * Instaluje se přímo do uživatelského profilu bez nutnosti administrátorských práv.
* [x] **Automatické vydávání verzí na GitHubu:**
  * Nastaven GitHub Actions workflow (`.github/workflows/windows.yml`), který při každém tagu (např. `v0.1.1`) automaticky sestaví a přiloží instalátor do záložky **Releases**.
* [ ] **Vizuální háček do README (GIF / Video):**
  * Krátký 5–10vteřinový GIF na samotném začátku `README.md`:
    1. Zvířátko spokojeně sedí na horní hraně okna Antigravity IDE.
    2. V bublině se ukáže text úkolu a zvířátko začne bušit do klávesnice.
    3. Zvířátko radostně poskočí, kýchne a vyskočí barevné jiskry.
    4. Kliknutí na ozubené kolečko (⚙️) a otevření nastavení.

---

## 3. Fáze 1: Virální Sociální Sítě (Organický dosah zdarma)

### A. Twitter / X (Epicentrum AI a dev komunity)
Natoč krátké 20–30s video obrazovky se zapnutým zvukem (zvuk kýchnutí a 8-bit melodie přitahují obrovskou pozornost).

#### 📝 Šablona příspěvku (anglicky pro globální dosah):
```text
Tired of boring loading spinners while your AI agent codes? 🐾

I built Antigravity Pet — an open-source retro 8-bit desktop Shimeji companion for Google Antigravity IDE on Windows (Tauri v2 + Rust).

✨ Real-time AI state mirroring (thinking, editing, finished)
🎭 9 custom animations & interactive physics
🔊 Authentic 8-bit synthesizer audio & sneeze sounds
⚙️ Built-in settings & prompt mirror

100% free & open-source on GitHub 👇
https://github.com/kubkic-code/antigravity-pet

#buildinpublic #antigravity #rustlang #tauri #pixelart #devtools
```

#### Taktika na X:
* Odpověz na populární vlákna o Google Antigravity a Claude Code s krátkým videem zvířátka.
* Označ oficiální profily `@TauriApps` (velmi rádi repostují pěkné komunitní projekty postavené na Tauri v2).

---

### B. TikTok, Instagram Reels & YouTube Shorts
Krátká videa na vývojářská témata mají virální algoritmus, který dokáže přinést statisíce zhlédnutí během 48 hodin.

#### 🎥 3 Osvědčené Koncepty Videí:
1. **Koncept 1: "Stupid dev tools that I can't live without"**
   * *Začátek:* Kamera na monitor, znuděný obličej u běžného editoru.
   * *Střih:* „Tak jsem si do Antigravity IDE přidal pixelartového tygříka, který mi hlídá kód.“
   * *Závěr:* Zvířátko spadne na spodní lištu, otřepe se a začne kódovat.
2. **Koncept 2: "I turned my AI coding assistant into a 90s Tamagotchi"**
   * Ukázka reakcí: spánek -> prompt -> práce -> kýchnutí při dokončení.
3. **Koncept 3: Vizuální setup / aesthetic desk tour**
   * Záběr na hezkou klávesnici, monitor a na něm pobíhající zvířátko. Hudba v pozadí: retro lofi beat.

---

## 4. Fáze 2: Komunity, Fóra a Vývojářské Portály

### A. Reddit (Pravidlo autenticity)
Reddit nesnáší reklamu, ale miluje nezávislé vývojáře, kteří sdílejí své technické výzvy a open-source projekty.

* **Doporučené subreddity:**
  * `r/programming`
  * `r/rust` (zdůrazni architekturu Tauri v2 + Win32 hooks)
  * `r/tauri`
  * `r/sideproject`
  * `r/ClaudeAI`
  * `r/webdev`

#### 📝 Šablona příspěvku na Reddit:
* **Titulek:** *I built an open-source desktop pet companion for Google Antigravity IDE on Windows using Tauri v2 & Rust*
* **Obsah:**
  > Hey everyone! I really liked the idea of desktop companions reacting to code events, but almost everything was Mac-only (like notch apps).
  >
  > So I built **Antigravity Pet** for Windows 10/11. It's written in Rust and TypeScript using Tauri v2. It tracks the Antigravity IDE window, hooks into agent events in real-time, features authentic 8-bit sound synthesis, and lets you toggle animations and settings directly from the desktop.
  >
  > Everything is open-source (MIT). Would love your feedback and ideas for new pet mascots!
  > GitHub: [link] | Releases: [link]

---

### B. Hacker News (Show HN)
* **Titulek:** `Show HN: Antigravity Pet – Retro desktop companion for AI IDE (Windows, Tauri v2)`
* **Zaměření:** Technická stránka věci — zmínit bypass Win32 foreground locku, transparentní bezrámové okno, nulové vytížení CPU v nečinnosti a syntézu zvuku přes Web Audio API.

---

### C. Product Hunt Launch
* Spusť kampaň v **úterý nebo ve středu v 00:01 PST** (nejvyšší návštěvnost týdne).
* Připrav 4–5 pěkných snímků obrazovky s barevnými popisky (Tagline: *Retro 8-bit desktop Shimeji companion for Google Antigravity IDE*).
* V prvním komentáři („Maker's Comment“) popiš příběh projektu.

---

## 5. Fáze 3: Metoda #BuildInPublic & Most k Dalším Projektům

Tento projekt je ideální **magnet na pozornost (Top of Funnel)**. Roztomilý maskot zaujme lidi mnohem rychleji než seriózní B2B software, a právě tuto pozornost můžeš přelít do svých dalších projektů (např. automatizovaného scraperu na minibagry).

### Strategie propojení:
1. **Osobní brand vývojáře:**
   * V zápatí README i na sociálních sítích měj odkaz na svůj profil:  
     *„Created by @kubkic — building autonomous scrapers and AI dev tools.“*
2. **Komunitní ankety:**
   * Dělej na X a GitHub Discussions hlasování:  
     *„Jaké zvířátko přidáme příště? 🐼 Pandu, 🦊 Lišku, nebo 🤖 Minibagr?“*  
     *(Tím přirozeně a vtipně představíš i téma svého dalšího projektu).*
3. **Sdílení know-how:**
   * Napiš krátký technický článek na Dev.to nebo Medium:  
     *„How I built a zero-CPU transparent overlay for Windows in Rust & Tauri“*.  
     Články s vysokou technickou hodnotou ti přinesou respekt v komunitě a nabídky spolupráce.

---

## 6. Měřitelné Cíle (KPI)

| Milník | Cíl | Časový horizont |
| :--- | :--- | :--- |
| **Milník 1** | Hotový `.exe` instalátor v GitHub Releases + 50 hvězdiček na GitHubu | 1. týden |
| **Milník 2** | Příspěvek na Redditu a X s více než 10 000 zhlédnutími | 2. týden |
| **Milník 3** | 500+ stažení instalátoru a první komunitní Issue/Pull Request | 1. měsíc |
| **Milník 4** | Launch na Product Hunt (Top 5 produkt dne v kategorii Developer Tools) | 2. měsíc |
