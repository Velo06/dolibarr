# Fonctionnalité : Import de données (Back Office)

Fichiers :
- `src/BO/import/ImportPage.jsx` — l'écran (sélection, journal)
- `src/BO/import/importService.js` — parsing + orchestration de l'import
- `src/BO/import/ImportPage.css` — styles
- Réutilise : `src/FO/salaries/salariesService.js` (création salarié, photo,
  salaire, paiement)

Route : `/bo/import` (protégé par `BOLayout`). Lié dans le menu BO.

L'import accepte **2 fichiers CSV + 1 ZIP**, dans n'importe quel ordre :
- un CSV **salariés** (`ref_employe, nom, genre, identifiant, mdp, heure_travail_semaine`) ;
- un CSV **salaires** (`ref_salaire, ref_employe, date_debut, date_fin, montant, paiement`) ;
- un ZIP d'**images** dont le **nom = réf. du salarié** (`1.png`, `2.png`…).

Contraintes traitées : noms de fichiers libres, colonnes insensibles à la
casse/accents, **dates dans de nombreux formats**, montants à virgule décimale.

---

## 1. Principe : parsing pur + orchestration

`importService.js` sépare deux familles de fonctions :
- **Fonctions pures** (parsing) : pas d'effet de bord, testables isolément
  (`parseCsv`, `parseFlexibleDate`, `parseAmount`, `parsePaymentField`,
  `classifyCsv`, `readImagesZip`, `mapEmployeeRow`, `mapSalaryRow`,
  `mergeSalaryRows`).
- **Orchestration** (`runImport`) : enchaîne les appels API via `salariesService`.

La page ne fait que : choisir les fichiers → `analyzeFiles` (aperçu) →
`runImport` (écriture + journal).

---

## 2. Parsing CSV robuste

### `parseCsvToMatrix(text)`
Mini-parseur **RFC 4180** écrit à la main (aucune dépendance). Il gère :
- les champs entre guillemets contenant des **virgules** et des **sauts de
  ligne** ;
- les **guillemets échappés** `""` → `"`.

C'est indispensable ici car la colonne `paiement` vaut p.ex.
`"{[""08/03/26"",890]}"` (virgules + guillemets internes).

### `normalizeKey(name)`
Normalise un nom de colonne : minuscules + suppression des accents
(`normalize("NFD")` + retrait des diacritiques) + espaces/tirets → `_`.
→ rend la lecture des colonnes **insensible à la casse et aux accents**.

### `parseCsv(text)` + `field(row, ...candidates)`
`parseCsv` renvoie `{ headers, rows }` (objets indexés par en-têtes normalisés).
`field` lit une valeur en testant plusieurs noms de colonne possibles
(ex: `field(row, "identifiant", "login")`), ce qui tolère des variantes.

---

## 3. Parsing des valeurs

### `parseFlexibleDate(value)` → `"YYYY-MM-DD"`
Parseur de date **tolérant**, dans cet ordre :
1. **ISO** : `2026-03-08`, `2026/3/8` ;
2. **jour/mois/année** (séparateurs `/ - .`) : `08/03/2026`, `8.3.26` — en
   **priorité jour-en-premier** (données européennes) ;
3. **année sur 2 chiffres** : `26 → 2026` (`normalizeYear`) ;
4. **repli** `Date.parse()` : formats textuels (`"March 8, 2026"`).

Renvoie `null` si rien ne correspond (et la ligne est alors signalée).

### `parseAmount(value)` → `number`
Tolère la **virgule décimale** et les espaces de milliers :
- `"677,56"` → `677.56`
- `"1 200,50"` → `1200.5`
- `"1,200.50"` → `1200.5`
La règle : si `,` et `.` coexistent, le **dernier** rencontré est le séparateur
décimal.

### `parsePaymentField(value)` → `[{ date, amount }]`
La colonne `paiement` n'est **pas du JSON valide en l'état** :
`{["08/03/26",480],["08/03/26",300]}`. On remplace les **accolades externes par
des crochets** pour obtenir un tableau JSON valide, puis **`JSON.parse`** :
```
{["08/03/26",480],["08/03/26",300]}  →  [["08/03/26",480],["08/03/26",300]]
```
Chaque paire `["date", montant]` est ensuite passée à `parseFlexibleDate` +
`parseAmount`. Cela gère nativement les **montants décimaux** sous toutes leurs
formes : `100.5`, `"100.5"`, `"100,5"`, `1000`, `"1000"`. En cas de format
inattendu, on retombe sur une extraction par **expression régulière**. → support
natif du **paiement en plusieurs fois**.

### `mapGender(value)` → `"man" | "woman" | ""`
Traduit `homme/femme` (et variantes h/f/m/male…) vers les codes Dolibarr.

---

## 4. Classification & lecture des fichiers

### `classifyCsv(headers)` → `"employees" | "salaries" | "unknown"`
Comme les **noms de fichiers peuvent changer**, on identifie chaque CSV par
son **contenu** :
- `salaries` si présence de `montant`+`paiement` (ou `ref_salaire`) ;
- `employees` si `identifiant`/`login` + `nom`/`ref_employe`.

