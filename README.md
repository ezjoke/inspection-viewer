# Visualiseur d'inspection

Visualiseur interactif d'un rapport d'inspection de bâtiment. Il fonctionne entièrement dans le navigateur : aucune donnée n'est envoyée à un serveur, tout est enregistré localement (`localStorage`) et peut être exporté dans un seul fichier.

## Utilisation

1. Ouvrir la page (GitHub Pages ou un serveur local, voir ci-dessous).
2. Choisir **Ouvrir l'exemple** (site fictif) ou **Ouvrir un fichier de site** (`*.inspection.json`).
3. Le site reste enregistré dans ce navigateur jusqu'à ce que vous le retiriez.

> L'application utilise des modules ES : il faut l'ouvrir par `http(s)://`, pas en double-cliquant sur `index.html`.
> En local : `python3 tools/serve.py`, puis http://localhost:8765.

## Fonctionnalités

- **Tableau de bord** : tuiles par statut, filtres cumulatifs, recherche, suivi d'avancement (à faire / planifié / terminé), notes.
- **Par zone / par métier** : regroupement des travaux, estimations, impression.
- **Plan du site** : image de plan avec zones cliquables, éditables à la souris.
- **Plan d'étage** : pièces rectangulaires par niveau, assignation des éléments, annuler / rétablir.
- **Site & partage** : export / import d'un fichier de site.

## Partager un site

1. **Site & partage → Télécharger** crée un fichier `*.inspection.json` (les cases permettent d'exclure votre avancement, vos notes et l'image du plan).
2. Déposez-le dans un dossier Google Drive partagé **avec des personnes précises** (évitez « tous ceux qui ont le lien » : le fichier contient tout le rapport).
3. La personne télécharge le fichier et l'ouvre avec **Ouvrir un fichier de site**.

Google Drive n'autorise pas le chargement direct depuis une page web (pas d'en-têtes CORS) : le téléchargement manuel est donc la méthode à utiliser avec Drive.

### Ouvrir par adresse (`?src=`)

Si le fichier est hébergé ailleurs qu'à Drive, sur un serveur qui autorise le CORS (par exemple un Gist ou un fichier brut sur GitHub), on peut l'ouvrir directement par un lien :

```
https://<utilisateur>.github.io/<dépôt>/?src=https%3A%2F%2Fexemple.org%2Fsite.inspection.json
```

Seules les adresses `https://` sont acceptées, le fichier passe par la même validation qu'un fichier local, et un site déjà ouvert n'est remplacé qu'après confirmation. Un lien `?src=` fait charger le fichier d'un tiers : n'ouvrez que des liens de personnes de confiance.

## Format du fichier de site

Voir `js/package.js` (validation) et `demo/demo-site.inspection.json` (exemple). Les fichiers refusés ne modifient jamais le site en cours.

## Préparer un rapport réel (hors dépôt)

Les rapports réels ne doivent **jamais** être ajoutés au dépôt : gardez-les dans `private/` (ignoré par git).

```bash
python3 tools/build_package.py rapport.xlsx --mask-file private/denylist.txt \
    --plan-image private/plan.png --name "Ma maison" --out private/ma-maison.inspection.json
```

Une seule commande, aucun fichier intermédiaire : le rapport est lu et masqué en mémoire. Options : `--layout` (pièces et points du plan), `--expected-items`.

`private/denylist.txt` contient une expression régulière par ligne (adresse, numéro de lot, nom, courriel…). Elle sert à masquer ces valeurs dans l'export et à bloquer les commits qui les contiendraient.

## Tests

```bash
npm install && npx playwright install chromium
npm test
```

## Vérifier avant de publier

```bash
tools/check_no_pii.sh
```

Installez le hook de commit avec `tools/install_hooks.sh`. Le script échoue si un motif de `private/denylist.txt` apparaît dans un fichier suivi, ou si un PDF / tableur / image / fichier de site se trouve hors de `demo/`.
