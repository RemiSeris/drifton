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

## Positionnement

Drifton est une **collection de petits outils autour du son**, pas une application unique :
écouter (musique fonctionnelle), jouer et apprendre (piano, accords), fabriquer (synthé),
plus un coin « Lab » pour les expériences. La cohérence vient du moteur commun (le synthé
maison), du design et de la simplicité, pas d'un public unique. Chaque outil a sa propre
adresse pour être partagé seul.

- Objectif personnel d'abord : explorer des idées. Si un outil devient utile, viser une
  publication publique avec un usage **simple, sans inscription, qui marche en local**.
- Pas de promesse affichée (« gratuit », « sans compte », « aucune donnée ») : un serveur
  (ML) ou des fonctions premium avec compte restent possibles plus tard.
- Pistes notées pour plus tard :
  - **PWA** (manifest + service worker) : installable sur l'écran d'accueil de l'iPad,
    fonctionne hors ligne ;
  - **statistiques d'usage sans cookies** ni données perso (GoatCounter, Cloudflare Web
    Analytics) pour savoir quels outils servent ;
  - **dons** (Ko-fi, GitHub Sponsors, Liberapay) ; éventuellement une fonction payante par
    clé de licence gardée dans le navigateur, seulement si l'usage le justifie.

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
| `index.html` | accueil : outils rangés par intention (Listen : Focus music, Drone · Play & learn : Piano score, Chords bientôt · Make : Synth · Lab : Pad states), une illustration SVG par outil |
| `common.css` | styles partagés (accueil, synth, generator, pads) |
| `player/` | v1, le « Drone player » d'origine : drone génératif simple, presets Focus / Relax / Deep |
| `pads/` | prototype « nappe en 3 états » : crossfade d'exports audio piloté par un conducteur, couche granulaire, modulation d'amplitude. Exploration, a mené aux décisions ci-dessus |
| `synth/` | synthé maison, construit brique par brique (voir étapes) |
| `generator/` | générateur : 4 instruments du synthé joués par des règles. `harmony.js` (modes, accords par empilement de tierces, chaîne de Markov, voice leading), `generator.js` (rôles pad / basse / cloches / texture, ordonnanceur à anticipation), `main.js` (page, piano roll). Réutilise les fichiers de `synth/` |
| `groove/` | « Groove » (Lab) : styles rythmiques (funk, dub, bossa nova, house, afrobeat, boom bap, trip-hop, reggaeton) écrits en grilles de probabilités sur 16 pas, mélangés par un curseur A ↔ B. Batterie synthétisée (`synth/drums.js`), basse et accords sur `generator/harmony.js`. Voir « Groove » plus bas |
| `score/` | lecteur de partition MIDI pour s'entraîner au piano (v1, voir « Autres axes ») |

Organisation de `synth/` (un fichier = une brique, ordre de chargement dans `index.html`) :

| Fichier | Rôle |
|---|---|
| `util.js` | helpers : note MIDI → fréquence, changement de paramètre sans clic |
| `params.js` | liste de tous les paramètres (plage, défaut, affichage) ; l'UI est générée depuis cette liste ; un patch = `{ clé: valeur }` |
| `envelope.js` | enveloppe ADSR appliquée à n'importe quel AudioParam |
| `lfo.js` | LFO : formes classiques + Drift (aléatoire lisse, ne se répète jamais) + S&H |
| `osc.js` | couche d'oscillateur avec unisson (désaccord + stéréo, phase aléatoire) |
| `voice.js` | une note : 2 oscillateurs + bruit → filtre → ampli → trémolo → pan, 2 enveloppes, branchements de la matrice de modulation |
| `reverb.js` | réverbe à convolution partagée : réponse impulsionnelle calculée, pré-délai, coupe-bas, changement de taille en fondu |
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
  - [x] **Réverbe** (`synth/reverb.js`) : une seule salle partagée, sur le `MasterBus` (comme une piste de retour dans Ableton) ; chaque instrument y envoie une part de lui-même (paramètre de patch `fx.reverb`, envoi post-volume). Réponse impulsionnelle calculée (bruit qui décroît de 60 dB sur la durée choisie, de plus en plus sombre, différent à gauche et à droite), pré-délai de 30 ms, coupe-bas à 180 Hz dans la queue. Taille réglable sur la page Focus music (1–12 s), avec fondu enchaîné vers la nouvelle salle.
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

