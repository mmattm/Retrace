# Time Machine

Projet p5.js avec Vite et JavaScript simple.

```sh
npm install
npm run dev
```

Ouvrir l'adresse indiquée dans le terminal. Vite actualise la page quand les fichiers changent.

- `index.html` : la structure de l'interface.
- `style.css` : la police et l'affichage du canvas.
- `main.js` : trois imports pour charger les styles et la timeline.
- `timeline/timeline.js` et `timeline/timeline.css` : le comportement et le style de la timeline.
- `timeline/history.json` : la liste des versions avec leur date, leur prompt et le chemin du sketch.
- `timeline/versions/` : tous les sketches et leurs prompts, un dossier par version.
- `public/assets/` : images, polices, sons et vidéos, accessibles avec `/assets/nom-du-fichier`.

La dernière version se charge au démarrage. Cliquer sur le compteur `3/3` pour ouvrir ou fermer la timeline, puis glisser sur la ligne ou utiliser les flèches du clavier pour changer de version. Échap replie le panneau. Chaque sketch reste en mode global p5 et s'exécute dans une iframe isolée.

Pour créer une version, copier le sketch indiqué par la dernière entrée de `history.json` et son éventuel `ui.js` dans un même dossier temporaire. Modifier et valider cette copie, puis enregistrer le résultat avec le prompt nettoyé :

```sh
node timeline/save.js --sketch-file /tmp/sketch.js --prompt-file /tmp/prompt.txt
```

Pour un prompt court, remplacer `--prompt-file /tmp/prompt.txt` par `--prompt 'Le prompt nettoyé'`. Le script sauvegarde `sketch.js` et l'éventuel `ui.js` situé à côté, sans modifier les versions précédentes. Il refuse les copies identiques à la dernière. Les changements de la timeline ou de la documentation ne créent aucune version. `AGENTS.md` précise ces règles pour l'assistant.

Les versions des bibliothèques sont fixées dans `package.json` et `package-lock.json`. p5.js et Tweakpane sont installés. Une interface demandée est placée dans `ui.js`, à côté de son `sketch.js` dans le dossier de version. Ce module importe Tweakpane et exporte `createUI(config)`. Le sketch le charge dans `setup()` avec `const { createUI } = await import('./ui.js')`, puis appelle `createUI(CONFIG)`. Aucun panneau de paramètres n'est ajouté sans demande explicite. Pour une autre bibliothèque : `npm install nom-du-paquet`.

Les archives conservent le code et le prompt ; p5.js, les styles et les assets restent partagés entre toutes les versions.
