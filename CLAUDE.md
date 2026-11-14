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
- La page racine `index.html` est le produit Drifton ; `lab/` regroupe les pistes
  d'exploration (page d'accueil `lab/index.html`).
- Ne commiter que sur demande.
