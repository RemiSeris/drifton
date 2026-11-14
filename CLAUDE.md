# Drifton

Lire **`ROADMAP.md`** en début de session : vision, décisions prises, architecture,
étapes et journal. Le mettre à jour quand une étape est terminée ou qu'une décision change.

## Conventions

- Parler en français avec l'utilisateur. Code, commentaires, UI et messages de commit en anglais.
- L'utilisateur débute en JS (il connaît Python, compose dans Ableton) : Claude construit
  les briques, puis on les décortique ensemble. Code court, commenté, un fichier par brique.
- Zéro dépendance, Web Audio natif. Tout doit marcher en double-cliquant le HTML
  (`file://`) : pas de modules ES ni de `fetch`, des `<script>` classiques dans l'ordre.
  Les liens vers une page pointent sur `dossier/index.html`, jamais sur `dossier/`
  (en `file://`, un lien vers un dossier affiche la liste des fichiers).
- Tout le projet est Drifton : une **collection de petits outils autour du son**, cohérents
  (même moteur, même design), chacun utilisable seul avec sa propre adresse.
  `index.html` (racine) est l'accueil, rangé par intention : Listen (`generator/` = « Focus
  music », `player/` = « Drone »), Play & learn (`score/`, bientôt `chords/`), Make
  (`synth/`), Lab (`pads/`). Une illustration SVG plate et arrondie par outil, dans la
  palette du site. Styles partagés dans `common.css`.
- Ne commiter que sur demande.