## Autres axes (apprentissage musical)

Pistes à côté de la musique fonctionnelle, qui réutilisent les mêmes briques (synthé pour
le son, `generator/harmony.js` pour la théorie des accords). Chacune serait une case de
la page d'accueil.

### Accords piano / guitare (`chords/`)
- **Explorer** : choisir une fondamentale et un type d'accord (majeur, mineur, 7, maj7, m7,
  sus2, sus4, dim, aug, 9…), le voir sur un clavier et sur un manche de guitare (positions /
  doigtés), l'entendre (plaqué ou arpégé), voir le nom des notes et les intervalles.
- **S'entraîner** :
  - *jouer l'accord demandé* : on clique les notes, ou on les joue sur un vrai clavier
    branché en USB (Web MIDI API), et on vérifie ;
  - *reconnaître à l'oreille* : l'accord est joué, on devine son type (quiz, score,
    difficulté progressive : d'abord majeur / mineur, puis septièmes, renversements…) ;
  - *reconnaître sur le clavier ou le manche* : une position s'affiche, on donne son nom.
- Guitare : accordage standard d'abord, une base de doigtés courants + calcul des
  positions possibles.

### Lecteur de partition MIDI (`score/`)
Usage visé : s'entraîner au piano sur iPad (Safari).

- [x] **v1** : ouvrir un `.mid` (bouton ou glisser-déposer), notes qui tombent vers un
  clavier (couleur par piste / main, touches qui s'allument, numéros de mesure), vitesse
  20–150 %, boucle Start / End calée sur les mesures, voir / entendre chaque piste
  séparément, noms des notes, glisser la vue pour avancer / reculer, toucher = lecture /
  pause, morceau de démo, le dernier fichier est gardé dans le navigateur.
  | Fichier | Rôle |
  |---|---|
  | `midi.js` | lecteur de fichiers MIDI maison : en-tête, pistes, running status, tempo (changements compris), mesures, pédale de sustain, batterie ignorée → `song` (notes en secondes, parties, barres de mesure) |
  | `piano.js` | son léger type piano / clavier (sinus + dent de scie filtrée qui s'assombrit), 48 voix max, limiteur |
  | `player.js` | transport : position, programmation à l'avance sur l'horloge audio, vitesse, boucle sans trou |
  | `roll.js` | vue notes qui tombent + clavier (canvas) |
  | `timeline.js` | barre du morceau entier, toucher pour se déplacer |
  | `demo.js` | « Ode à la joie » (domaine public) pour essayer sans fichier |
  | `main.js` | page : fichiers, boutons, boucle, raccourcis (Espace, ← →, A / B / L) |
- [ ] **v2 : détection au micro** + mode « attendre que je joue la bonne note ». Safari
  sur iPad ne gère pas Web MIDI : le micro est donc la voie principale. Idée : on sait
  déjà quelles notes sont attendues, il suffit de vérifier si elles sonnent (énergie aux
  fréquences attendues et à leurs harmoniques dans le spectre), plus simple que de
  reconnaître n'importe quel accord. Une note seule : détection de hauteur classique
  (autocorrélation / YIN). Accords libres : plus dur (modèle ML type « basic-pitch »).
  Web MIDI en plus pour un clavier branché sur ordinateur (Chrome).
- [ ] Plus tard : une main à la fois avec l'autre jouée par l'ordinateur (déjà possible via
  « Hear »), séparer les mains quand le fichier n'a qu'une piste, métronome, décompte,
  zoom, plage de 88 touches, vue partition classique.
- [ ] **Vue guitare** : notes placées sur le manche / tablature qui défile.
- Design original (pas de copie d'un logiciel existant).

## Groove (`groove/`)

À part de la musique fonctionnelle, volontairement : un rythme marqué attire l'attention,
donc il n'a pas sa place dans Focus music. C'est un jouet du Lab.

- **Un style = une grille lisible** (`groove/styles.js`) : par piste (kick, snare, hat,
  perc, bass, keys), 16 caractères de probabilité (`.` jamais, `1`–`9` 10–90 %, `X`
  toujours) et 16 de vélocité ; la basse a en plus la note à jouer (`R`, `3`, `5`, `7`,
  `8`). Plus : tempo, swing, mesures par accord, mode, longueur des notes, envois réverbe.
  Chaque mesure est tirée de nouveau dans la grille : reconnaissable, jamais identique.
- **Morph** : deux styles A et B, un curseur. Les instruments passent de A à B **un par un,
  sur la mesure**, comme un groupe qui change de groove : hats (15 %), perc (30 %), keys
  (45 %), basse (60 %), puis le cœur kick + snare (80 %). Chaque piste joue toujours la
  grille d'un seul style. Le passage du cœur est annoncé par un roulement de caisse claire
  sur la deuxième moitié de la mesure, pendant lequel le tempo glisse vers celui du nouveau
  style ; petit roulement toutes les 8 mesures. Le style du cœur fixe tempo, swing, durée
  des accords, temps d'écho ; le mode suit le style des accords (keys). Auto morph : 1/16
  par mesure, aller-retour.
  (Première version abandonnée : interpoler les probabilités des deux grilles. À 50 %,
  chaque piste tirait la moitié des coups de chaque style : ni funk ni dub, un flou.)
- **Basse** : notes de l'accord en cours ; dans la dernière mesure d'un accord, une fois sur
  deux, approche chromatique (un demi-ton) vers la fondamentale suivante.
- **Batterie** (`synth/drums.js`) : kick (sinus qui tombe de 160 à 48 Hz + clic), snare
  (bruit en passe-bande + deux triangles), hat façon TR-808 (six carrés désaccordés, filtrés
  vers 7–12 kHz ; ouvert si vélocité forte), perc (clave). Les hats restent secs : en bruit
  blanc et dans la réverbe, ils sonnaient comme une cymbale qui traîne. Un style peut
  changer le son d'une piste (`kit`) : le dub joue sa caisse claire en rimshot (coup de
  bois, sans bruit).
- **Écho** (`synth/echo.js`, premier pas vers le delay de l'étape 3) : écho à bande, temps en
  temps musicaux (croche pointée), répétitions de plus en plus sourdes. L'espace du dub
  passe par l'écho et non par la réverbe : une frappe dans une réverbe de bruit devient un
  souffle, une frappe dans un écho reste une frappe.
- **Jeu en live au clavier, touches tenues** : les gestes durent tant qu'on tient la touche
  et partent au prochain temps (compteur de pas absolu `abs`).
  Espace = roulement qui grossit (plein en 1 mesure, doublé en triples croches à mi-chemin),
  fini au temps suivant le relâché ; B = break tant qu'on tient, la batterie revient sur le
  « un » ; V = filtre DJ (`synth/djfilter.js`, passe-bas sur tout le mix, réverbe comprise,
  qui se ferme en 3 s avec résonance montante) ; N = montée (kick et basse sortent, roulement
  qui grossit sur 2 mesures, filtre qui se ferme) ; relâché = DROP sur le temps suivant,
  qui devient le « un » d'une nouvelle mesure (au plus un temps d'attente) : filtre grand
  ouvert et kick plein. Un appui court (< 0,35 s) verrouille la montée ; un second appui
  la fait tomber. ← → morph d'un instrument par pression ; 1–6 coupes ;
  Entrée lecture. Touches 1–6 reconnues par touche physique ou par caractère (AZERTY).
  Une touche tenue reste allumée dans l'encart ; perte du focus = tout est relâché.
- **Mélodie au clavier** (`groove/melody.js`) : les deux rangées de lettres jouent la gamme
  du morceau (rangée du milieu = 10 notes depuis la fondamentale, rangée du haut = la même
  une octave au-dessus), donc pas de fausse note ; octave sur Z / X comme dans Ableton (W / X en AZERTY ; les
  flèches ↑ ↓ marchent aussi, mais certains navigateurs les gardent pour eux). Touches lues par
  position physique (`e.code`), avec repli sur le caractère selon la disposition détectée
  (langue, `navigator.keyboard.getLayoutMap`, puis ce que tapent les touches). Son « lead »
  (deux scies désaccordées, vibrato), envoyé dans l'écho comme les accords du style. Clavier
  à l'écran : lettre, note, fondamentale entourée, notes de l'accord en cours pointées.
  Les gestes ont déménagé pour libérer les lettres : filtre = V, montée = N (B et Espace
  inchangés).
- **Chant** (`groove/sing.js`) : bouton Sing, le micro écoute (non renvoyé aux enceintes ;
  casque conseillé), détection de hauteur YIN sur un échantillon sur deux toutes les 15 ms
  (< 5 centièmes d'erreur sur sinus, dents de scie et voyelles synthétiques ; rien sur
  silence ni bruit), note recalée sur la gamme et montée dans le registre de la mélodie
  (octave auto gardée tant qu'elle va, ou choisie), jouée par l'instrument de la mélodie.
  Anti-tremblement : hauteur moyennée sur un cycle de vibrato (0,15 s) mais remise à zéro
  à chaque vrai saut (> 0,8 demi-ton), changement de note seulement si la nouvelle est
  nettement plus proche ; réaction ~60 ms. Sur la scène : traînée de la voix brute,
  anneau, comète de la note jouée. Chaque note chantée est notée sur l'horloge du groove
  (`singer.take`, en doubles croches) pour la suite : construire autour d'une boucle
  fredonnée.
- **Instrument de la mélodie** : menu (ou touche M, « , » en AZERTY) avec *Auto* (le son suit
  le style) et 12 instruments faits avec le même petit synthé : piano, piano électrique
  (trémolo), orgue (deux tirettes, effet de cabine tournante), clavinet, synthé, cordes,
  cuivres, flûte (avec souffle), mélodica, marimba, cloches, thérémine. Le nom s'affiche
  sur la scène au changement ; le volume de la mélodie est gardé.
- **Compositeur de mélodie** (`groove/composer.js`) et trois modes (boutons ou touche C) :
  *Free* (on joue), *Guide* (la mélodie est écrite mais muette : ses notes tombent sur la
  scène vers une ligne de jeu avec la lettre à taper, les touches du clavier à l'écran
  s'allument sur les 2 temps qui précèdent puis se remplissent au moment de jouer ; jugement
  ±60 ms Perfect, ±150 ms Good, sinon Miss, compensé de la latence de sortie ; série et
  pourcentage), *Auto* (le lead la joue). Écriture une mesure à l'avance (`groove.onStep`).
  Ce qui la fait tenir avec la musique (v2, mesuré sur rendus hors ligne) :
  temps forts et notes longues = notes de l'accord (100 %) ; notes de passage courtes prises
  dans la pentatonique, jamais un demi-ton au-dessus d'une note de l'accord (notes tenues qui
  frottent : 0 %, contre 7–13 % en v1) ; registre propre, MIDI 66–84, les accords descendus
  sous 67 (notes dans le registre des accords : 0–11 %, contre 36–93 %) ; des silences
  (la mélodie joue 42–68 % du temps) ; rythmes écrits à la main par style (funk : coups
  courts syncopés, dub : notes longues de mélodica à contretemps, bossa : notes liées qui
  balancent) ; phrases A A' B cadence, A' = même rythme et même dessin recalé sur le nouvel
  accord, cadence longue sur la fondamentale. Le son du lead change avec le style
  (funk : pluck façon clavinet, dub : mélodica, bossa : flûte douce).
- **Scène** (`groove/stage.js`) : un canvas qui dessine chaque coup réellement joué, sur
  l'horloge audio (disque sur le kick, anneau sur la snare, étincelles sur les hats, vague
  pour la basse, faisceaux pour les accords) ; rideaux pour le filtre, BREAK, jauge et BUILD,
  flash et secousse au DROP ; une comète par note de mélodie (gauche = grave, droite = aigu,
  elle monte tant que la touche est tenue) ; fond à la couleur du style qui tient le beat, aussi intense
  que le mix.
- Ordonnanceur plus serré que le générateur (25 ms / 150 ms d'avance) pour réagir vite au
  curseur ; avance allongée quand l'onglet est caché.
- **Huit styles** : funk, dub, bossa nova, puis house (kick à chaque temps, clap, charleston
  ouvert et basse sur les contretemps), afrobeat (cloche façon 808, charlestons serrés,
  hachures de guitare sur les doubles croches), boom bap (gros swing, accords longs façon
  piano électrique), trip-hop (lent, beaucoup d'espace, écho), reggaeton (dembow au clap,
  un accord par mesure). Chacun a ses phrases de mélodie et son son de lead. Nouveaux sons
  de batterie : clap et cloche (variantes `kit`).
- Pistes : afrobeat en vrai 12/8 (la grille est en 16 pas), un éditeur de grille à la
  souris, le LLM de l'étape 7b qui bouge le curseur (« plus funky »).

## En ligne

GitHub Pages publie la branche `main` (racine) : https://rooxam.github.io/drifton/ (page d'accueil), puis `/generator/`, `/synth/`, `/player/`, `/pads/`, `/score/`.

## Journal

- **2026-11-18** — Chant au micro : on fredonne, l'instrument joue la note recalée sur la gamme. Prise des notes sur l'horloge du groove, en vue de la boucle fredonnée.

- **2026-11-16** — Choix de l'instrument de la mélodie (12 sons + Auto). Bug corrigé au passage : le synthé du lead modifiait l'objet du patch de base, donc chaque son chargé laissait des traces dans les suivants (copie à la création).

- **2026-11-16** — Cinq nouveaux styles : house, afrobeat, boom bap, trip-hop, reggaeton ; clap et cloche dans la batterie. Mélodie mesurée sur chacun : 0 % de notes tenues qui frottent, 100 % des temps forts sur l'accord.

- **2026-11-15** — Mélodie v2 : la v1 « ne collait pas » (marche au hasard sur les 7 notes, dans le registre des accords, sans silences). Notes de l'accord sur les temps forts, pentatonique sans frottement, registre au-dessus des accords, rythmes par style avec silences, son du lead par style.

- **2026-11-15** — Drop plus direct : il tombait sur le premier temps de la mesure suivante (jusqu'à plus d'une mesure d'attente, geste et effet décrochés) ; il tombe maintenant sur le temps suivant le geste et recommence la mesure. Appui court = montée verrouillée, second appui = drop. Le compositeur compte ses propres mesures et oublie les notes prévues sur l'ancienne grille.

- **2026-11-15** — Compositeur de mélodie : modes Free / Guide (jeu de rythme avec notes qui tombent, touches allumées à l'avance, score) / Auto.

- **2026-11-15** — Octave de la mélodie sur Z / X (W / X en AZERTY) : chez un utilisateur, le navigateur gardait ↑ ↓ pour lui. Clavier écouté en phase de capture sur `window`.

- **2026-11-15** — Mélodie jouable au clavier, calée sur la gamme, avec clavier à l'écran et comètes sur la scène ; filtre et montée passés sur V et N.

- **2026-11-15** — Touches tenues (roulement, break, filtre DJ, montée + drop) et scène visuelle qui réagit à chaque coup joué.

- **2026-11-15** — Clavier live : les touches 1–6 ne réagissaient pas chez un utilisateur AZERTY ; elles sont maintenant aussi reconnues au pavé numérique et par caractère, et les menus rendent le focus.

- **2026-11-15** — Groove jouable en live au clavier (roulement, break, morph pas à pas, coupures), avec un encart des touches qui s'allument à la frappe.

- **2026-11-15** — Morph refait : passage piste par piste sur la mesure au lieu du mélange des probabilités (qui donnait un groove flou et un tempo qui glissait à chaque mesure), roulement avant le changement de batterie, roulement court toutes les 8 mesures.

- **2026-11-15** — Dub : le souffle venait de la caisse claire, seule une fois par mesure à 74 bpm, envoyée dans la réverbe. Rimshot à la place (part au-dessus de 3 kHz : −8,6 → −32,5 dB) et écho à bande (`synth/echo.js`) au lieu de la réverbe. Funk inchangé.

- **2026-11-15** — Batterie du Groove resserrée : hat en bruit blanc (63 % de l'énergie au-dessus de 12 kHz, effet « cymbale ») remplacé par un hat métallique façon 808, centré vers 9 kHz ; snare en passe-bande ; plus de réverbe sur les hats ni le kick ; mixage par piste ; la réverbe partagée coupe les aigus au-dessus de 5 kHz.

- **2026-11-15** — Groove (Lab) : styles rythmiques en grilles de probabilités (funk, dub, bossa nova), morph A ↔ B (tempo compris), batterie synthétisée, basse avec approches chromatiques. Testé par rendu hors ligne de chaque style et d'un morph funk → dub, et dans Chrome (pas d'erreur, contrôles OK).

- **2026-11-15** — Réverbe (premier effet de l'étape 3) : salle partagée sur le `MasterBus`, envoi par instrument (`fx.reverb`, groupe « Effects » du synthé ; Pad 45 %, Bass 10 %, Bells 65 %, Texture 50 %), taille sur la page Focus music. Testée par rendu hors ligne : la queue d'une cloche passe d'environ 3 s à 6–8 s, l'image stéréo s'élargit (corrélation G/D 0,89 → 0,47 sur une phrase), pas de saturation.

- **2026-11-14** — Positionnement : Drifton devient une collection de petits outils autour du son. Accueil refait, rangé par intention, avec des illustrations SVG ; le générateur s'affiche « Focus music ». Notés pour plus tard : PWA, statistiques sans cookies, dons. Lecteur piano : main gauche en pourpre foncé, plus sombre que la droite (graves).

- **2026-11-14** — Lecteur de partition MIDI piano, v1 (`score/`) : lecteur de fichiers MIDI maison, notes qui tombent, vitesse, boucle sur les mesures, mains séparées. Pensé pour l'iPad. v2 notée : détection des notes au micro.

- **2026-11-14** — Deux nouveaux axes notés : entraînement aux accords piano / guitare, et lecteur de partition MIDI qui défile (piano et guitare). La roadmap reste publique pour l'instant.

- **2026-11-14** — Étape 4 : les sons réglés sur le synthé sont enregistrés et joués par le générateur.

- **2026-11-14** — Idée ajoutée : feedback en langage naturel interprété par un LLM (étape 7b), avec la contrainte de rester gratuit (modèle dans le navigateur ou LLM local en priorité).

- **2026-11-14** — Réorganisation : tout le projet est Drifton ; la page d'accueil donne accès aux 4 parties au même niveau (le player d'origine passe dans `player/`, le dossier `lab/` disparaît).

- **2026-11-14** — Prototype `lab/` (nappe en 3 états). Discussion de direction → choix du synthé maison + générateur + apprentissage par feedback. Étapes 1 et 2 du synthé faites (voix, puis LFO / bruit / matrice de modulation, multi-instances), onglets pour 4 instruments, puis première version du générateur (étape 5).

Idées notées pour le générateur : pas encore d'effets, donc le rendu est sec ; le conducteur (étape 6) fera varier densité, longueur d'accords, brillance, mode au fil de la session.
