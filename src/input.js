import { clamp } from './utils.js';

const STICK_RADIUS = 55; // px écran
const DEAD_ZONE = 0.12;

/**
 * Joystick virtuel flottant (touch / souris) + clavier (ZQSD, WASD, flèches).
 * Le joystick apparaît là où le doigt se pose.
 */
export class Input {
  constructor(target) {
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.keys = new Set();
    this.enabled = false;
    this.touchedOnce = false;

    target.addEventListener('pointerdown', (e) => this.#onDown(e));
    target.addEventListener('pointermove', (e) => this.#onMove(e));
    target.addEventListener('pointerup', (e) => this.#onUp(e));
    target.addEventListener('pointercancel', (e) => this.#onUp(e));
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.stick.active = false;
    this.stick.id = null;
    this.keys.clear();
  }

  /** Direction normalisée (longueur ≤ 1). */
  get vector() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('q') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('z') || k.has('w')) y -= 1;
    if (k.has('arrowdown') || k.has('s')) y += 1;

    if (this.stick.active) {
      const dx = (this.stick.x - this.stick.ox) / STICK_RADIUS;
      const dy = (this.stick.y - this.stick.oy) / STICK_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > DEAD_ZONE) {
        const m = clamp(len, 0, 1) / len;
        x += dx * m;
        y += dy * m;
      }
    }

    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  get stickRadius() {
    return STICK_RADIUS;
  }

  #onDown(e) {
    if (!this.enabled || this.stick.active) return;
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    Object.assign(this.stick, { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
    this.touchedOnce = true;
  }

  #onMove(e) {
    if (!this.stick.active || e.pointerId !== this.stick.id) return;
    this.stick.x = e.clientX;
    this.stick.y = e.clientY;
    // Le joystick suit le doigt s'il dépasse le rayon : plus confortable sur mobile.
    const dx = this.stick.x - this.stick.ox;
    const dy = this.stick.y - this.stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS * 1.4) {
      const k = (d - STICK_RADIUS * 1.4) / d;
      this.stick.ox += dx * k;
      this.stick.oy += dy * k;
    }
  }

  #onUp(e) {
    if (e.pointerId !== this.stick.id) return;
    this.stick.active = false;
    this.stick.id = null;
  }
}
