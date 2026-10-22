/**
 * Musique d'ambiance générative (Web Audio) : aucun fichier audio.
 * Progression en ré mineur (i – VI – iv – V) sur un séquenceur à double-croches,
 * avec trois niveaux d'intensité : 0 menu, 1 partie, 2 boss / frénésie.
 */
const BPM = 84;
const STEP = 60 / BPM / 4; // durée d'une double-croche
const LOOKAHEAD = 0.25;
const VOLUME = 0.55;

// Accords (notes MIDI) : Dm, B♭, Gm, A
const CHORDS = [
  [50, 53, 57, 62],
  [46, 50, 53, 58],
  [43, 46, 50, 55],
  [45, 49, 52, 57],
];
// Motifs d'arpège (index dans l'accord, -1 = silence), un par intensité
const ARP_PATTERNS = [
  [0, -1, -1, -1, 2, -1, -1, -1, 1, -1, -1, -1, 3, -1, -1, -1],
  [0, -1, 2, -1, 3, -1, 2, -1, 1, -1, 2, -1, 3, -1, 1, -1],
  [0, 2, 3, 2, 1, 2, 3, 4, 0, 2, 3, 2, 1, 3, 4, 3],
];

const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

export class Music {
  constructor() {
    this.ctx = null;
    this.out = null;
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  /** Démarre la musique sur le contexte audio débloqué (idempotent). */
  start(ctx, destination) {
    if (this.ctx) return;
    this.ctx = ctx;

    this.out = ctx.createGain();
    this.out.gain.value = VOLUME;
    this.out.connect(destination);

    // Écho sombre pour l'arpège
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1800;
    this.echo.connect(echoFilter).connect(feedback).connect(this.echo);
    echoFilter.connect(this.out);

    this.#createPad();
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.#schedule(), 60);
  }

  setIntensity(level) {
    if (level === this.intensity || !this.ctx) {
      this.intensity = level;
      return;
    }
    this.intensity = level;
    const t = this.ctx.currentTime;
    this.padFilter.frequency.setTargetAtTime([350, 600, 1100][level], t, 0.8);
  }

  // Nappe continue : deux dents de scie désaccordées + filtre passe-bas
  #createPad() {
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 350;
    this.padFilter.Q.value = 2;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.07;
    this.padFilter.connect(this.padGain).connect(this.out);

    this.padOscs = [-7, 7, 0].map((detune, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sawtooth';
      osc.detune.value = detune;
      osc.connect(this.padFilter);
      osc.start();
      return osc;
    });

    // Léger trémolo lent
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.15;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(this.padGain.gain);
    lfo.start();
  }

  #schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.1;
      return;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.#playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (16 * 2 * CHORDS.length);
      this.nextTime += STEP;
    }
  }

  #playStep(step, t) {
    const bar = Math.floor(step / 16);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const s = step % 16;
    const level = this.intensity;

    // Changement d'accord de la nappe toutes les 2 mesures
    if (step % 32 === 0) {
      this.padOscs[0].frequency.setTargetAtTime(midiToFreq(chord[0] - 12), t, 0.3);
      this.padOscs[1].frequency.setTargetAtTime(midiToFreq(chord[2] - 12), t, 0.3);
      this.padOscs[2].frequency.setTargetAtTime(midiToFreq(chord[1]), t, 0.3);
    }

    // Arpège type clavecin
    const idx = ARP_PATTERNS[level][s];
    if (idx >= 0) {
      const note = idx < chord.length ? chord[idx] + 12 : chord[0] + 24;
      this.#pluck(midiToFreq(note), t, level === 2 ? 0.05 : 0.06);
    }

    // Basse sur les temps forts
    if (level >= 1 && (s === 0 || s === 8 || (level === 2 && (s === 4 || s === 12)))) {
      this.#bass(midiToFreq(chord[0] - 24), t);
    }

    // Battement de cœur pendant les boss / la frénésie
    if (level === 2 && (s === 0 || s === 3)) this.#thump(t, s === 0 ? 0.5 : 0.3);
  }

  #pluck(freq, t, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(filter).connect(gain);
    gain.connect(this.out);
    gain.connect(this.echo);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  #bass(freq, t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + STEP * 6);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + STEP * 6 + 0.05);
  }

  #thump(t, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.25);
  }
}
