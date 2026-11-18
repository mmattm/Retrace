# Historique pédagogique du sketch

Tous les sketches sont dans `timeline/versions/`. La dernière entrée de `timeline/history.json` est la version active, affichée au démarrage. Il n'y a pas de copie de travail à la racine.

Créer une nouvelle version uniquement si la demande concerne une modification du sketch du projet ou de ses contrôles propres, et que leur code a effectivement changé. Une question, une explication, une modification de la timeline, de l'interface commune, du CSS partagé, de `index.html`, de la documentation ou des outils ne crée aucune sauvegarde si le sketch et ses contrôles restent inchangés. Ne pas créer de sauvegarde initiale lors de travaux sur ces éléments.

1. Copier le sketch de la dernière entrée de `timeline/history.json` et son éventuel `ui.js` dans un dossier temporaire, puis modifier et valider cette copie. Ne pas modifier directement une version existante.
2. Nettoyer le prompt avant de l'enregistrer : corriger l'orthographe, la grammaire, la syntaxe et la ponctuation ; reformuler les tournures orales ou familières pour obtenir un texte clair et soigné. Conserver fidèlement le sens, toutes les consignes, les valeurs et les références techniques, sans ajouter d'intention ni supprimer de détails utiles. Si plusieurs messages ont guidé la même modification, les nettoyer et les conserver dans l'ordre. Écrire ce texte en UTF-8 dans un fichier temporaire.
3. Exécuter `node timeline/save.js --sketch-file /chemin/vers/sketch.js --prompt-file /chemin/vers/prompt.txt` depuis la racine du projet. Le script ajoute le nouveau sketch et l'éventuel `ui.js` voisin dans `timeline/versions/` et inscrit la version à la fin de l'index.
4. Vérifier que la nouvelle version est présente dans `timeline/history.json` et que le prompt nettoyé figure dans l'index et dans le fichier `prompt.txt` de la sauvegarde.

Une seule sauvegarde par demande terminée, après validation du sketch. Les versions précédentes sont immuables : ne pas les corriger, les supprimer ou réécrire leurs dates. Ne pas créer de fausses versions pour remplir la timeline. Si l'utilisateur demande explicitement de ne pas enregistrer une modification, respecter sa demande.

Garder toute la logique d'historique et tous les sketches dans `timeline/`. Le HTML de la timeline est dans `index.html` ; `main.js` importe seulement les styles et le module de timeline. Une interface propre au sketch vit dans son `ui.js` voisin, avec ses contrôles et styles. Ce module exporte `createUI(config)` ; `sketch.js` le charge par `await import('./ui.js')` dans `setup()` et lui transmet `CONFIG`. Les deux fichiers restent ensemble dans chaque version. Une modification demandée des contrôles du sketch fait partie de cette version ; les changements de l'interface commune ne créent aucune version.

# Vérification des résultats

Privilégier les vérifications locales adaptées à la modification : lecture du code, contrôle de syntaxe et vérification des fichiers sauvegardés. Ne pas ouvrir systématiquement Chrome ou un navigateur en mode agent pour analyser les résultats. Réserver cet usage à une demande explicite ou à un problème visuel qui nécessite réellement cette vérification, et limiter les captures et inspections répétées pour économiser les tokens.

# Environnement du projet

Le projet utilise Vite sans configuration particulière, avec JavaScript simple : `npm run dev` suffit. Ne pas générer de dossier `dist/` lors des vérifications. Garder les sketches en mode global p5 ; le module de timeline les charge dans une iframe avec la distribution globale du paquet npm p5. Les bibliothèques sont gérées par npm, avec un fichier de verrouillage. p5.js et Tweakpane sont installés ; ne pas créer de panneau de paramètres sans demande explicite d'interface. Toutes les versions sont repérées par le module de timeline via `import.meta.glob` : préserver ce fonctionnement lors des modifications.
