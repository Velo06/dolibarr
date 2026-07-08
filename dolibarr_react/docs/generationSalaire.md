# Génération de salaires en masse (GenerationSalaire)

Fiche d'implémentation de la fonctionnalité **« Salaire multiple »**
(`src/FO/salaries/GenerationSalaire.jsx` + fonctions de
`src/FO/salaries/salariesService.js`).

---

## 1. Objectif

Créer automatiquement des salaires pour **les périodes NON couvertes** d'un mois
donné, pour un groupe de salariés sélectionnés par filtre.

Autrement dit : pour un salarié, on regarde les salaires déjà créés dans le
mois, on en déduit les « trous » (jours du mois sans salaire), et on crée un
salaire pour chacun de ces trous.

### Saisie de l'utilisateur

| Champ                     | Rôle                                                          |
|---------------------------|---------------------------------------------------------------|
| **Filtre** (poste, genre, heures) | sélectionne rapidement les salariés concernés         |
| **Mois et année**         | le mois à compléter (input `type="month"` → `"YYYY-MM"`)      |
| **Salaire par jour**      | montant d'une journée normale                                 |
| **Pourcentage majoration**| majoration appliquée aux **jours fériés** (ex : 100 %)        |

### Règles de calcul

- Le montant d'un salaire = **nombre de jours de l'intervalle × salaire par jour**.
- Si un jour de l'intervalle est **férié**, le salaire de ce jour est **majoré**
  du pourcentage saisi (100 % → jour compté double).

---

## 2. Vue d'ensemble du flux

```
Filtrer les salariés  →  pour chaque salarié :
   1. récupérer ses salaires du mois              (couples { debut, fin })
   2. calculer les intervalles NON couverts       (getIntervalleNonCompris)
   3. pour chaque intervalle :
        a. calculer le montant (jours fériés majorés)  (calculerSalaireIntervalle)
        b. créer le salaire sur les bornes de l'intervalle (createSalary)
```

Tout se passe dans la fonction `handleGenerate` du composant, qui s'appuie sur
trois fonctions du service.

---

## 3. Les fonctions du service (`salariesService.js`)

### a) `dernierJourDuMois(annee, mois)`

Renvoie le numéro du dernier jour d'un mois (28, 29, 30 ou 31). Gère les années
bissextiles automatiquement grâce à l'astuce du « jour 0 du mois suivant ».

```javascript
export function dernierJourDuMois(annee, mois) {
  return new Date(annee, mois, 0).getDate(); // jour 0 du mois suivant = dernier jour
}
```

> `mois` est ici en base 1 (1 = janvier). `new Date(annee, mois, 0)` pointe donc
> sur le dernier jour du mois `mois`.

### b) `getIntervalleNonCompris(couples, annee, mois)`

**Cœur de la fonctionnalité.** À partir des intervalles déjà couverts par les
salaires existants, calcule les intervalles restant à couvrir sur le mois.

L'idée clé : comme tout se situe dans un **même mois**, on ne manipule pas des
dates complètes mais seulement le **numéro de jour** (1 → dernier jour du mois).
On travaille donc avec des paires `{ d, f }` = `{ jour de début, jour de fin }`.
Cela évite tout problème de fuseau horaire, de mois qui déborde, etc. On ne
reconvertit en vraies `Date` qu'à la toute fin.

Le problème revient à un grand classique : « étant donné un segment `[1, N]` et
des sous-segments occupés, trouver les segments libres ». On le résout en
5 étapes.

Pour illustrer, on suit un exemple : **février 2024** (`N = 29` jours), salarié
ayant déjà des salaires sur **2-15**, **27-29** et **20-21** (volontairement
donnés dans le désordre).

---

#### Étape 0 — les bornes du mois

```javascript
const premierJour = 1;
const dernierJour = dernierJourDuMois(annee, mois); // fév. 2024 → 29
```

On délimite le terrain de jeu : `[1, 29]`. C'est l'intervalle qu'on doit
entièrement « recouvrir », soit par des salaires existants, soit par les
nouveaux qu'on va générer.

