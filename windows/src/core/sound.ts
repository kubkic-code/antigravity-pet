// SoundEngine — Audio player for Antigravity Pet Shimeji & Chat interactions.

export const SOUND_NAMES = [
  "blip",
  "pop",
  "greet",
  "think",
  "work",
  "finish",
  "error",
  "wink",
  "open",
  "close",
  "send",
  "hover",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

function createNoiseBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

class SoundEngine {
  enabled = true;
  volume = 0.12;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private idleTimer: number | null = null;
  private activeMelodyNodes: { stop: () => void }[] = [];

  /** Creates the audio context and pre-decodes the pet WAV files. */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(ctx.destination);
      this.master = master;
      await Promise.all(
        SOUND_NAMES.map(async (name) => {
          try {
            const res = await fetch(`/sounds/${name}.wav`);
            if (!res.ok) return;
            const buf = await ctx.decodeAudioData(await res.arrayBuffer());
            this.buffers.set(name, buf);
          } catch {
            /* a missing sound must never break the app */
          }
        }),
      );
    })();
    return this.loading;
  }

  /** Ensures AudioContext is active and not suspended. */
  private ensureReady(): { ctx: AudioContext; master: GainNode } | null {
    if (!this.enabled) return null;
    let ctx = this.ctx;
    let master = this.master;
    if (!ctx || !master) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      this.ctx = ctx;
      master = ctx.createGain();
      master.gain.value = this.volume;
      master.connect(ctx.destination);
      this.master = master;
    }
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return { ctx, master };
  }

  /** WebView2 can hand us a suspended context; call after any user input. */
  resume() {
    if (this.idleTimer != null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    void this.ctx?.resume();
  }

  idle() {
    if (!this.ctx || this.ctx.state !== "running" || this.idleTimer != null || this.activeMelodyNodes.length > 0) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (this.activeMelodyNodes.length === 0) {
        void this.ctx?.suspend();
      }
    }, 1500);
  }

  /**
   * Sets the master gain volume. Range: 0.0 (mute) to 0.2 (max).
   *
   * NOTE: The hard cap of 0.2 is intentional — it maps to a comfortable listening level
   * for a desktop companion. Web Audio API's default output gain of 1.0 would be far too
   * loud for ambient desktop sounds. Settings UI sliders should map 0–100% → 0.0–0.2.
   */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(0.2, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.stopAllMelodies();
    }
  }

  /** Immediately silences any active synthesized music, beats, or whistling */
  stopAllMelodies() {
    for (const item of this.activeMelodyNodes) {
      try {
        item.stop();
      } catch {
        /* ignore already stopped nodes */
      }
    }
    this.activeMelodyNodes = [];
  }

  play(name: SoundName | string) {
    if (!this.enabled) return;
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    src.start();
  }

  /**
   * Plays a catchy, warm 8-bit lofi/chiptune groove when the pet puts on headphones.
   */
  playMusicBeat(duration = 7.5) {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;
    this.stopAllMelodies();

    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0.7, ctx.currentTime);
    trackGain.connect(master);

    const now = ctx.currentTime + 0.05;
    const stopTime = now + duration;

    // Smooth fade out at the end
    trackGain.gain.setValueAtTime(0.7, stopTime - 0.4);
    trackGain.gain.linearRampToValueAtTime(0.001, stopTime);

    // Warm Low-Pass filter to give a cozy nostalgic lofi tone
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.connect(trackGain);

    // Chord progression (C major - A minor - F major - G major)
    const bassNotes = [130.81, 110.00, 87.31, 98.00]; // C3, A2, F2, G2
    const arpChords = [
      [523.25, 659.25, 783.99, 1046.50], // C5, E5, G5, C6
      [440.00, 523.25, 659.25, 880.00],  // A4, C5, E5, A5
      [349.23, 440.00, 523.25, 698.46],  // F4, A4, C5, F5
      [392.00, 493.88, 587.33, 783.99],  // G4, B4, D5, G5
    ];

    const activeNodes: { stop: () => void }[] = [];
    const numBars = Math.floor(duration / 0.9);

    // 1. Bassline (warm bouncy triangle wave)
    for (let bar = 0; bar < numBars; bar++) {
      const barStart = now + bar * 0.9;
      if (barStart >= stopTime) break;
      const freq = bassNotes[bar % 4];

      const bassOsc = ctx.createOscillator();
      bassOsc.type = "triangle";
      bassOsc.frequency.setValueAtTime(freq, barStart);

      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0, barStart);
      bassGain.gain.linearRampToValueAtTime(0.75, barStart + 0.04);
      bassGain.gain.exponentialRampToValueAtTime(0.001, barStart + 0.85);

      bassOsc.connect(bassGain);
      bassGain.connect(trackGain);

      bassOsc.start(barStart);
      bassOsc.stop(barStart + 0.88);
      activeNodes.push({ stop: () => { try { bassOsc.stop(); } catch {} } });
    }

    // 2. Chiptune Arpeggios (pulse/square with soft attack)
    for (let bar = 0; bar < numBars; bar++) {
      const chord = arpChords[bar % 4];
      const barStart = now + bar * 0.9;
      for (let i = 0; i < 8; i++) {
        const noteStart = barStart + i * 0.112;
        if (noteStart + 0.1 >= stopTime) break;
        const patternIdx = [0, 1, 2, 3, 2, 1, 0, 2][i];
        const freq = chord[patternIdx];

        const leadOsc = ctx.createOscillator();
        leadOsc.type = "square";
        leadOsc.frequency.setValueAtTime(freq, noteStart);

        const leadGain = ctx.createGain();
        leadGain.gain.setValueAtTime(0, noteStart);
        leadGain.gain.linearRampToValueAtTime(0.32, noteStart + 0.015);
        leadGain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.095);

        leadOsc.connect(leadGain);
        leadGain.connect(filter);

        leadOsc.start(noteStart);
        leadOsc.stop(noteStart + 0.1);
        activeNodes.push({ stop: () => { try { leadOsc.stop(); } catch {} } });
      }
    }

    // 3. Subtle hi-hat / rhythm clicks
    const noiseBuf = createNoiseBuffer(ctx, 0.05);
    for (let t = now; t < stopTime; t += 0.225) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = "highpass";
      nFilter.frequency.setValueAtTime(5500, t);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.1, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(trackGain);
      src.start(t);
      src.stop(t + 0.045);
      activeNodes.push({ stop: () => { try { src.stop(); } catch {} } });
    }

    const stopper = {
      stop: () => {
        try {
          trackGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.05);
          for (const n of activeNodes) n.stop();
        } catch {}
      }
    };
    this.activeMelodyNodes.push(stopper);

    window.setTimeout(() => {
      const idx = this.activeMelodyNodes.indexOf(stopper);
      if (idx !== -1) this.activeMelodyNodes.splice(idx, 1);
      this.idle();
    }, (duration + 0.5) * 1000);
  }

  /**
   * Plays a sweet, cheerful whistling melody (whistling while walking/strolling on the taskbar).
   */
  playWhistle() {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;
    this.stopAllMelodies();

    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0.75, ctx.currentTime);
    trackGain.connect(master);

    const now = ctx.currentTime + 0.05;

    // Cheerful 2-phrase whistling tune with smooth vibrato and portamento (~5.2s)
    const melody = [
      // Phrase 1
      { start: 0.00, dur: 0.22, freq: 587.33, slideTo: 0, vibrato: false }, // D5
      { start: 0.25, dur: 0.22, freq: 783.99, slideTo: 0, vibrato: false }, // G5
      { start: 0.52, dur: 0.26, freq: 987.77, slideTo: 0, vibrato: false }, // B5
      { start: 0.82, dur: 0.38, freq: 1174.66, slideTo: 987.77, vibrato: true }, // D6 -> B5
      { start: 1.28, dur: 0.24, freq: 880.00, slideTo: 0, vibrato: false }, // A5
      { start: 1.58, dur: 0.65, freq: 783.99, slideTo: 0, vibrato: true }, // G5 sustained

      // Phrase 2 (answers Phrase 1)
      { start: 2.50, dur: 0.22, freq: 659.25, slideTo: 0, vibrato: false }, // E5
      { start: 2.76, dur: 0.22, freq: 783.99, slideTo: 0, vibrato: false }, // G5
      { start: 3.02, dur: 0.28, freq: 1046.50, slideTo: 0, vibrato: false }, // C6
      { start: 3.35, dur: 0.32, freq: 987.77, slideTo: 880.00, vibrato: true }, // B5 -> A5
      { start: 3.72, dur: 0.30, freq: 880.00, slideTo: 0, vibrato: false }, // A5
      { start: 4.08, dur: 0.90, freq: 783.99, slideTo: 0, vibrato: true }, // G5 long sustained finish
    ];

    const activeNodes: { stop: () => void }[] = [];

    for (const note of melody) {
      const noteStart = now + note.start;
      const noteDur = note.dur;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, noteStart);

      if (note.slideTo) {
        osc.frequency.setValueAtTime(note.freq, noteStart + noteDur * 0.4);
        osc.frequency.linearRampToValueAtTime(note.slideTo, noteStart + noteDur);
      }

      // Vibrato LFO for realistic mouth whistling
      if (note.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(5.8, noteStart);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0, noteStart);
        lfoGain.gain.linearRampToValueAtTime(8.5, noteStart + 0.15);
        lfo.connect(osc.frequency);
        lfo.start(noteStart);
        lfo.stop(noteStart + noteDur);
        activeNodes.push({ stop: () => { try { lfo.stop(); } catch {} } });
      }

      // Soft human whistling envelope (no clicks)
      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, noteStart);
      noteGain.gain.linearRampToValueAtTime(0.85, noteStart + 0.035);
      noteGain.gain.setValueAtTime(0.8, noteStart + noteDur - 0.04);
      noteGain.gain.linearRampToValueAtTime(0.001, noteStart + noteDur);

      osc.connect(noteGain);
      noteGain.connect(trackGain);

      osc.start(noteStart);
      osc.stop(noteStart + noteDur + 0.02);
      activeNodes.push({ stop: () => { try { osc.stop(); } catch {} } });
    }

    const stopper = {
      stop: () => {
        try {
          trackGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.05);
          for (const n of activeNodes) n.stop();
        } catch {}
      }
    };
    this.activeMelodyNodes.push(stopper);

    window.setTimeout(() => {
      const idx = this.activeMelodyNodes.indexOf(stopper);
      if (idx !== -1) this.activeMelodyNodes.splice(idx, 1);
      this.idle();
    }, 5400);
  }

  /** Plays a cute cartoon drink sip sound for coffee / tea breaks */
  playSip() {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.22);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.25);

    // Second little sip gulp
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(480, now + 0.26);
    osc2.frequency.exponentialRampToValueAtTime(220, now + 0.44);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0, now + 0.26);
    gain2.gain.linearRampToValueAtTime(0.4, now + 0.29);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    osc2.connect(gain2);
    gain2.connect(master);
    osc2.start(now + 0.26);
    osc2.stop(now + 0.47);
  }

  /** Plays cute crispy snack nibbles */
  playMunch() {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;

    const times = [0, 0.20, 0.40];
    const freqs = [640, 520, 590];

    times.forEach((tOffset, i) => {
      const now = ctx.currentTime + tOffset;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freqs[i], now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.07);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + 0.09);
    });
  }

  /** Plays an authentic acoustic sneeze ("Ah-aaah... CHOO!") with synchronized burst callback */
  playSneeze(onBurst?: () => void) {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;

    const now = ctx.currentTime;
    const noiseBuffer = createNoiseBuffer(ctx, 1.2);

    const stopCallbacks: (() => void)[] = [];
    const registerStop = (stopFn: () => void) => stopCallbacks.push(stopFn);

    // =========================================================
    // 1. INHALE PHASE: "Ah-aaah..." (0.0s -> 0.42s)
    // =========================================================

    // 1a. Inhaled air rushing through nasal cavity (filtered noise)
    const inhaleNoise = ctx.createBufferSource();
    inhaleNoise.buffer = noiseBuffer;

    const inhaleFilter = ctx.createBiquadFilter();
    inhaleFilter.type = "bandpass";
    inhaleFilter.Q.setValueAtTime(2.2, now);
    inhaleFilter.frequency.setValueAtTime(800, now);
    inhaleFilter.frequency.exponentialRampToValueAtTime(1900, now + 0.4);

    const inhaleGain = ctx.createGain();
    inhaleGain.gain.setValueAtTime(0.001, now);
    inhaleGain.gain.exponentialRampToValueAtTime(0.38, now + 0.36);
    inhaleGain.gain.linearRampToValueAtTime(0.001, now + 0.42);

    inhaleNoise.connect(inhaleFilter);
    inhaleFilter.connect(inhaleGain);
    inhaleGain.connect(master);
    inhaleNoise.start(now);
    inhaleNoise.stop(now + 0.44);
    registerStop(() => {
      try {
        inhaleNoise.stop();
      } catch {}
    });

    // 1b. Vocalized breathy intake tone ("aaah") with subtle tickle
    const inhaleTone = ctx.createOscillator();
    inhaleTone.type = "triangle";
    inhaleTone.frequency.setValueAtTime(280, now);
    inhaleTone.frequency.linearRampToValueAtTime(420, now + 0.38);

    const inhaleToneGain = ctx.createGain();
    inhaleToneGain.gain.setValueAtTime(0.001, now);
    inhaleToneGain.gain.exponentialRampToValueAtTime(0.22, now + 0.36);
    inhaleToneGain.gain.linearRampToValueAtTime(0.001, now + 0.42);

    inhaleTone.connect(inhaleToneGain);
    inhaleToneGain.connect(master);
    inhaleTone.start(now);
    inhaleTone.stop(now + 0.44);
    registerStop(() => {
      try {
        inhaleTone.stop();
      } catch {}
    });

    // =========================================================
    // 2. THE EXPLOSION: "-CHOO!" (starts at now + 0.46s after pause)
    // =========================================================
    const burstStart = now + 0.46;

    // Trigger visual callback at the exact moment of eruption
    if (onBurst) {
      window.setTimeout(onBurst, 460);
    }

    // 2a. Sharp "CH-" consonant friction burst (high-frequency turbulent noise)
    const chNoise = ctx.createBufferSource();
    chNoise.buffer = noiseBuffer;

    const chFilter = ctx.createBiquadFilter();
    chFilter.type = "bandpass";
    chFilter.Q.setValueAtTime(2.6, burstStart);
    chFilter.frequency.setValueAtTime(3600, burstStart);
    chFilter.frequency.exponentialRampToValueAtTime(2000, burstStart + 0.12);

    const chGain = ctx.createGain();
    chGain.gain.setValueAtTime(0.001, burstStart);
    chGain.gain.linearRampToValueAtTime(0.75, burstStart + 0.015);
    chGain.gain.exponentialRampToValueAtTime(0.001, burstStart + 0.14);

    chNoise.connect(chFilter);
    chFilter.connect(chGain);
    chGain.connect(master);
    chNoise.start(burstStart);
    chNoise.stop(burstStart + 0.16);
    registerStop(() => {
      try {
        chNoise.stop();
      } catch {}
    });

    // 2b. Explosive vocal release ("-OOOU!") - falling vocal pitch & throat formant
    const vocalOsc = ctx.createOscillator();
    vocalOsc.type = "triangle";
    vocalOsc.frequency.setValueAtTime(680, burstStart);
    vocalOsc.frequency.exponentialRampToValueAtTime(170, burstStart + 0.18);

    const vocalFilter = ctx.createBiquadFilter();
    vocalFilter.type = "bandpass";
    vocalFilter.Q.setValueAtTime(1.8, burstStart);
    vocalFilter.frequency.setValueAtTime(820, burstStart);
    vocalFilter.frequency.exponentialRampToValueAtTime(420, burstStart + 0.2);

    const vocalGain = ctx.createGain();
    vocalGain.gain.setValueAtTime(0.001, burstStart);
    vocalGain.gain.linearRampToValueAtTime(0.7, burstStart + 0.02);
    vocalGain.gain.exponentialRampToValueAtTime(0.001, burstStart + 0.22);

    vocalOsc.connect(vocalFilter);
    vocalFilter.connect(vocalGain);
    vocalGain.connect(master);
    vocalOsc.start(burstStart);
    vocalOsc.stop(burstStart + 0.24);
    registerStop(() => {
      try {
        vocalOsc.stop();
      } catch {}
    });

    // 2c. Expelled air blast / wind gust trailing off ("-shhh...")
    const blastNoise = ctx.createBufferSource();
    blastNoise.buffer = noiseBuffer;

    const blastFilter = ctx.createBiquadFilter();
    blastFilter.type = "lowpass";
    blastFilter.frequency.setValueAtTime(2800, burstStart + 0.02);
    blastFilter.frequency.exponentialRampToValueAtTime(750, burstStart + 0.36);

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.001, burstStart);
    blastGain.gain.linearRampToValueAtTime(0.6, burstStart + 0.03);
    blastGain.gain.exponentialRampToValueAtTime(0.001, burstStart + 0.38);

    blastNoise.connect(blastFilter);
    blastFilter.connect(blastGain);
    blastGain.connect(master);
    blastNoise.start(burstStart);
    blastNoise.stop(burstStart + 0.4);
    registerStop(() => {
      try {
        blastNoise.stop();
      } catch {}
    });

    // Register with activeMelodyNodes so stopAllMelodies() silences it immediately
    const stopEntry = {
      stop: () => {
        for (const fn of stopCallbacks) fn();
      },
    };
    this.activeMelodyNodes.push(stopEntry);
    window.setTimeout(() => {
      const idx = this.activeMelodyNodes.indexOf(stopEntry);
      if (idx >= 0) this.activeMelodyNodes.splice(idx, 1);
    }, 1000);
  }

  /** Plays a dreamy soft chime for power nap */
  playNapChime() {
    const ready = this.ensureReady();
    if (!ready) return;
    const { ctx, master } = ready;

    const now = ctx.currentTime;
    [
      { start: 0.0, freq: 659.25 }, // E5
      { start: 0.35, freq: 987.77 }, // B5
    ].forEach((n) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.35, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + 0.65);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now + n.start);
      osc.stop(now + n.start + 0.68);
    });
  }
}

export const Sound = new SoundEngine();
