import { CONFIG } from './config.js';
import { clamp, hash2 } from './utils.js';

const TILE = 110;

/** Dessine le monde (espace monde) puis les overlays (espace écran). */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.scale = 1;
    this.vignette = null;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    // Même surface de monde visible quel que soit l'écran : équitable entre mobile et desktop.
    this.scale = Math.sqrt((this.width * this.height) / CONFIG.viewArea);

    const g = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.3,
      this.width / 2, this.height / 2, Math.hypot(this.width, this.height) * 0.6,
    );
    g.addColorStop(0, 'rgba(5, 0, 10, 0)');
    g.addColorStop(1, 'rgba(5, 0, 10, 0.85)');
    this.vignette = g;
  }

  /** Demi-dimensions du monde visible. */
  get view() {
    return { hw: this.width / 2 / this.scale, hh: this.height / 2 / this.scale };
  }

  draw(game, time) {
    const { ctx } = this;
    game.view = this.view;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(0, 0, this.width, this.height);

    // ---- Espace monde
    const shake = game.fx.shakeOffset;
    ctx.save();
    ctx.translate(this.width / 2 + shake.x, this.height / 2 + shake.y);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-game.camera.x, -game.camera.y);

    this.#drawGround(game, time);

    for (const z of game.zones) z.draw(ctx);
    for (const h of game.hazards) h.draw(ctx, time);
    for (const h of game.humans) h.drawAim?.(ctx);
    game.boss?.drawTelegraph(ctx, time);

    // Tri par profondeur (y) pour un rendu cohérent.
    const actors = [...game.humans, game.player];
    if (game.boss) actors.push(game.boss);
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw(ctx, time);

    game.player.drawBats(ctx, time);
    for (const b of game.bolts) b.draw(ctx);
    game.fx.draw(ctx);
    ctx.restore();

    // ---- Espace écran
    this.#drawOverlays(game, time);
    this.#drawBossPointer(game, time);
    this.#drawJoystick(game.input);
  }

  #drawGround(game, time) {
    const { ctx } = this;
    const { hw, hh } = this.view;
    const x0 = Math.floor((game.camera.x - hw) / TILE) - 1;
    const x1 = Math.floor((game.camera.x + hw) / TILE) + 1;
    const y0 = Math.floor((game.camera.y - hh) / TILE) - 1;
    const y1 = Math.floor((game.camera.y + hh) / TILE) + 1;

    // Taches de terre / herbe sombre
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash2(tx, ty);
        const cx = tx * TILE + hash2(tx + 7, ty) * TILE;
        const cy = ty * TILE + hash2(tx, ty + 7) * TILE;
        ctx.fillStyle = h < 0.5 ? 'rgba(40, 30, 55, 0.6)' : 'rgba(20, 30, 28, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 30 + h * 50, 20 + h * 30, h * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Décors
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash2(tx * 3 + 1, ty * 5 + 2);
        const cx = tx * TILE + 15 + hash2(tx + 3, ty + 11) * (TILE - 30);
        const cy = ty * TILE + 15 + hash2(tx + 13, ty + 5) * (TILE - 30);
        if (h < 0.1) this.#drawGrave(cx, cy, h);
        else if (h < 0.14) this.#drawCross(cx, cy);
        else if (h < 0.17) this.#drawTree(cx, cy, h);
        else if (h < 0.55) this.#drawGrass(cx, cy, h, time);
      }
    }
  }

  #drawGrave(x, y, h) {
    const { ctx } = this;
    const w = 18 + h * 60;
    const ht = 24 + h * 50;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, w * 0.7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d3849';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - ht, w, ht, [w / 2, w / 2, 2, 2]);
    ctx.fill();
    ctx.fillStyle = '#4f4960';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - ht, w * 0.35, ht, [w / 2, 0, 0, 2]);
    ctx.fill();
    ctx.fillStyle = '#29253a';
    ctx.fillRect(x - 1.5, y - ht * 0.75, 3, ht * 0.4);
    ctx.fillRect(x - w * 0.2, y - ht * 0.65, w * 0.4, 3);
  }

  #drawCross(x, y) {
    const { ctx } = this;
    ctx.fillStyle = '#2f2a3a';
    ctx.fillRect(x - 2.5, y - 30, 5, 30);
    ctx.fillRect(x - 10, y - 24, 20, 5);
  }

  #drawTree(x, y, h) {
    const { ctx } = this;
    ctx.strokeStyle = '#120d18';
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y - 55);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 35);
    ctx.lineTo(x - 18, y - 58 - h * 40);
    ctx.moveTo(x + 3, y - 45);
    ctx.lineTo(x + 22, y - 70);
    ctx.moveTo(x + 3, y - 55);
    ctx.lineTo(x - 4, y - 78);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  #drawGrass(x, y, h, time) {
    const { ctx } = this;
    const sway = Math.sin(time * 1.5 + h * 20) * 1.5;
    ctx.strokeStyle = h < 0.35 ? '#2b3a2e' : '#33284a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      ctx.moveTo(x + i * 3, y);
      ctx.lineTo(x + i * 5 + sway, y - 7 - Math.abs(i) * -2);
    }
    ctx.stroke();
  }

  #drawOverlays(game, time) {
    const { ctx } = this;
    const p = game.player;

    // Lueur de lune
    const moon = ctx.createRadialGradient(this.width * 0.85, -20, 10, this.width * 0.85, -20, this.width * 0.9);
    moon.addColorStop(0, 'rgba(160, 140, 220, 0.18)');
    moon.addColorStop(1, 'rgba(160, 140, 220, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    if (p.inFrenzy) {
      ctx.fillStyle = `rgba(255, 30, 60, ${0.1 + Math.sin(time * 10) * 0.05})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Bords rouges qui pulsent quand le sang manque
    const low = 1 - p.blood / 35;
    if (low > 0 && game.state !== 'menu') {
      const a = clamp(low, 0, 1) * (0.35 + Math.sin(time * 8) * 0.15);
      const g = ctx.createRadialGradient(
        this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.35,
        this.width / 2, this.height / 2, Math.hypot(this.width, this.height) * 0.55,
      );
      g.addColorStop(0, 'rgba(180, 0, 20, 0)');
      g.addColorStop(1, `rgba(180, 0, 20, ${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  /** Flèche en bord d'écran indiquant un boss hors champ. */
  #drawBossPointer(game, time) {
    const b = game.boss;
    if (!b || game.isOnScreen(b, 0)) return;
    const { ctx } = this;
    const a = Math.atan2(b.y - game.camera.y, b.x - game.camera.x);
    const margin = 36;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const k = Math.min((cx - margin) / Math.abs(Math.cos(a) || 1e-6), (cy - margin) / Math.abs(Math.sin(a) || 1e-6));
    ctx.save();
    ctx.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
    ctx.rotate(a);
    ctx.globalAlpha = 0.7 + Math.sin(time * 8) * 0.3;
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  #drawJoystick(input) {
    const s = input.stick;
    if (!s.active) return;
    const { ctx } = this;
    const R = input.stickRadius;
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > R ? R / d : 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 60, 85, 0.6)';
    ctx.beginPath();
    ctx.arc(s.ox + dx * k, s.oy + dy * k, R * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}
