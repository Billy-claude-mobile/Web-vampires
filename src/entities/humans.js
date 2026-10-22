import { CONFIG } from '../config.js';
import { dirTo, pick, rand } from '../utils.js';
import { Entity, drawHumanoid, drawShadow } from './entity.js';

const TUNICS = ['#5b7a3a', '#7a5a3a', '#3a5b7a', '#8a6f3a', '#6a3a5b'];
const HAIRS = ['#3b2414', '#d9b25a', '#6b3a1e', '#2a2a2a', '#a0522d'];
const SKINS = ['#f0c8a0', '#d9a77c', '#b07a52', '#f5d6b8'];

/** Classe commune aux proies : morsables, rapportent du sang, de l'XP et du score. */
export class Human extends Entity {
  constructor(x, y, cfg) {
    super(x, y, cfg.radius);
    this.cfg = cfg;
    this.skin = pick(SKINS);
    this.holy = false;
  }

  /** Les humains « sacrés » (inquisiteurs) ne sont mordables qu'en frénésie. */
  canBeBitten(player) {
    return !this.holy || player.inFrenzy;
  }
}

export class Villager extends Human {
  constructor(x, y) {
    super(x, y, CONFIG.villager);
    this.kind = 'villager';
    this.tunic = pick(TUNICS);
    this.hair = pick(HAIRS);
    this.dir = { x: 0, y: 0 };
    this.wanderTimer = 0;
    this.fleeing = false;
    this.fleeJitter = rand(-0.5, 0.5);
  }

  update(dt, game) {
    const p = game.player;
    const to = dirTo(this, p);
    const cfg = this.cfg;
    this.fleeing = to.d < cfg.fearRadius;

    if (this.fleeing) {
      // Fuite opposée au joueur avec une légère déviation pour éviter les lignes droites.
      const a = Math.atan2(-to.y, -to.x) + this.fleeJitter;
      const s = cfg.fleeSpeed * p.stats.preySlow;
      this.move(Math.cos(a) * s, Math.sin(a) * s, dt);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = rand(1, 3);
        const a = rand(0, Math.PI * 2);
        const idle = Math.random() < 0.3;
        this.dir = idle ? { x: 0, y: 0 } : { x: Math.cos(a), y: Math.sin(a) };
        this.fleeJitter = rand(-0.6, 0.6);
      }
      this.move(this.dir.x * cfg.wanderSpeed, this.dir.y * cfg.wanderSpeed, dt);
    }
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    drawShadow(ctx, this.radius);
    ctx.scale(this.facing, 1);
    const hy = drawHumanoid(ctx, { r: this.radius, bob: this.walkT, body: this.tunic, skin: this.skin, hair: this.hair, scared: this.fleeing });
    ctx.restore();
    if (this.fleeing) {
      ctx.fillStyle = '#ffe14d';
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', this.x, this.y + hy - 12 + Math.sin(time * 20) * 1.5);
    }
  }
}