#### Étape 1 & 2 — normaliser puis trier les intervalles couverts

```javascript
const couverts = (couples || [])
  .map((c) => ({
    d: Math.max(c.debut.getDate(), premierJour),   // jour de début, borné à 1
    f: Math.min(c.fin.getDate(), dernierJour),      // jour de fin, borné au dernier jour
  }))
  .filter((c) => c.d <= c.f)                        // on jette les intervalles vides
  .sort((a, b) => a.d - b.d);                       // tri par jour de début
```

- `.map(...)` transforme chaque couple `{ debut, fin }` (des `Date`) en une paire
  de **numéros de jour** `{ d, f }`. Le `Math.max` / `Math.min` **borne** au mois :
  si un salaire dépasse le mois, on le tronque à `[1, 29]`.
- `.filter(...)` élimine les intervalles devenus vides après bornage (`d > f`).
- `.sort(...)` **trie par jour de début** : indispensable pour pouvoir balayer
  les intervalles de gauche à droite dans les étapes suivantes.

Sur l'exemple, `couverts` devient :

```
[ {d:2, f:15}, {d:20, f:21}, {d:27, f:29} ]   // remis dans l'ordre
```

#### Étape 3 — fusionner les intervalles qui se chevauchent ou se touchent

```javascript
const fusionnes = [];
for (const c of couverts) {
  const prec = fusionnes[fusionnes.length - 1];   // dernier intervalle déjà retenu
  if (prec && c.d <= prec.f + 1) {
    prec.f = Math.max(prec.f, c.f);               // fusion : on étend la fin
  } else {
    fusionnes.push({ ...c });                     // pas de contact : nouvel intervalle
  }
}
```

On parcourt les intervalles (déjà triés) et on les **fusionne** dès qu'ils se
chevauchent (`13-21` dans `10-20`) ou se **touchent** (jours contigus, ex. `10`
et `11`). La condition `c.d <= prec.f + 1` couvre les deux cas : le `+ 1` fait
que deux intervalles adjacents (`…-10` puis `11-…`) sont considérés comme
collés et fusionnés.

- Cette étape est ce qui rend la fonction **correcte avec plusieurs salaires**
  (y compris qui se chevauchent), et pas seulement avec un seul.

Sur l'exemple, aucun intervalle ne se touche → `fusionnes` = `couverts` :

```
[ {d:2, f:15}, {d:20, f:21}, {d:27, f:29} ]
```

(Si le salarié avait eu `10-20` et `13-21`, ils auraient fusionné en `10-21`.)

#### Étape 4 — déduire les trous (le complément)

```javascript
const trous = [];
let curseur = premierJour;                 // prochain jour encore "libre"
for (const c of fusionnes) {
  if (c.d > curseur) trous.push({ d: curseur, f: c.d - 1 });  // trou AVANT cet intervalle
  curseur = Math.max(curseur, c.f + 1);    // on saute juste après l'intervalle couvert
}
if (curseur <= dernierJour) trous.push({ d: curseur, f: dernierJour }); // trou final
```

C'est le calcul du **complément**. On avance un `curseur` qui représente le
premier jour encore non traité, initialement `1` :

- Pour chaque intervalle couvert `c`, s'il **commence après** le curseur
  (`c.d > curseur`), c'est qu'il y a un trou juste avant : `[curseur, c.d - 1]`.
- Puis on **déplace le curseur** juste après l'intervalle couvert : `c.f + 1`
  (le `Math.max` protège contre un intervalle inclus dans un autre).
- À la fin, s'il reste des jours après le dernier intervalle couvert
  (`curseur <= dernierJour`), c'est le **trou final** `[curseur, dernierJour]`.

Déroulé sur l'exemple :

| Étape                       | `curseur` | Trou détecté   |
|-----------------------------|-----------|----------------|
| début                       | 1         | —              |
| intervalle `2-15` (2 > 1)   | → 16      | `1 → 1`        |
| intervalle `20-21` (20 > 16)| → 22      | `16 → 19`      |
| intervalle `27-29` (27 > 22)| → 30      | `22 → 26`      |
| fin (30 > 29)               | —         | (pas de final) |

