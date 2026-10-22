# 🧛 Soif de Sang

Jeu d'arcade 2D pour mobile (et desktop) sur le thème des vampires. Aucune dépendance, aucun build : du HTML, du CSS et du JavaScript (modules ES).

## Le jeu

- **Glisse ton doigt** n'importe où pour bouger (joystick flottant). Sur ordinateur : flèches, ZQSD ou WASD.
- **Fonce sur les villageois** pour boire leur sang.
- **Ta jauge de sang se vide sans cesse**, de plus en plus vite. À 0, c'est fini.
- **Chasseurs** 🏹 : ils visent (ligne rouge) puis tirent. Esquive le tir ! On peut aussi les mordre.
- **Inquisiteurs** ✝️ : leur aura dorée brûle. On ne peut les mordre qu'en **frénésie**.
- **Frénésie** : 8 morsures enchaînées rendent invincible, plus rapide et sans perte de sang pendant quelques secondes.
- **Montée de niveau** : choisis 1 pouvoir parmi 3 (nuée de chauves-souris, onde sanguine, vitesse, crocs…).
- **Boss** ☠️ (à 1 min 10, puis toutes les ~1 min 35) : le Grand Chasseur (salves en éventail, charges) et le Grand Inquisiteur (cercles sacrés, renforts). Mords-les entre deux attaques. Chaque victoire rapporte du sang, du score et un pouvoir.
- **La Crypte** 🏛️ : chaque partie rapporte des âmes 👻 à dépenser en améliorations permanentes (sang max, vitesse, XP, relances, familier, résurrection…).
- **Musique d'ambiance** générée en direct, plus intense pendant les boss et la frénésie.
- Les combos multiplient le score. Le record, les âmes et les achats sont sauvegardés localement.

## Lancer en local

```bash
npm install     # uniquement pour les tests
npm start       # http://localhost:8080
```

N'importe quel serveur statique convient (les modules ES ne marchent pas en `file://`).

## Structure

```
index.html, style.css      Page, HUD et écrans (DOM)
src/main.js                Point d'entrée et boucle de jeu
src/config.js              Toutes les valeurs d'équilibrage
src/game.js                Règles, combats, apparition des ennemis, progression
src/renderer.js            Rendu canvas (décor procédural, overlays, joystick)
src/ui.js                  HUD, menus, tutoriel contextuel
src/upgrades.js            Pouvoirs de partie (pour en ajouter un : un objet dans UPGRADES)
src/meta.js                Progression permanente : âmes et Crypte (META_UPGRADES)
src/music.js               Musique générative (séquenceur Web Audio)
src/input.js               Joystick tactile et clavier
src/fx.js / audio.js       Particules et sons synthétisés (Web Audio, aucun fichier)
src/entities/              Joueur, humains, carreaux, boss (bosses.js : ajouter un boss = une classe + BOSS_TYPES)
tests/                     Tests Playwright : parcours complet, équilibrage par bot, formats d'écran
```

## Tests

Avec le serveur lancé (`npm start`) :

```bash
npm test                    # parcours complet sur mobile + équilibrage par bot
node tests/balance.mjs <url> 10 --meta    # équilibrage avec la moitié de la Crypte achetée
node tests/sizes.mjs        # captures sur iPhone SE, Pixel 7 et desktop
```

Les captures sont écrites dans `tests/screenshots/`. Pour utiliser un Chromium déjà installé : `CHROMIUM_PATH=/chemin/vers/chrome`.

## Déploiement

Le jeu est publié par GitHub Pages directement depuis la branche `main` (racine du dépôt) : chaque push sur `main` met le site à jour.

👉 https://billy-claude-mobile.github.io/Web-vampires/