### `readImagesZip(zipFile)` → `Map<ref, { filename, base64 }>`
Ouvre le ZIP avec **JSZip**, ignore les dossiers et fichiers cachés, ne garde
que les images, et indexe chaque entrée par sa **référence = nom sans
extension** (`1.png` → clé `1`). Le contenu est lu en **base64** (prêt pour
l'upload Dolibarr).

### `mergeSalaryRows(rows)` — fusion des salaires en double
Plusieurs lignes du CSV peuvent décrire **un seul salaire**. Clé d'unicité :
**(`ref_salaire`, `ref_employe`, `date_debut`, `date_fin`)**. Quand des lignes
partagent cette clé, on **somme les montants** et on **concatène tous les
paiements** (qui s'imputent alors sur ce montant total). Appliqué juste après le
mapping : `mergeSalaryRows(rows.map(mapSalaryRow))`.

### `analyzeFiles(files)`
Boucle sur les fichiers : `.zip` → `readImagesZip` ; `.csv` → `parseCsv` +
`classifyCsv` + `mapEmployeeRow` / (`mapSalaryRow` puis `mergeSalaryRows`).
Renvoie `{ employees, salaries, images, warnings }` **sans rien écrire** (aperçu).

---

## 5. Orchestration : `runImport(data, onProgress)`

Trois étapes, **tolérantes aux erreurs** (une ligne en échec n'arrête pas le
reste ; chaque résultat est journalisé via `onProgress`) :

### Étape 1 — Salariés
Pour chaque ligne employé :
- on cherche d'abord par **login** (`findEmployeeByLogin`) — clé naturelle qui
  évite les **doublons** ;
- s'il existe → on **réutilise** son id ; sinon → `createEmployeeAccount`
  (login, mot de passe, nom, genre, heures/semaine, `employee=1`).
- on mémorise `ref_employe → idDolibarr` dans `refToUserId` (utilisé ensuite
  par les photos et les salaires).

### Étape 2 — Photos
Pour chaque image `ref → { filename, base64 }` :
- on retrouve l'id du salarié via `refToUserId[ref]` ;
- `uploadEmployeePhoto` (dépose le fichier dans `documents/users/{id}/photos/`)
  puis `setEmployeePhoto` (renseigne le champ `photo` → avatar affiché).

### Étape 3 — Salaires + paiements
Pour chaque ligne salaire :
- `ref_employe → id` (sinon erreur journalisée) ;
- `createSalary` (montant, période) ;
- pour chaque échéance du champ `paiement` → `addSalaryPayment`
  (**versements multiples** ; **Espèces** + compte bancaire 1 par défaut).

Renvoie `{ refToUserId, log, stats }` où `stats` compte créés / réutilisés /
photos / salaires / versements / erreurs.

---

## 6. L'écran `ImportPage.jsx`

- **Trois champs de fichier distincts** (un `<input type="file">` par fichier) :
  CSV salariés, CSV salaires, ZIP images. Chaque emplacement (`SLOTS`) garde son
  fichier dans l'état `slots`. Le nom des fichiers reste libre : les CSV sont
  classés par leur contenu (`classifyCsv`), les étiquettes ne sont que des
  repères visuels.
- **Un seul bouton « Importer »** : pas d'étape d'analyse séparée. Au clic,
  `handleImport` enchaîne `analyzeFiles(selectedFiles())` (lecture/parsing) puis
  `runImport(...)` (écriture). Les avertissements de lecture (CSV non reconnu,
  fichier manquant…) sont injectés en tête du **journal**.
- **Lancer l'import** → `runImport` avec un **journal en direct** (chaque ligne
  `setLog((prev) => [...prev, msg])`) puis un bandeau de **statistiques**. Les
  lignes du journal sont préfixées en texte (`[OK]`, `[ERREUR]`, `[INFO]`).
- **Case « Ne pas importer les images »** (sous le champ ZIP, décochée par
  défaut) : si cochée, le ZIP est exclu de `selectedFiles()` → l'étape photos
  est sautée (seuls salariés + salaires sont importés).

Les `setState` ont lieu dans des gestionnaires d'événements (pas dans un effet),
donc aucun souci de rendu en cascade.

---

## 7. Pièges Dolibarr rencontrés (et résolus)

- **Photos** : `modulepart='user'` n'accepte pas `ref` via l'API → on passe par
  `subdir = "{id}/photos"`. Le fichier atterrit dans
  `documents/users/{id}/photos/` ; on renseigne ensuite `photo` sur l'utilisateur.
- **Photos invisibles dans Dolibarr (avatar par défaut)** : Dolibarr affiche la
  photo via ses **vignettes** `_small`/`_mini` (`showphoto`), or l'API d'upload
  ne les génère **pas** pour un upload par `subdir` (`addThumbs` n'est appelé que
  si l'objet est chargé, ce qui nécessite `ref`, non supporté pour `user`). On
  **génère donc les vignettes côté navigateur** (canvas, `makeThumbnailBase64`)
  et on les téléverse dans `…/photos/thumbs/{nom}_small.{ext}` et `_mini.{ext}`.
  Sans cela, les listes affichent l'avatar généré automatiquement.
- **`GET /salaries/payments` ignore tout filtre** (`getAllPayments` ne prend ni
  `sqlfilters` ni `fk_salary`) : il renvoie **tous** les paiements. Le service
  `listSalaryPayments` filtre donc **côté client** sur `fk_salary` — sans quoi
  le solde d'un salaire serait faux. (Découvert en testant l'import réel.)
- **Création utilisateur** : le mot de passe se passe via le champ `pass` ; les
  heures via `weeklyhours` ; le genre via `gender` (`man`/`woman`).

---

## 8. Résultat de l'import des fichiers fournis (vérifié en réel)

```
✅ 3 salariés créés : rakoto1 (id6), rasoa1 (id7), rajao1 (id8)
✅ 3 photos associées (1.png→id6, 2.png→id7, 3.png→id8)
✅ 4 salaires créés (890, 780, 500, 677,56 €)
✅ 4 versements (dont le salaire 780 € payé en 2 fois : 480 + 300)
✅ 0 erreur
```

> Idempotence : les **salariés** sont dédoublonnés par login (un ré-import les
> réutilise), mais les **salaires** n'ont pas de clé d'unicité côté API — un
> ré-import recréerait les salaires. À relancer donc avec prudence.
