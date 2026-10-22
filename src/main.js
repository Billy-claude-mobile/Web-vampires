import { Audio } from './audio.js';
import { Game, State } from './game.js';
import { Input } from './input.js';
import { Music } from './music.js';
import { Renderer } from './renderer.js';
import { storage } from './storage.js';
import { UI } from './ui.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new Audio(storage.load().muted ?? false);
const music = new Music();
const ui = new UI();
const game = new Game({ input, audio, ui });

// La musique démarre dès que le navigateur autorise l'audio (premier geste).
audio.onUnlock = (ctx, master) => music.start(ctx, master);
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

ui.bind({
  play() {
    audio.unlock();
    game.start();
    ui.startRun();
  },
  pause: () => game.pause(),
  resume() {
    audio.unlock();
    game.resume();
  },
  quit() {
    game.state = State.MENU;
    game.reset();
    ui.showMenu();
  },
  toggleMute() {
    audio.unlock();
    audio.setMuted(!audio.muted);
    storage.save({ muted: audio.muted });
    ui.setMuteIcon(audio.muted);
  },
  buy: () => audio.buy(),
});
ui.setMuteIcon(audio.muted);
ui.showMenu();

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.pause();
    audio.suspend();
  } else {
    audio.unlock();
  }
});

// Accès de débogage pour les tests automatisés (?debug dans l'URL).
if (new URLSearchParams(location.search).has('debug')) window.__game = game;

/** Intensité musicale : 0 menu, 1 partie, 2 boss ou frénésie. */
function musicIntensity() {
  if (game.state === State.MENU || game.state === State.OVER) return 0;
  return game.boss || game.player.inFrenzy ? 2 : 1;
}

let last = performance.now();
function frame(now) {
  // dt plafonné pour éviter les sauts après un onglet en arrière-plan.
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  if (game.state === State.PLAYING) ui.update(game, dt);
  music.setIntensity(musicIntensity());
  renderer.draw(game, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
