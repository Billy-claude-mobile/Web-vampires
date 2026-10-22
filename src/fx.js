import { rand } from './utils.js';

/** Particules, textes flottants, ondes et tremblement de caméra. */
export class Fx {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.shakeTime = 0;
    this.shakePower = 0;
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.shakeTime = 0;
  }

  blood(x, y, count = 14, power = 160) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(power * 0.3, power);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: rand(0.35, 0.8),
        max: 0.8,
        size: rand(2, 4.5),
        color: Math.random() < 0.3 ? '#ff4060' : '#b0102a',
        drag: 3.5,
      });
    }
  }

  sparks(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 140);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.5), max: 0.5, size: rand(1.5, 3), color, drag: 4 });
    }
  }

  text(x, y, text, color = '#fff', size = 16) {
    this.texts.push({ x, y, text, color, size, life: 0.9, max: 0.9 });
  }

  ring(x, y, radius, color, duration = 0.45) {
    this.rings.push({ x, y, radius, color, life: duration, max: duration });
  }

  shake(power, time = 0.25) {
    this.shakePower = Math.max(this.shakePower, power);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  get shakeOffset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    return { x: rand(-1, 1) * this.shakePower, y: rand(-1, 1) * this.shakePower };
  }

  update(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
    }
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 40 * dt;
    }
    for (const r of this.rings) r.life -= dt;
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shakeTime -= dt;
    if (this.shakeTime <= 0) this.shakePower = 0;
  }

  draw(ctx) {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4));
      ctx.font = `900 ${t.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
