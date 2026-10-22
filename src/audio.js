/**
 * Effets sonores synthétisés avec la Web Audio API : aucun fichier audio requis.
 * Le contexte est créé au premier geste utilisateur (contrainte des navigateurs mobiles).
 */
export class Audio {
  constructor(muted = false) {
    this.ctx = null;
    this.master = null;
    this.muted = muted;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.onUnlock?.(this.ctx, this.master);
  }

  suspend() {
    this.ctx?.suspend();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  #tone({ freq = 440, to = freq, type = 'sine', duration = 0.15, volume = 0.3, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  #noise({ duration = 0.2, volume = 0.3, filter = 1200 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(lp).connect(gain).connect(this.master);
    src.start(t);
  }

  bite(combo = 1) {
    const pitch = Math.min(combo, 12) * 40;
    this.#tone({ freq: 320 + pitch, to: 140 + pitch, type: 'square', duration: 0.09, volume: 0.12 });
    this.#noise({ duration: 0.08, volume: 0.2, filter: 900 });
  }

  hurt() {
    this.#tone({ freq: 200, to: 60, type: 'sawtooth', duration: 0.3, volume: 0.25 });
    this.#noise({ duration: 0.2, volume: 0.3, filter: 2000 });
  }

  shoot() {
    this.#tone({ freq: 900, to: 300, type: 'triangle', duration: 0.08, volume: 0.1 });
  }

  aim() {
    this.#tone({ freq: 600, to: 700, type: 'sine', duration: 0.12, volume: 0.05 });
  }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => this.#tone({ freq: f, type: 'triangle', duration: 0.18, volume: 0.15, delay: i * 0.07 }));
  }

  nova() {
    this.#tone({ freq: 120, to: 40, type: 'sine', duration: 0.4, volume: 0.35 });
    this.#noise({ duration: 0.35, volume: 0.2, filter: 600 });
  }

  frenzy() {
    [220, 277, 330, 440].forEach((f, i) => this.#tone({ freq: f, to: f * 2, type: 'sawtooth', duration: 0.25, volume: 0.08, delay: i * 0.05 }));
  }

  bossWarning() {
    [0, 0.45, 0.9].forEach((delay) => this.#tone({ freq: 98, to: 92, type: 'sine', duration: 0.8, volume: 0.35, delay }));
    [0, 0.45, 0.9].forEach((delay) => this.#tone({ freq: 196, to: 190, type: 'triangle', duration: 0.6, volume: 0.1, delay }));
  }

  bossDown() {
    this.#noise({ duration: 0.6, volume: 0.35, filter: 800 });
    [392, 523, 659, 784, 1046].forEach((f, i) => this.#tone({ freq: f, type: 'triangle', duration: 0.3, volume: 0.15, delay: 0.1 + i * 0.08 }));
  }

  revive() {
    [262, 330, 392, 523].forEach((f, i) => this.#tone({ freq: f, to: f * 1.01, type: 'sine', duration: 0.5, volume: 0.15, delay: i * 0.1 }));
  }

  buy() {
    this.#tone({ freq: 660, to: 990, type: 'triangle', duration: 0.15, volume: 0.15 });
  }

  death() {
    this.#tone({ freq: 300, to: 30, type: 'sawtooth', duration: 1.2, volume: 0.25 });
  }
}
