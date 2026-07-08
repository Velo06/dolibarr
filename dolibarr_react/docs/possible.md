# Fonctionnalités possibles autour des jours fériés

Fiche de référence : ce que l'on peut calculer et proposer à partir des
**jours fériés** (module Back-Office, API Spring Boot `…/api/jours-feries`)
combinés aux **salariés** et **salaires** (API Dolibarr).

---

## 0. Point de départ : le modèle de données

### Ce dont on dispose

| Donnée               | Source                         | Champ                       |
|----------------------|--------------------------------|-----------------------------|
| Jour férié           | Spring Boot `/jours-feries`    | `{ id, libelle, date }`     |
| Salaire mensuel      | Dolibarr `/users`              | `salary` → `monthlySalary`  |
| Heures / semaine     | Dolibarr `/users`              | `weeklyhours` → `weeklyHours` |
| Poste                | Dolibarr `/users`              | `job`                       |
| Salaire (à payer)    | Dolibarr `/salaries`           | `amount`, `datesp`, `dateep`|

> **IMPORTANT — pas de taux horaire stocké.**
> Quand on crée un employé, **on ne saisit AUCUN taux horaire**. On ne connaît
> que le **salaire mensuel** (`monthlySalary`) et les **heures hebdomadaires**
> (`weeklyHours`). Tous les calculs horaire / journalier / hebdomadaire
> ci-dessous sont donc **dérivés** de ces deux valeurs. C'est la clé de toute
> cette page : on ne suppose jamais un taux horaire, on le **reconstruit**.

### Les deux hypothèses de conversion utilisées

1. **Heures mensuelles moyennes** = `weeklyHours × 52 / 12`
   (un mois vaut en moyenne `52/12 ≈ 4,3333` semaines).
   Exemple : 35 h/semaine → `35 × 52 / 12 = 151,67 h/mois` (le fameux 151,67 h).

2. **Jours ouvrés par semaine** = 5 (lundi → vendredi).
   Donc **heures par jour** = `weeklyHours / 5` (7 h/jour pour 35 h/semaine).

Ces deux hypothèses sont regroupées dans des constantes pour rester
modifiables au même endroit.

---

## 1. Base : dériver un taux horaire à partir du mensuel

```javascript
// ── Constantes de conversion (modifiables en un seul endroit) ──
export const WEEKS_PER_MONTH = 52 / 12;   // ≈ 4,3333
export const WORK_DAYS_PER_WEEK = 5;      // lundi → vendredi

// Réutilise les helpers existants de salariesService.js :
//   toNumber(v)  → nombre sûr (0 si invalide)
//   round2(n)    → arrondi monétaire à 2 décimales

/**
 * Heures travaillées par mois (moyenne), dérivées des heures hebdo.
 * 35 h/sem → 151,67 h/mois.
 */
export function monthlyHours(weeklyHours) {
  return toNumber(weeklyHours) * WEEKS_PER_MONTH;
}

/**
 * TAUX HORAIRE reconstruit = salaire mensuel / heures mensuelles.
 * C'est la brique de base : aucun taux n'est stocké, on le calcule.
 * Renvoie 0 si les heures sont inconnues (évite une division par zéro).
 */
export function hourlyRate(monthlySalary, weeklyHours) {
  const heures = monthlyHours(weeklyHours);
  if (heures <= 0) return 0;
  return round2(toNumber(monthlySalary) / heures);
}
```

Exemple : mensuel 1 800 €, 35 h/sem → `1800 / 151,67 = 11,87 €/h`.

---

## 2. Salaire horaire / journalier / hebdomadaire / mensuel / annuel

Tout se déduit du couple `(monthlySalary, weeklyHours)` :

