/**
 * Web Audio ile kodla üretilen sesler: dosya yok, her şey osilatör ve gürültüden.
 * Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açtığı için
 * AudioContext ilk unlock() çağrısında oluşturulur.
 */

const MUTE_KEY = "runner.muted";
const BASE_BPM = 132;

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Am – F – C – G, her akor bir ölçü (16 adım)
const PROGRESSION: { root: number; chord: number[] }[] = [
  { root: 45, chord: [0, 3, 7] },
  { root: 41, chord: [0, 4, 7] },
  { root: 48, chord: [0, 4, 7] },
  { root: 43, chord: [0, 4, 7] },
];
const ARP_PATTERN = [0, 1, 2, 1, 2, 1, 0, 1];

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;

  private muted = readMuted();

  // Müzik sıralayıcısı
  private musicOn = false;
  private step = 0;
  private nextStepTime = 0;
  private tempo = 1;
  private schedulerId: number | undefined;

  get isMuted() { return this.muted; }

  /** Kullanıcı etkileşimi içinde çağrılmalı (tuş, dokunma). */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(ctx.destination);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.7;
      this.sfx.connect(this.master);

      this.music = ctx.createGain();
      this.music.gain.value = 0.25;
      this.music.connect(this.master);

      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0"); } catch { /* gizli mod */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  // ---- Efektler ----

  jump() {
    this.tone({ type: "square", from: 280, to: 720, duration: 0.16, volume: 0.25 });
  }

  slide() {
    this.burst({ duration: 0.28, filter: "lowpass", from: 2400, to: 300, volume: 0.5 });
  }

  lane() {
    this.burst({ duration: 0.09, filter: "bandpass", from: 1800, to: 3200, volume: 0.35 });
  }

  coin() {
    // Klasik iki notalı "ding": B5 → E6
    this.tone({ type: "triangle", from: midiToHz(83), duration: 0.07, volume: 0.35 });
    this.tone({ type: "triangle", from: midiToHz(88), duration: 0.22, volume: 0.35, delay: 0.07 });
  }

  powerUp() {
    // Yükselen majör arpej: C6 E6 G6 C7
    [84, 88, 91, 96].forEach((m, i) =>
      this.tone({ type: "square", from: midiToHz(m), duration: 0.09, volume: 0.2, delay: i * 0.055 }));
  }

  powerDown() {
    this.tone({ type: "triangle", from: 660, to: 330, duration: 0.25, volume: 0.25 });
  }

  shieldBreak() {
    this.burst({ duration: 0.3, filter: "highpass", from: 2500, to: 6000, volume: 0.6 });
    this.tone({ type: "square", from: 900, to: 180, duration: 0.3, volume: 0.25 });
  }

  crash() {
    this.burst({ duration: 0.45, filter: "lowpass", from: 3000, to: 120, volume: 0.9 });
    this.tone({ type: "sine", from: 140, to: 35, duration: 0.5, volume: 0.8 });
  }

  // ---- Müzik ----

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.music.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.05);
    // Önden zamanlama (lookahead): setInterval titrek olsa da notalar
    // AudioContext saatine göre tam zamanında çalar.
    this.schedulerId = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (!this.ctx || !this.musicOn) return;
    this.musicOn = false;
    window.clearInterval(this.schedulerId);
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  }

  /** Oyun hızlandıkça müzik temposu da artsın (1 = normal). */
  setTempo(factor: number) {
    this.tempo = Math.min(factor, 1.35);
  }

  private schedule() {
    const ctx = this.ctx!;
    const stepLength = 60 / (BASE_BPM * this.tempo) / 4; // 16'lık nota
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextStepTime, stepLength);
      this.nextStepTime += stepLength;
      this.step = (this.step + 1) % (16 * PROGRESSION.length);
    }
  }

  private playStep(step: number, t: number, len: number) {
    const { root, chord } = PROGRESSION[Math.floor(step / 16)];
    const s = step % 16;
    const out = this.music;

    // Bas: 8'liklerde kök, oktav atlayarak
    if (s % 2 === 0) {
      const note = root + (s % 4 === 2 ? 12 : 0);
      this.tone({ type: "triangle", from: midiToHz(note), duration: len * 1.8, volume: 0.9, at: t, out });
    }
    // Arpej: 16'lıklarda akor notaları, iki oktav yukarıda
    const arpNote = root + 24 + chord[ARP_PATTERN[s % ARP_PATTERN.length]];
    this.tone({ type: "square", from: midiToHz(arpNote), duration: len * 0.8, volume: 0.18, at: t, out });

    // Davul: 1 ve 3. vuruşta kick, ara 8'liklerde hi-hat
    if (s % 8 === 0) this.tone({ type: "sine", from: 150, to: 40, duration: 0.15, volume: 1, at: t, out });
    if (s % 4 === 2) this.burst({ duration: 0.04, filter: "highpass", from: 7000, volume: 0.25, at: t, out });
  }

  // ---- Yapı taşları ----

  private tone(o: {
    type: OscillatorType; from: number; to?: number; duration: number; volume: number;
    delay?: number; at?: number; out?: AudioNode;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (o.at ?? ctx.currentTime) + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
    envelope(gain.gain, t, o.duration, o.volume);
    osc.connect(gain).connect(o.out ?? this.sfx);
    osc.start(t);
    osc.stop(t + o.duration + 0.02);
  }

  private burst(o: {
    duration: number; filter: BiquadFilterType; from: number; to?: number; volume: number;
    at?: number; out?: AudioNode;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = o.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.setValueAtTime(o.from, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
    const gain = ctx.createGain();
    envelope(gain.gain, t, o.duration, o.volume);
    src.connect(filter).connect(gain).connect(o.out ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.duration + 0.02);
  }
}

/** Tık sesi olmasın diye hızlı atak, üstel sönüm. */
function envelope(param: AudioParam, t: number, duration: number, volume: number) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(volume, t + 0.005);
  param.exponentialRampToValueAtTime(0.0001, t + duration);
}

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