→ `trous` = `[ {1,1}, {16,19}, {22,26} ]`.

#### Étape 5 — reconvertir les numéros de jour en vraies dates

```javascript
return trous.map((t) => ({
  debut_intervalle: new Date(annee, mois - 1, t.d),
  fin_intervalle: new Date(annee, mois - 1, t.f),
}));
```

On repasse des numéros de jour aux objets `Date` réels, prêts à être utilisés
par `calculerSalaireIntervalle` et `createSalary`. Attention : le constructeur
`new Date(annee, mois, jour)` attend un **mois 0-indexé**, d'où le `mois - 1`
(le paramètre `mois` de la fonction est en base 1).

Résultat final sur l'exemple : **1er févr.**, **16→19 févr.**, **22→26 févr.**

---

#### Code complet

```javascript
export function getIntervalleNonCompris(couples, annee, mois) {
  const premierJour = 1;
  const dernierJour = dernierJourDuMois(annee, mois);

  // 1-2) Borner au mois + trier par début.
  const couverts = (couples || [])
    .map((c) => ({
      d: Math.max(c.debut.getDate(), premierJour),
      f: Math.min(c.fin.getDate(), dernierJour),
    }))
    .filter((c) => c.d <= c.f)
    .sort((a, b) => a.d - b.d);

  // 3) Fusion des intervalles qui se chevauchent / se touchent (jours contigus).
  const fusionnes = [];
  for (const c of couverts) {
    const prec = fusionnes[fusionnes.length - 1];
    if (prec && c.d <= prec.f + 1) {
      prec.f = Math.max(prec.f, c.f);
    } else {
      fusionnes.push({ ...c });
    }
  }

  // 4) Trous entre [1, dernierJour] et les intervalles couverts.
  const trous = [];
  let curseur = premierJour;
  for (const c of fusionnes) {
    if (c.d > curseur) trous.push({ d: curseur, f: c.d - 1 });
    curseur = Math.max(curseur, c.f + 1);
  }
  if (curseur <= dernierJour) trous.push({ d: curseur, f: dernierJour });

  // 5) Numéros de jour → vraies dates (mois - 1 : Date attend un mois 0-indexé).
  return trous.map((t) => ({
    debut_intervalle: new Date(annee, mois - 1, t.d),
    fin_intervalle: new Date(annee, mois - 1, t.f),
  }));
}
```

(C'est exactement le déroulé tracé étape par étape ci-dessus, qui donnait
`1`, `16-19`, `22-26`.)

Autres cas gérés grâce à ces 5 étapes :
- **Aucun salaire existant** → `couverts` vide → aucun trou intermédiaire, seul
  le trou final s'applique → tout le mois `1 → dernierJour`.
- **Chevauchements** (`10-20` et `13-21`) → fusionnés en `10-21` (étape 3).
- **Mois entièrement couvert** → le curseur atteint `dernierJour + 1` → `trous`
  vide → `[]` (aucun salaire généré).

### b bis) Variante multi-mois : `getIntervalleNonComprisPeriode(couples, debut, fin)`

`getIntervalleNonCompris` raisonne sur le **jour du mois** (`getDate()`, de 1 à
28/31). C'est simple mais cela **ne fonctionne que dans un seul mois** : dès
qu'une période est à cheval sur plusieurs mois (ex. `15/01 → 20/02`), les numéros
de jour « repartent à 1 » au changement de mois et l'algorithme se casse.

La variante ci-dessous lève cette limite en remplaçant le jour du mois par un
**numéro de jour absolu** : un compteur de jours **continu** (indépendant du
mois), obtenu depuis la date. On peut alors comparer et soustraire des jours qui
appartiennent à des mois — voire des années — différents. Le reste de
l'algorithme (bornage → tri → fusion → complément) est **identique**.

#### Conversion date ⇄ numéro de jour absolu