export class Hunter extends Human {
  constructor(x, y) {
    super(x, y, CONFIG.hunter);
    this.kind = 'hunter';
    this.reload = rand(1, 2);
    this.aiming = 0;
    this.aimAngle = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1, 3);
  }

  update(dt, game) {
    const p = game.player;
    const cfg = this.cfg;
    const to = dirTo(this, p);

    if (this.aiming > 0) {
      this.aiming -= dt;
      this.facing = Math.cos(this.aimAngle) >= 0 ? 1 : -1;
      if (this.aiming <= 0) {
        game.spawnBolt(this.x, this.y - this.radius, this.aimAngle);
        this.reload = rand(cfg.reloadMin, cfg.reloadMax) / game.threat.fireRate;
      }
      return;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafe *= -1;
      this.strafeTimer = rand(1.5, 3);
    }

    let mx = 0;
    let my = 0;
    if (to.d > cfg.rangeMax) {
      mx = to.x;
      my = to.y;
    } else if (to.d < cfg.rangeMin) {
      mx = -to.x;
      my = -to.y;
    } else {
      mx = -to.y * this.strafe * 0.6;
      my = to.x * this.strafe * 0.6;
    }
    const speed = cfg.speed * game.threat.speed;
    this.move(mx * speed, my * speed, dt);

    this.reload -= dt;
    // Ne tire que s'il est visible à l'écran : chaque tir doit être esquivable.
    if (this.reload <= 0 && game.isOnScreen(this, 20)) {
      this.aiming = cfg.aimTime;
      this.aimAngle = Math.atan2(p.y - p.radius - (this.y - this.radius), p.x - (this.x));
      game.audio.aim();
    }
  }

  drawAim(ctx) {
    if (this.aiming <= 0) return;
    const k = 1 - this.aiming / this.cfg.aimTime;
    const len = 900;
    const sx = this.x;
    const sy = this.y - this.radius;
    ctx.strokeStyle = `rgba(255, 40, 60, ${0.25 + k * 0.6})`;
    ctx.lineWidth = 1 + k * 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(this.aimAngle) * len, sy + Math.sin(this.aimAngle) * len);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  draw(ctx) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    drawShadow(ctx, r);
    ctx.scale(this.facing, 1);
    const hy = drawHumanoid(ctx, { r, bob: this.walkT, body: '#5a3b22', skin: this.skin, hair: null, legs: '#2b1d12' });
    // Chapeau à large bord
    ctx.fillStyle = '#231710';
    ctx.beginPath();
    ctx.ellipse(0, hy - r * 0.35, r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-r * 0.5, hy - r * 0.95, r * 1.0, r * 0.6);
    ctx.fillStyle = '#8a1a1a';
    ctx.fillRect(-r * 0.5, hy - r * 0.5, r * 1.0, r * 0.12);
    // Arbalète
    ctx.strokeStyle = '#c9a36b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r * 0.3);
    ctx.lineTo(r * 1.3, -r * 0.3);
    ctx.moveTo(r * 1.1, -r * 0.9);
    ctx.quadraticCurveTo(r * 1.5, -r * 0.3, r * 1.1, r * 0.3);
    ctx.stroke();
    ctx.restore();
  }
}

export class Inquisitor extends Human {
  constructor(x, y, elapsed) {
    super(x, y, CONFIG.inquisitor);
    this.kind = 'inquisitor';
    this.holy = true;
    this.speed = CONFIG.inquisitor.speed + elapsed * CONFIG.inquisitor.speedGrowth;
    this.stun = 0;
  }

  update(dt, game) {
    this.stun = Math.max(0, this.stun - dt);
    if (this.stun > 0) return;
    const p = game.player;
    const to = dirTo(this, p);
    // En frénésie, les inquisiteurs prennent peur et fuient.
    const sign = p.inFrenzy ? -0.7 : 1;
    const speed = this.speed * game.threat.speed * sign;
    this.move(to.x * speed, to.y * speed, dt);
  }

  draw(ctx, time) {
    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);

    // Aura sacrée : signal visuel « danger »
    const pulse = 1 + Math.sin(time * 5) * 0.08;
    const g = ctx.createRadialGradient(0, -r, 4, 0, -r, r * 2.6 * pulse);
    g.addColorStop(0, 'rgba(255, 215, 110, 0.45)');
    g.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -r, r * 2.6 * pulse, 0, Math.PI * 2);
    ctx.fill();

    drawShadow(ctx, r);
    ctx.scale(this.facing, 1);
    const hy = drawHumanoid(ctx, { r, bob: this.walkT, body: '#e8e0cf', skin: this.skin, hair: null, legs: '#c9bfa8' });
    // Capuche
    ctx.fillStyle = '#d8ccb0';
    ctx.beginPath();
    ctx.arc(0, hy - r * 0.05, r * 0.72, Math.PI, Math.PI * 2);
    ctx.fill();
    // Croix dorée
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-r * 0.09, -r * 0.6, r * 0.18, r * 0.75);
    ctx.fillRect(-r * 0.3, -r * 0.42, r * 0.6, r * 0.16);
    ctx.restore();

    if (this.stun > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', this.x + Math.cos(time * 8) * 10, this.y - r * 3);
    }
  }
}

/** Carreau d'arbalète. */
export class Bolt {
  constructor(x, y, angle) {
    const s = CONFIG.hunter.boltSpeed;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * s;
    this.vy = Math.sin(angle) * s;
    this.angle = angle;
    this.life = 2.5;
    this.dead = false;
    this.radius = 4;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-6, 0);
    ctx.stroke();
    ctx.strokeStyle = '#d8c3a0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
    ctx.fillStyle = '#e8e8f0';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(6, -3.5);
    ctx.lineTo(6, 3.5);
    ctx.fill();
    ctx.restore();
  }
}