```javascript
/** Salaire par heure (voir §1). */
export function salaireHoraire(monthlySalary, weeklyHours) {
  return hourlyRate(monthlySalary, weeklyHours);
}

/** Salaire d'une journée type = taux horaire × heures/jour. */
export function salaireJournalier(monthlySalary, weeklyHours) {
  const heuresParJour = toNumber(weeklyHours) / WORK_DAYS_PER_WEEK;
  return round2(hourlyRate(monthlySalary, weeklyHours) * heuresParJour);
}

/** Salaire d'une semaine = mensuel × 12 / 52  (équivaut à taux × weeklyHours). */
export function salaireHebdomadaire(monthlySalary) {
  return round2((toNumber(monthlySalary) * 12) / 52);
}

/** Salaire mensuel (valeur brute, pour homogénéité de l'API). */
export function salaireMensuel(monthlySalary) {
  return round2(toNumber(monthlySalary));
}

/** Salaire annuel = mensuel × 12. */
export function salaireAnnuel(monthlySalary) {
  return round2(toNumber(monthlySalary) * 12);
}
```

**Exemple récapitulatif** — mensuel 1 800 €, 35 h/sem :

| Période        | Formule                         | Résultat    |
|----------------|---------------------------------|-------------|
| Horaire        | 1800 / 151,67                   | 11,87 €     |
| Journalier     | 11,87 × 7                       | 83,08 €     |
| Hebdomadaire   | 1800 × 12 / 52                  | 415,38 €    |
| Mensuel        | —                               | 1 800,00 €  |
| Annuel         | 1800 × 12                       | 21 600,00 € |

---

## 3. Les jours fériés dans une période

```javascript
/**
 * Normalise la liste des jours fériés en un Set de chaînes "YYYY-MM-DD",
 * pratique pour un test d'appartenance en O(1).
 * @param {Array<{date:string}>} joursFeries  (retour de getAllJourFeries)
 */
export function ferieSet(joursFeries) {
  return new Set((joursFeries || []).map((j) => j.date));
}

/** true si la date (Date ou "YYYY-MM-DD") tombe un jour férié. */
export function estFerie(date, setFeries) {
  const iso = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  return setFeries.has(iso);
}

/**
 * Compte les jours fériés compris dans [debut, fin] (bornes incluses).
 * @param {string} debut  "YYYY-MM-DD"
 * @param {string} fin    "YYYY-MM-DD"
 */
export function nbFeriesDansPeriode(debut, fin, joursFeries) {
  return (joursFeries || []).filter((j) => j.date >= debut && j.date <= fin).length;
}
```

> La comparaison de chaînes `"YYYY-MM-DD"` fonctionne car ce format est trié
> dans l'ordre chronologique (voir `manipulation_date.md`, §7-g).

### 3.1 Obtenir la LISTE des jours fériés entre deux dates

`nbFeriesDansPeriode` ne donne qu'un nombre. Voici comment récupérer **la liste
détaillée** des jours fériés compris entre deux dates, en gérant **tous les
cas** (années différentes, dates inversées, objets `Date` ou chaînes, bornes
incluses).

```javascript
/**
 * Convertit une date (objet Date OU chaîne) en "YYYY-MM-DD" local.
 * Robuste : accepte déjà "2026-07-05", un Date, ou "" (→ "").
 */
function toIso(date) {
  if (!date) return "";
  if (typeof date === "string") return date.slice(0, 10);   // déjà "YYYY-MM-DD…"
  // Objet Date → on prend les composants LOCAUX (évite le décalage UTC)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Liste les jours fériés compris dans [debut, fin], BORNES INCLUSES, triés
 * par date croissante.
 *
 * Gère automatiquement :
 *   • les deux dates dans la même année ;
 *   • les deux dates sur des ANNÉES DIFFÉRENTES (période à cheval) —
 *     la comparaison de chaînes "YYYY-MM-DD" reste chronologique ;
 *   • les dates données à l'envers (debut > fin) : on les remet dans l'ordre ;
 *   • les entrées Date ou chaîne (via toIso).
 *
 * @param {string|Date} debut
 * @param {string|Date} fin
 * @param {Array<{date:string}>} joursFeries  (retour de getAllJourFeries)
 * @returns {Array} les jours fériés de la période, triés par date
 */
export function listerFeriesEntre(debut, fin, joursFeries) {
  let d1 = toIso(debut);
  let d2 = toIso(fin);
  if (!d1 || !d2) return [];

  // Cas dates inversées : on échange pour toujours avoir d1 <= d2.
  if (d1 > d2) [d1, d2] = [d2, d1];

  return (joursFeries || [])
    .filter((j) => j.date >= d1 && j.date <= d2)   // bornes incluses
    .sort((a, b) => a.date.localeCompare(b.date));  // ordre chronologique
}
```