```javascript
/** Date → numéro de jour absolu (continu), basé sur la date LOCALE. */
function jourAbsolu(date) {
  // Date.UTC(y, m, d) donne un timestamp à minuit UTC pour ces composants ;
  // divisé par (ms d'un jour) → un entier qui s'incrémente de 1 par jour,
  // sans coupure au changement de mois/année.
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
}

/** Numéro de jour absolu → Date locale (opération inverse). */
function deJourAbsolu(n) {
  const utc = new Date(n * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}
```

> On passe par `Date.UTC` / `getUTC…` uniquement pour le **calcul** du numéro de
> jour : cela évite qu'un décalage de fuseau ne fasse basculer un jour. Les
> composants d'entrée (`getFullYear/getMonth/getDate`) et de sortie restent en
> heure **locale**, cohérents avec le reste du service.

#### La fonction

Ici on ne passe plus `(annee, mois)` mais directement la **période cible**
`[debut, fin]` (deux `Date`), car elle peut couvrir plusieurs mois.

```javascript
/**
 * Intervalles NON couverts d'une période [debut, fin] quelconque (bornes
 * incluses), pouvant être à cheval sur plusieurs mois/années.
 *
 * @param {Array<{debut: Date, fin: Date}>} couples  intervalles déjà couverts
 * @param {Date} debut  premier jour de la période cible
 * @param {Date} fin    dernier jour de la période cible (inclus)
 * @returns {Array<{debut_intervalle: Date, fin_intervalle: Date}>}
 */
export function getIntervalleNonComprisPeriode(couples, debut, fin) {
  const P = jourAbsolu(debut); // borne basse de la période (en jours absolus)
  const D = jourAbsolu(fin);   // borne haute de la période

  // 1-2) Numéro de jour absolu + bornage à la période + tri.
  const couverts = (couples || [])
    .map((c) => ({
      d: Math.max(jourAbsolu(c.debut), P),
      f: Math.min(jourAbsolu(c.fin), D),
    }))
    .filter((c) => c.d <= c.f)
    .sort((a, b) => a.d - b.d);

  // 3) Fusion des intervalles qui se chevauchent / se touchent (IDENTIQUE).
  const fusionnes = [];
  for (const c of couverts) {
    const prec = fusionnes[fusionnes.length - 1];
    if (prec && c.d <= prec.f + 1) {
      prec.f = Math.max(prec.f, c.f);
    } else {
      fusionnes.push({ ...c });
    }
  }

  // 4) Trous entre la période et les intervalles couverts (IDENTIQUE).
  const trous = [];
  let curseur = P;
  for (const c of fusionnes) {
    if (c.d > curseur) trous.push({ d: curseur, f: c.d - 1 });
    curseur = Math.max(curseur, c.f + 1);
  }
  if (curseur <= D) trous.push({ d: curseur, f: D });

  // 5) Numéros de jour absolus → vraies dates.
  return trous.map((t) => ({
    debut_intervalle: deJourAbsolu(t.d),
    fin_intervalle: deJourAbsolu(t.f),
  }));
}
```

#### Différences avec la version « un seul mois »

| Aspect                | `getIntervalleNonCompris`         | `getIntervalleNonComprisPeriode`        |
|-----------------------|-----------------------------------|------------------------------------------|
| Unité de comptage     | jour du mois (`getDate()`, 1-31)  | jour absolu continu (`jourAbsolu`)       |
| Bornes                | `[1, dernierJourDuMois]`          | `[jourAbsolu(debut), jourAbsolu(fin)]`   |
| Portée                | un seul mois                      | n'importe quelle période (multi-mois)    |
| Algorithme (3-4)      | identique                         | identique                                |

#### Exemple à cheval sur deux mois

Période cible : **15/01/2024 → 10/02/2024**. Salaires déjà couverts :
`20/01 → 28/01` et `05/02 → 07/02`.

```javascript
getIntervalleNonComprisPeriode(
  [
    { debut: new Date(2024, 0, 20), fin: new Date(2024, 0, 28) },
    { debut: new Date(2024, 1, 5),  fin: new Date(2024, 1, 7)  },
  ],
  new Date(2024, 0, 15),
  new Date(2024, 1, 10)
);
```

