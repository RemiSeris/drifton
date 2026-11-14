# Drifton — vision, décisions et étapes

Document de référence pour reprendre le projet (ou une session Claude) avec tout le
contexte. À mettre à jour à chaque étape terminée ou décision prise.

## Vision

Drifton est un générateur de **musique fonctionnelle** (focus, relax, sommeil) qui tourne
dans le navigateur, inspiré d'**Endel** et **Brain.fm**.

Objectif lointain : un **flux musical infini qui s'adapte à l'utilisateur**. La musique est
générée par des règles, l'utilisateur donne des 👍/👎 (et des précisions : « trop brillant »,
« trop chargé »…), et le système apprend ce qu'il aime.

Principes de la musique fonctionnelle à respecter :
- **Faible saillance** : assez de variation pour ne pas lasser, jamais assez pour attirer l'attention.
- **Arc de session** : montée, plateau, descente (ex. 5 / 25 / 5 min pour un focus de 35 min).
- **Modulation d'amplitude** façon Brain.fm (~16 Hz pour le focus, plus lent pour la détente).
- **Jamais de répétition à l'identique** (boucles de longueurs premières entre elles, dérive aléatoire lente).

## Décisions prises

| Sujet | Décision | Pourquoi |
|---|---|---|
| Hébergement | GitHub Pages, fichiers statiques | simple, gratuit ; pas de serveur pour l'instant |
| Dépendances | zéro (Web Audio natif) | apprendre comment marchent les briques ; Tone.js reste une référence à lire, pas une dépendance |
| Lancement | doit marcher en double-cliquant le HTML (`file://`) | donc pas de modules ES ni de `fetch`, des `<script>` classiques chargés dans l'ordre |
| Langage | **JS** pour le moteur temps réel et l'UI ; **Python** pour l'atelier hors ligne (prototypes DSP, analyse, entraînement ML) | Python ne peut pas faire d'audio temps réel dans le navigateur ; un modèle entraîné en Python s'exporte vers le web (ONNX Runtime Web / TF.js) |
| Source du son | **synthé maison dans le navigateur** joué par un générateur à base de règles, plutôt que des fichiers audio exportés d'Ableton | un sample est figé ; un synthé garde tous ses paramètres vivants, donc pilotables par le conducteur et par l'apprentissage |
| Wavetables Serum | abandonné | en ambient, le caractère vient surtout du mouvement, des effets, de l'unisson et du filtre, pas de la forme d'onde |
| Samples | en complément seulement (textures, matière granulaire) | utile pour ce qu'un synthé ne sait pas faire |
| ML | plus tard ; d'abord règles + apprentissage simple des préférences (bandit) ; un LLM pour interpréter le feedback écrit (étape 7b), en restant dans le gratuit | la génération audio par ML (MusicGen…) est trop lourde et peu contrôlable pour du temps réel navigateur |
| Plan B si le synthé maison plafonne | RNBO (Max) ou Faust, compilés pour le web | le générateur ne change pas |
| Façon de travailler | Claude construit les briques, on les décortique ensemble | l'utilisateur débute en JS, connaît Python, compose dans Ableton (Serum, Massive) |

## Architecture visée

```
générateur (règles : gamme, accords, motifs, densité)
      │ notes
      ▼
synthé (oscillateurs → filtre → enveloppes → effets)   ◄── conducteur (fait dériver
      │                                                     les paramètres musicaux
      ▼                                                     et sonores, arc de session)
sortie                                                            ▲
                                                                  │
                                    préférences apprises ◄── 👍/👎 + « pourquoi ? »
```

La musique est décrite par un vecteur de paramètres (brillance, densité, harmonie,
mouvement, texture, pulsation, registre, patch…). Chaque feedback est enregistré avec la
valeur de ces paramètres au moment du clic.

## Ce qui existe