**Pourquoi ça marche même sur des années différentes ?**
Le filtre compare des chaînes `"YYYY-MM-DD"`. Comme l'année vient en premier,
puis le mois, puis le jour, l'ordre alphabétique **est** l'ordre chronologique.
`"2025-12-25" <= "2026-07-14"` est donc `true` sans aucun traitement spécial.

#### Illustration des cas

Soit la liste stockée :

```javascript
const feries = [
  { id: 1, libelle: "Noël",             date: "2025-12-25" },
  { id: 2, libelle: "Jour de l'an",     date: "2026-01-01" },
  { id: 3, libelle: "Fête du travail",  date: "2026-05-01" },
  { id: 4, libelle: "Fête nationale",   date: "2026-07-14" },
  { id: 5, libelle: "Toussaint",        date: "2026-11-01" },
];
```

| Cas                                   | Appel                                                     | Résultat (libellés)                         |
|---------------------------------------|-----------------------------------------------------------|---------------------------------------------|
| **Même année**                        | `listerFeriesEntre("2026-01-01", "2026-07-31", feries)`   | Jour de l'an, Fête du travail, Fête nationale |
| **Années différentes** (à cheval)     | `listerFeriesEntre("2025-12-01", "2026-02-01", feries)`   | Noël, Jour de l'an                          |
| **Sur plusieurs années**              | `listerFeriesEntre("2025-01-01", "2026-12-31", feries)`   | les 5 (Noël inclus)                         |
| **Dates inversées** (debut > fin)     | `listerFeriesEntre("2026-07-31", "2026-01-01", feries)`   | idem « même année » (remis dans l'ordre)    |
| **Borne = un jour férié**             | `listerFeriesEntre("2026-07-14", "2026-07-14", feries)`   | Fête nationale (bornes incluses)            |
| **Aucun férié dans l'intervalle**     | `listerFeriesEntre("2026-08-01", "2026-10-31", feries)`   | `[]` (liste vide)                           |
| **Objets `Date` en entrée**           | `listerFeriesEntre(new Date(2026,0,1), new Date(2026,11,31), feries)` | les 4 de 2026        |

> Astuce : pour n'avoir que le **nombre**, faites
> `listerFeriesEntre(debut, fin, feries).length` — ce qui rend
> `nbFeriesDansPeriode` (§3) redondant si vous préférez une seule fonction.

#### Variante Spring Boot (Java)

Si le tri/filtre est fait côté backend plutôt que dans React :

```java
public List<JourFerie> feriesEntre(LocalDate debut, LocalDate fin,
                                   List<JourFerie> tous) {
    // Remet les bornes dans l'ordre (gère les dates inversées).
    LocalDate d1 = debut.isAfter(fin) ? fin : debut;
    LocalDate d2 = debut.isAfter(fin) ? debut : fin;

    return tous.stream()
        // date stockée en LocalDate ; !isBefore(d1) && !isAfter(d2) = bornes incluses
        .filter(j -> !j.getDate().isBefore(d1) && !j.getDate().isAfter(d2))
        .sorted(Comparator.comparing(JourFerie::getDate))
        .collect(Collectors.toList());
}
```

Les années différentes sont gérées nativement : `LocalDate.isBefore` / `isAfter`
comparent l'année, puis le mois, puis le jour.

---

## 4. Jours ouvrés d'une période (hors week-ends ET jours fériés)

C'est la fonction pivot pour tout calcul de paie « au réel ».

```javascript
/**
 * Détaille une période en comptant :
 *  - joursTotaux   : tous les jours calendaires
 *  - weekends      : samedis + dimanches
 *  - feries        : jours fériés (hors week-end, pour ne pas compter 2×)
 *  - joursOuvres   : jours réellement travaillables (ni week-end ni férié)
 *
 * @param {string} debut  "YYYY-MM-DD"
 * @param {string} fin    "YYYY-MM-DD" (incluse)
 * @param {Array<{date:string}>} joursFeries
 */
export function analyserPeriode(debut, fin, joursFeries) {
  const setFeries = ferieSet(joursFeries);

  const [ay, am, ad] = debut.split("-").map(Number);
  const [by, bm, bd] = fin.split("-").map(Number);
  const courant = new Date(ay, am - 1, ad);   // minuit LOCAL (évite le décalage UTC)
  const stop = new Date(by, bm - 1, bd);

  let joursTotaux = 0, weekends = 0, feries = 0, joursOuvres = 0;

  while (courant <= stop) {
    joursTotaux++;
    const jour = courant.getDay();                 // 0 = dimanche, 6 = samedi
    const iso = courant.toISOString().slice(0, 10);
    const estWeekend = jour === 0 || jour === 6;

    if (estWeekend) {
      weekends++;
    } else if (setFeries.has(iso)) {
      feries++;                                     // férié tombant un jour de semaine
    } else {
      joursOuvres++;
    }
    courant.setDate(courant.getDate() + 1);
  }

  return { joursTotaux, weekends, feries, joursOuvres };
}
```

---

## 5. Majoration (pourcentage d'augmentation) pour travail un jour férié

Travailler un jour férié est généralement **majoré** (ex. +100 % = jour payé
double). Le pourcentage est un **paramètre** (aucune valeur imposée).

```javascript
/**
 * Montant de la MAJORATION pour une journée fériée travaillée.
 * @param {number} pourcentage  ex: 100 pour +100 % (journée doublée)
 * @returns {number} le supplément (hors salaire de base de la journée)
 */
export function majorationFerie(monthlySalary, weeklyHours, pourcentage) {
  const journalier = salaireJournalier(monthlySalary, weeklyHours);
  return round2(journalier * (toNumber(pourcentage) / 100));
}

/**
 * Salaire TOTAL d'une journée fériée travaillée = base + majoration.
 * +100 % → 2 × le salaire journalier.
 */
export function salaireJourFerieTravaille(monthlySalary, weeklyHours, pourcentage) {
  const journalier = salaireJournalier(monthlySalary, weeklyHours);
  return round2(journalier * (1 + toNumber(pourcentage) / 100));
}

/**
 * Même logique mais à l'HEURE (utile si l'employé ne fait que quelques heures
 * fériées). @param {number} heures  nombre d'heures travaillées le jour férié
 */
export function salaireHeuresFeriees(monthlySalary, weeklyHours, heures, pourcentage) {
  const taux = hourlyRate(monthlySalary, weeklyHours);
  return round2(taux * toNumber(heures) * (1 + toNumber(pourcentage) / 100));
}
```

**Exemple** — mensuel 1 800 €, 35 h/sem, majoration +100 % :
journalier = 83,08 € → majoration = 83,08 € → journée fériée travaillée = **166,16 €**.

---

## 6. Calcul complet du salaire d'une période

On combine tout : jours ouvrés « normaux » + traitement des jours fériés selon
qu'ils sont **chômés** (non travaillés, mais payés) ou **travaillés & majorés**.

```javascript
/**
 * Estime le salaire dû sur une période à partir du mensuel et des heures.
 *
 * @param {Object} employe            salarié normalisé (monthlySalary, weeklyHours)
 * @param {string} debut              "YYYY-MM-DD"
 * @param {string} fin                "YYYY-MM-DD" (incluse)
 * @param {Array}  joursFeries        liste { date } (getAllJourFeries)
 * @param {Object} [opts]
 * @param {boolean} [opts.ferieTravaille=false] les jours fériés sont-ils travaillés ?
 * @param {number}  [opts.pourcentageMajoration=100] majoration si travaillés
 * @returns {Object} détail chiffré de la période
 */
export function estimerSalairePeriode(employe, debut, fin, joursFeries, opts = {}) {
  const { ferieTravaille = false, pourcentageMajoration = 100 } = opts;
  const { monthlySalary, weeklyHours } = employe;

  const p = analyserPeriode(debut, fin, joursFeries);
  const journalier = salaireJournalier(monthlySalary, weeklyHours);

  // Base : les jours ouvrés normaux.
  const baseOuvres = round2(journalier * p.joursOuvres);

  // Jours fériés (hors week-end) :
  //  - chômés  → payés au tarif normal (1 jour chacun)
  //  - travaillés → majorés
  const ferieMontant = ferieTravaille
    ? round2(salaireJourFerieTravaille(monthlySalary, weeklyHours, pourcentageMajoration) * p.feries)
    : round2(journalier * p.feries);

  const total = round2(baseOuvres + ferieMontant);

  return {
    ...p,                                   // joursTotaux, weekends, feries, joursOuvres
    salaireJournalier: journalier,
    baseOuvres,
    ferieMontant,
    ferieTravaille,
    pourcentageMajoration,
    total,
  };
}
```

**Exemple** — juillet 2026, employé 1 800 €/mois à 35 h, avec le 14 juillet férié
travaillé à +100 % :
la fonction renvoie les jours ouvrés × journalier, plus la journée du 14
comptée double, et le `total` prêt à afficher.

---

## 7. Autres fonctionnalités envisageables

Idées réutilisant les briques ci-dessus :

* **Coût d'un jour férié pour l'entreprise** : `salaireJournalier × nb salariés`
  (masse salariale « perdue » un jour chômé payé).
* **Comparateur chômé vs travaillé** : afficher côte à côte le coût si le jour
  férié est chômé et le surcoût s'il est travaillé (via `majorationFerie`).
* **Simulateur de fiche de paie** : sélectionner un salarié + une période,
  appeler `estimerSalairePeriode`, et pré-remplir un salaire Dolibarr
  (`createSalary` avec `amount = total`, `datesp/dateep` = période).
* **Prochain jour férié** : `joursFeries.filter(j => j.date >= aujourdHui).sort()[0]`
  → afficher un compte à rebours (voir `ChronoUnit.DAYS.between` en Java).
* **Jours fériés par mois / par an** : regrouper `joursFeries` par `date.slice(0,7)`
  pour un graphique de répartition annuelle.
* **Contrôle de cohérence** : signaler si `weeklyHours` ou `monthlySalary` sont
  absents (0) — auquel cas les calculs horaire/journalier renvoient 0 et
  l'interface doit prévenir « heures ou salaire non renseignés ».
* **Majoration configurable par l'admin** : stocker le `pourcentageMajoration`
  côté Back-Office pour ne pas le coder en dur.

---

## 8. Récapitulatif des fonctions

| Fonction                        | Rôle                                             |
|---------------------------------|--------------------------------------------------|
| `monthlyHours(h)`               | heures mensuelles moyennes (h × 52/12)           |
| `hourlyRate(mensuel, h)`        | **taux horaire reconstruit** (brique de base)    |
| `salaireHoraire / …Journalier / …Hebdomadaire / …Mensuel / …Annuel` | conversions de salaire |
| `ferieSet(feries)`              | Set des dates fériées "YYYY-MM-DD"               |
| `estFerie(date, set)`           | la date est-elle fériée ?                        |
| `nbFeriesDansPeriode(a, b, f)`  | nombre de fériés dans une période                |
| `listerFeriesEntre(a, b, f)`    | **liste** des fériés entre 2 dates (tous cas)    |
| `analyserPeriode(a, b, f)`      | jours totaux / week-ends / fériés / ouvrés       |
| `majorationFerie(...)`          | supplément d'une journée fériée travaillée       |
| `salaireJourFerieTravaille(...)`| journée fériée travaillée (base + majoration)    |
| `salaireHeuresFeriees(...)`     | majoration à l'heure                             |
| `estimerSalairePeriode(...)`    | **calcul complet** du salaire d'une période      |