Résultat (trois trous, dont deux **traversant** le changement de mois) :

| Intervalle non couvert | Dates                     |
|------------------------|---------------------------|
| 1                      | **15/01 → 19/01**         |
| 2                      | **29/01 → 04/02** (à cheval sur janv./févr.) |
| 3                      | **08/02 → 10/02**         |

La version « un seul mois » aurait été incapable de produire l'intervalle
`29/01 → 04/02`, car les jours `29,30,31` (janvier) et `1,2,3,4` (février)
n'auraient pas été comparables entre eux.

> Remarque : `calculerSalaireIntervalle` fonctionne déjà tel quel avec ces
> intervalles multi-mois — elle avance jour par jour avec `setDate(getDate()+1)`,
> qui gère nativement le passage d'un mois à l'autre.

### c) `calculerSalaireIntervalle(debut, fin, salaire_journalier, pourcentage)`

Calcule le montant d'un intervalle en parcourant **jour par jour**. Chaque jour
ajoute le salaire journalier ; un **jour férié** est majoré du pourcentage.

Asynchrone car elle interroge l'API des jours fériés (`checkJourFerie`) une fois
par jour.

```javascript
export async function calculerSalaireIntervalle(debut, fin, salaire_journalier, pourcentage) {
  const journalier = toNumber(salaire_journalier);
  const pct = toNumber(pourcentage);

  let total = 0;
  const courant = new Date(debut);
  courant.setHours(0, 0, 0, 0);
  const stop = new Date(fin);
  stop.setHours(0, 0, 0, 0);

  while (courant <= stop) {                       // bornes incluses
    const annee = courant.getFullYear();
    const mois = courant.getMonth() + 1;          // 1-12 attendu par l'API
    const jour = courant.getDate();

    const estFerie = await checkJourFerie(annee, mois, jour);
    total += estFerie ? journalier * (1 + pct / 100) : journalier;

    courant.setDate(courant.getDate() + 1);       // jour suivant
  }

  return round2(total);
}
```

- `checkJourFerie(annee, mois, jour)` (dans `api/boot.js`) appelle
  `GET /api/jours-feries/{annee}/{mois}/{jour}` et renvoie un **booléen**.
- Jour normal → `+ journalier`. Jour férié → `+ journalier × (1 + pct/100)`
  (avec 100 % → `× 2`).

---

## 4. L'orchestration dans le composant (`handleGenerate`)

```javascript
// Mois / année saisis (input type="month" → "YYYY-MM").
const [anneeSaisie, moisSaisi] = (form.mois || "").split("-").map(Number); // moisSaisi : 1-12

for (const emp of selected) {
  // 1) Salaires existants de CE salarié.
  //    getEmployeDetailById renvoie TOUS les salaires → on filtre sur fk_user.
  const employee = await getEmployeDetailById(emp.id);
  const salairesEmp = (employee.salaries || []).filter(
    (s) => Number(s.fk_user) === Number(emp.id)
  );

  // 2) Couples { debut, fin } dont le mois/année de la date de début = saisi.
  //    datesp / dateep sont des timestamps Unix (secondes) côté Dolibarr.
  const couples = salairesEmp
    .map((s) => ({
      debut: new Date(Number(s.datesp) * 1000),
      fin: new Date(Number(s.dateep) * 1000),
    }))
    .filter(
      (c) =>
        c.debut.getMonth() + 1 === moisSaisi &&
        c.debut.getFullYear() === anneeSaisie
    );

  // 3) Intervalles NON couverts du mois entier.
  const intervalles = getIntervalleNonCompris(couples, anneeSaisie, moisSaisi);

  // 4) Pour chaque intervalle : calcul du montant + création du salaire.
  for (const it of intervalles) {
    try {
      const montant = await calculerSalaireIntervalle(
        it.debut_intervalle,
        it.fin_intervalle,
        form.montant_journalier,
        form.pourcentage
      );

      await createSalary({
        fk_user: emp.id,
        label: BULK_LABEL,
        amount: montant,
        datesp: it.debut_intervalle,   // début de l'intervalle non couvert
        dateep: it.fin_intervalle,     // fin de l'intervalle non couvert
        datev: it.fin_intervalle,
        fk_typepayment: DEFAULT_PAYMENT_TYPE_ID,
      });
      ok++;
    } catch (err) {
      errors.push({ name: emp.fullName, message: err.message || "échec" });
    }
  }
}
```