| Chemin | Contenu |
|---|---|
| `index.html` | page d'accueil du site : 4 cases au même niveau (Generator, Synth, Drone player, Pad states) |
| `common.css` | styles partagés (accueil, synth, generator, pads) |
| `player/` | v1, le « Drone player » d'origine : drone génératif simple, presets Focus / Relax / Deep |
| `pads/` | prototype « nappe en 3 états » : crossfade d'exports audio piloté par un conducteur, couche granulaire, modulation d'amplitude. Exploration, a mené aux décisions ci-dessus |
| `synth/` | synthé maison, construit brique par brique (voir étapes) |
| `generator/` | générateur : 4 instruments du synthé joués par des règles. `harmony.js` (modes, accords par empilement de tierces, chaîne de Markov, voice leading), `generator.js` (rôles pad / basse / cloches / texture, ordonnanceur à anticipation), `main.js` (page, piano roll). Réutilise les fichiers de `synth/` |

Organisation de `synth/` (un fichier = une brique, ordre de chargement dans `index.html`) :

| Fichier | Rôle |
|---|---|
| `util.js` | helpers : note MIDI → fréquence, changement de paramètre sans clic |
| `params.js` | liste de tous les paramètres (plage, défaut, affichage) ; l'UI est générée depuis cette liste ; un patch = `{ clé: valeur }` |
| `envelope.js` | enveloppe ADSR appliquée à n'importe quel AudioParam |
| `lfo.js` | LFO : formes classiques + Drift (aléatoire lisse, ne se répète jamais) + S&H |
| `osc.js` | couche d'oscillateur avec unisson (désaccord + stéréo, phase aléatoire) |
| `voice.js` | une note : 2 oscillateurs + bruit → filtre → ampli → trémolo → pan, 2 enveloppes, branchements de la matrice de modulation |
| `synth.js` | `Synth` = un instrument (patch, 8 voix, LFO, volume), instanciable plusieurs fois ; notes jouables maintenant ou programmées à un temps `t` ; `MasterBus` commun (limiteur, analyseur) ; buffers de bruit |
| `storage.js` | sauvegarde des sons dans le navigateur, partagée entre les pages ; nettoyage des valeurs importées |
| `patches.js` | sons de départ des 4 instruments (Pad, Bass, Bells, Texture), en différences par rapport aux défauts |
| `keyboard.js` | clavier d'ordinateur (disposition Ableton, positions physiques) + clavier à l'écran, mode Hold |
| `scope.js` | oscilloscope, spectre, dessin des enveloppes |
| `main.js` | assemble le tout : 4 instruments avec onglets (le clavier et les contrôles agissent sur l'instrument sélectionné), construit les contrôles |

## Étapes

### Synthé (`synth/`)
- [x] **1. La voix** : 2 oscillateurs (sinus, triangle, dent de scie, carré) avec unisson, filtre (LP/HP/BP/notch, résonance), enveloppe de filtre, enveloppe d'ampli, polyphonie, clavier, oscilloscope et spectre.
- [x] **2. La modulation** : 2 LFO (sinus, tri, scie, carré, Drift, S&H), matrice de 4 slots (cutoff, pitch, detune d'unisson, volume, pan), source de bruit (blanc, rose, brun). Synth instanciable plusieurs fois + notes programmées dans le temps (prépare la génération).
- [ ] **3. Les effets**, un fichier chacun : saturation (WaveShaper), chorus (delay court modulé), delay (avec feedback), réverbe (convolution puis réseau de delays type Freeverb). Éventuellement phaser.
- [x] **4. Les patchs** : sauvegarde automatique de chaque instrument dans le navigateur (`localStorage`, `synth/storage.js`), lue par le générateur au démarrage et en direct si la page synthé est ouverte dans un autre onglet (événement `storage`) ; Reset = retour au son de départ ; export / import d'un son en fichier JSON (valeurs nettoyées et bornées) ; boutons « Edit » dans le générateur qui ouvrent l'instrument sur la page synthé (`synth/index.html#Bells`).

### Musique
- [x] **5. Générateur** (première version) : plusieurs instruments (`Synth`) en parallèle, chacun avec un rôle (nappe, basse, cloches/notes éparses, texture). Un état harmonique commun (gamme, accord courant, enchaînements par chaîne de Markov) ; chaque rôle choisit ses notes dedans selon ses règles (densité, registre, probabilité) ; un ordonnanceur à anticipation programme les `noteOn/noteOff` à des temps précis.
- [ ] **6. Conducteur** : dérive lente de tous les paramètres, arc de session, modulation d'amplitude (reprendre les idées de `pads/`).

### Adaptation
- [ ] **7. Feedback** : 👍/👎 + boutons « pourquoi ? », enregistrement des paramètres au moment du clic (localStorage), vue « ce que Drifton a appris ».
- [ ] **7b. Feedback en langage naturel** : l'utilisateur écrit ce qu'il aime ou non (« trop brillant », « ça manque de vie », « trop triste »). Un LLM reçoit la phrase + l'état actuel des paramètres + la liste de ce qu'il peut modifier, et répond en JSON imposé par un schéma : des ajustements bornés (plages autorisées, petits pas) + des étiquettes (`trop_brillant`, `trop_chargé`…). Effet immédiat sur la musique ; les étiquettes nourrissent l'apprentissage (étape 8). Peut aussi servir à démarrer une session (« musique pour coder tard le soir »). 👍/👎 restent pour le réflexe rapide, le texte est optionnel (plus tard : dictée vocale). Vient après le conducteur (il faut des paramètres qui bougent).
  - **Contrainte : rester gratuit.** Pistes, de la plus simple à la plus lourde :
    1. un petit modèle qui tourne **dans le navigateur** (WebGPU : WebLLM, transformers.js…) : gratuit, aucun serveur, compatible GitHub Pages ; un modèle de 1 à 3 milliards de paramètres suffit pour transformer une phrase courte en JSON ; inconvénient : un téléchargement de quelques centaines de Mo à quelques Go la première fois ;
    2. un **LLM local** (Ollama…) sur une machine à soi, si le projet est hébergé ailleurs un jour ;
    3. une **API payante en usage très limité** (quelques centimes par mois), avec la clé de l'utilisateur stockée dans son navigateur, ou derrière un relais gratuit (Cloudflare Worker) qui garde la clé.
- [ ] **8. Apprentissage** : le conducteur passe plus de temps dans les zones aimées, tout en continuant à explorer (bandit / échantillonnage de Thompson).
- [ ] **9. Signaux implicites et contextes** : sauts, durée d'écoute, changements de volume ; profils focus / relax / sommeil ; heure de la journée.

### Plus tard
- [ ] Faire converger les pistes en une expérience Drifton unique (le générateur + conducteur + feedback, avec l'interface simple du player).
- [ ] Atelier Python (`tools/` ou `notebooks/`) : prototyper chaque effet en numpy pour le comprendre, puis le porter en JS.
- [ ] Textures et samples personnels (export Ableton) en couche granulaire.
- [ ] Vrai modèle de préférences, éventuellement serveur pour agréger plusieurs utilisateurs.

## En ligne

GitHub Pages publie la branche `main` (racine) : https://rooxam.github.io/drifton/ (page d'accueil), puis `/generator/`, `/synth/`, `/player/`, `/pads/`.

## Journal

- **2026-11-14** — Étape 4 : les sons réglés sur le synthé sont enregistrés et joués par le générateur.

- **2026-11-14** — Idée ajoutée : feedback en langage naturel interprété par un LLM (étape 7b), avec la contrainte de rester gratuit (modèle dans le navigateur ou LLM local en priorité).

- **2026-11-14** — Réorganisation : tout le projet est Drifton ; la page d'accueil donne accès aux 4 parties au même niveau (le player d'origine passe dans `player/`, le dossier `lab/` disparaît).

- **2026-11-14** — Prototype `lab/` (nappe en 3 états). Discussion de direction → choix du synthé maison + générateur + apprentissage par feedback. Étapes 1 et 2 du synthé faites (voix, puis LFO / bruit / matrice de modulation, multi-instances), onglets pour 4 instruments, puis première version du générateur (étape 5).

Idées notées pour le générateur : pas encore d'effets, donc le rendu est sec ; le conducteur (étape 6) fera varier densité, longueur d'accords, brillance, mode au fil de la session.