### Détails importants

- **Deux boucles imbriquées** : la boucle externe parcourt les salariés
  sélectionnés ; la boucle interne parcourt les intervalles non couverts d'un
  salarié.
- **`getEmployeDetailById` renvoie TOUS les salaires** → on filtre impérativement
  sur `fk_user` pour ne garder que ceux du salarié courant.
- **`datesp` / `dateep` sont des timestamps Unix (secondes)** dans la réponse
  brute Dolibarr → conversion en `Date` avec `new Date(Number(s.datesp) * 1000)`.
- **Filtre du mois** : on ne garde que les salaires dont la **date de début**
  tombe dans le mois/année saisi.
- **`try / catch` par intervalle** : un échec de création n'interrompt pas les
  autres ; on accumule `ok` (succès) et `errors` (échecs) pour le récapitulatif.

---

## 5. Détail de calcul (fuseaux horaires)

Point de vigilance corrigé dans le service :

- **`toApiDate(date)`** convertit une `Date` en `"YYYY-MM-DD"` en utilisant les
  composants **locaux** (`getFullYear` / `getMonth` / `getDate`), et **non**
  `toISOString()`. En effet `toISOString()` convertit en UTC : dans un fuseau à
  décalage positif (ex : UTC+3), minuit local devient la veille en UTC, ce qui
  **décalait la date d'un jour** à l'enregistrement.

- Toutes les lectures de jour dans `calculerSalaireIntervalle` et
  `getIntervalleNonCompris` utilisent aussi les getters **locaux** → cohérence
  totale entre le calcul, la détection des jours fériés et l'enregistrement.

---

## 6. Exemple complet de bout en bout

**Scénario** : filtre = *Technicien*, mois = *février 2024*, salaire/jour = *20*,
majoration = *100 %*. Jours fériés en base : **14/02/2024** et **22/02/2024**.

Deux techniciens :

### Rasoabe (femme) — salaires existants : 2-15, 20-21, 27-29

- Intervalles non couverts : `1`, `16-19`, `22-26`.
- Jour **22** = férié → majoré (40 € au lieu de 20 €). Le 14 est déjà couvert.
- Montants : `1` → 20 € ; `16-19` → 80 € ; `22-26` → 4×20 + 40 = **120 €**.
- **Total généré = 220 €**.

### Rajenja (homme) — salaires existants : 10-20, 13-21 (→ fusion 10-21)

- Intervalles non couverts : `1-9`, `22-29`.
- Jour **22** = férié → majoré.
- Montants : `1-9` → 180 € ; `22-29` → 7×20 + 40 = **180 €**.
- **Total généré = 360 €**.

> Si les jours fériés ne sont pas enregistrés en base, `checkJourFerie` renvoie
> toujours `false` : aucune majoration n'est appliquée et chaque total est alors
> inférieur de 20 € (la majoration manquante du 22/02).

---

## 7. Résumé des fonctions

| Fonction                              | Rôle                                                       |
|---------------------------------------|------------------------------------------------------------|
| `dernierJourDuMois(annee, mois)`      | dernier jour du mois (gère les mois de 28/29/30/31 jours)  |
| `getIntervalleNonCompris(couples, annee, mois)` | intervalles non couverts du mois (les « trous ») |
| `calculerSalaireIntervalle(debut, fin, salaire_journalier, pourcentage)` | montant d'un intervalle, jours fériés majorés |
| `getNbrJourEntre(debut, fin)`         | nombre de jours entre deux dates (bornes incluses)         |
| `checkJourFerie(annee, mois, jour)`   | (API) un jour est-il férié ? → booléen                     |
| `createSalary({...})`                 | crée le salaire (mêmes fonction/route que la saisie simple)|
