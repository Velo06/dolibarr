# Suite possible — fonctionnalités autour de la génération de salaires

Idées de fonctionnalités qui prolongent la **génération de salaires en masse**
(voir `generationSalaire.md`), chacune avec les **fonctions nécessaires**.

Elles réutilisent les briques déjà en place :
`getIntervalleNonCompris`, `calculerSalaireIntervalle`, `checkJourFerie`,
`getAllJourFeries`, `createSalary`, `listSalaries`, `deleteSalary`, et les
helpers `toNumber` / `round2`.

---

## 1. Prévisualisation avant génération (dry-run)

**Problème** : aujourd'hui la génération crée directement les salaires.
L'utilisateur devrait pouvoir **voir ce qui sera créé** (intervalles, nombre de
jours, montants, jours fériés) **avant** de valider.

**Fonction** — calcule tout **sans rien créer** :

```javascript
/**
 * Prévisualise la génération pour UN salarié : les intervalles non couverts
 * du mois et le montant calculé pour chacun, sans créer de salaire.
 *
 * @returns {Promise<{intervalles: Array, totalJours: number, totalMontant: number}>}
 */
export async function previsualiserGeneration(couples, annee, mois, salaireJournalier, pourcentage) {
  const intervalles = getIntervalleNonCompris(couples, annee, mois);

  const lignes = [];
  for (const it of intervalles) {
    const nbJours = getNbrJourEntre(it.debut_intervalle, it.fin_intervalle);
    const montant = await calculerSalaireIntervalle(
      it.debut_intervalle, it.fin_intervalle, salaireJournalier, pourcentage
    );
    lignes.push({ ...it, nbJours, montant });
  }

  return {
    intervalles: lignes,
    totalJours: lignes.reduce((s, l) => s + l.nbJours, 0),
    totalMontant: round2(lignes.reduce((s, l) => s + l.montant, 0)),
  };
}
```

Dans l'UI : afficher un tableau récapitulatif, puis un bouton « Confirmer » qui
lance réellement les `createSalary`.

---

## 2. Optimisation : charger les jours fériés une seule fois

**Problème** : `calculerSalaireIntervalle` appelle `checkJourFerie` **une fois
par jour** → pour un mois entier, ~30 requêtes réseau par salarié. Coûteux et
lent en génération de masse.

**Solution** : charger **tous** les jours fériés une fois, les mettre dans un
`Set`, puis tester localement (O(1), aucune requête par jour).

**Fonctions** :

```javascript
import { getAllJourFeries } from "../../api/boot";

/**
 * Charge tous les jours fériés et renvoie un Set de dates "YYYY-MM-DD"
 * pour un test d'appartenance instantané.
 */
export async function chargerFeriesSet() {
  const feries = await getAllJourFeries();      // [{ id, libelle, date }]
  return new Set((feries || []).map((f) => f.date));
}

/** Formate une Date locale en "YYYY-MM-DD" (clé du Set). */
function cleJour(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Version SYNCHRONE de calculerSalaireIntervalle : aucune requête réseau,
 * on teste chaque jour contre le Set des fériés pré-chargé.
 */
export function calculerSalaireIntervalleLocal(debut, fin, salaire_journalier, pourcentage, setFeries) {
  const journalier = toNumber(salaire_journalier);
  const pct = toNumber(pourcentage);

  let total = 0;
  const courant = new Date(debut); courant.setHours(0, 0, 0, 0);
  const stop = new Date(fin);      stop.setHours(0, 0, 0, 0);

  while (courant <= stop) {
    const estFerie = setFeries.has(cleJour(courant));
    total += estFerie ? journalier * (1 + pct / 100) : journalier;
    courant.setDate(courant.getDate() + 1);
  }
  return round2(total);
}
```

Usage : `const feries = await chargerFeriesSet();` **une fois** au début de
`handleGenerate`, puis `calculerSalaireIntervalleLocal(..., feries)` dans la
boucle → passage de *N×jours* requêtes à **1 seule**.

---

## 3. Détail par jour (base vs majoration)

**Problème** : le montant est une boîte noire. On veut le **décomposer** :
combien de jours normaux, combien de jours fériés, la part de majoration.

**Fonction** :

```javascript
/**
 * Détaille un intervalle : jours normaux, jours fériés, montants séparés.
 * @param {Set<string>} setFeries  dates fériées "YYYY-MM-DD" (voir chargerFeriesSet)
 */
export function detaillerIntervalle(debut, fin, salaire_journalier, pourcentage, setFeries) {
  const journalier = toNumber(salaire_journalier);
  const pct = toNumber(pourcentage);

  let joursNormaux = 0, joursFeries = 0;
  const courant = new Date(debut); courant.setHours(0, 0, 0, 0);
  const stop = new Date(fin);      stop.setHours(0, 0, 0, 0);

  while (courant <= stop) {
    if (setFeries.has(cleJour(courant))) joursFeries++;
    else joursNormaux++;
    courant.setDate(courant.getDate() + 1);
  }

  const montantBase = round2((joursNormaux + joursFeries) * journalier);
  const montantMajoration = round2(joursFeries * journalier * (pct / 100));

  return {
    joursNormaux,
    joursFeries,
    totalJours: joursNormaux + joursFeries,
    montantBase,                         // tous les jours au tarif normal
    montantMajoration,                   // supplément dû aux fériés
    total: round2(montantBase + montantMajoration),
  };
}
```

Utile pour une ligne de tableau : « 22 jours (dont 2 fériés) → 440 € + 40 € = 480 € ».

---

## 4. Exclure les week-ends (jours ouvrés uniquement)

**Problème** : on paie actuellement **tous** les jours de l'intervalle,
week-ends compris. Beaucoup de contextes ne paient que les **jours ouvrés**.

**Fonctions** — une option `inclureWeekends` :

```javascript
/** true si la date tombe un samedi (6) ou dimanche (0). */
export function estWeekend(date) {
  const j = date.getDay();
  return j === 0 || j === 6;
}

/**
 * Variante de calculerSalaireIntervalle qui peut ignorer les week-ends.
 * @param {Object} [opts]
 * @param {boolean} [opts.inclureWeekends=true]
 * @param {Set<string>} [opts.setFeries]  fériés pré-chargés (sinon appel réseau)
 */
export async function calculerSalaireIntervalleOuvre(debut, fin, salaire_journalier, pourcentage, opts = {}) {
  const { inclureWeekends = true, setFeries = null } = opts;
  const journalier = toNumber(salaire_journalier);
  const pct = toNumber(pourcentage);

  let total = 0;
  const courant = new Date(debut); courant.setHours(0, 0, 0, 0);
  const stop = new Date(fin);      stop.setHours(0, 0, 0, 0);

  while (courant <= stop) {
    if (inclureWeekends || !estWeekend(courant)) {
      const estFerie = setFeries
        ? setFeries.has(cleJour(courant))
        : await checkJourFerie(courant.getFullYear(), courant.getMonth() + 1, courant.getDate());
      total += estFerie ? journalier * (1 + pct / 100) : journalier;
    }
    courant.setDate(courant.getDate() + 1);
  }
  return round2(total);
}
```

Case à cocher « Payer aussi les week-ends » dans le formulaire.

---

## 5. Annulation / rollback d'une génération

**Problème** : après une génération de masse erronée, il faut pouvoir **tout
annuler** rapidement. Les salaires générés portent le libellé `BULK_LABEL`
(« Salaire multiple ») → on peut les cibler.

**Fonction** :

```javascript
/**
 * Supprime les salaires générés (label donné) d'un salarié pour un mois donné.
 * Renvoie le nombre de salaires supprimés.
 *
 * @param {number|string} employeeId
 * @param {number} annee
 * @param {number} mois              1-12
 * @param {string} [label="Salaire multiple"]
 */
export async function annulerGenerationDuMois(employeeId, annee, mois, label = "Salaire multiple") {
  const salaires = await listSalaries({ employeeId, label, limit: 1000 });

  // Ne garder que ceux dont la date de début est dans le mois/année visé.
  const cibles = salaires.filter((s) => {
    const d = new Date(Number(s.periodStart) * 1000);
    return d.getMonth() + 1 === mois && d.getFullYear() === annee;
  });

  let supprimes = 0;
  for (const s of cibles) {
    try {
      await deleteSalary(s.id);
      supprimes++;
    } catch {
      /* on continue : best-effort */
    }
  }
  return supprimes;
}
```

> Attention : ne supprimer que des salaires **sans paiement** (sinon supprimer
> d'abord les versements — voir `deleteSalaryPayment`). On peut le vérifier via
> `listSalaryPayments(s.id)` avant suppression.

---

## 6. Rapport de génération (masse salariale, par genre / poste)

**Problème** : après génération, donner un **résumé chiffré** : total généré,
nombre de salaires, répartition par genre ou par poste.

**Fonction** — agrège les résultats collectés pendant la génération :

```javascript
/**
 * Construit un résumé à partir des lignes générées.
 * @param {Array<{employee: Object, montant: number}>} lignes
 *        employee = salarié normalisé (avec .gender, .job, .fullName)
 */
export function resumeGeneration(lignes) {
  const total = round2(lignes.reduce((s, l) => s + toNumber(l.montant), 0));

  const parCle = (cle) =>
    lignes.reduce((acc, l) => {
      const k = l.employee[cle] || "—";
      acc[k] = round2((acc[k] || 0) + toNumber(l.montant));
      return acc;
    }, {});

  return {
    nbSalaires: lignes.length,
    totalMasseSalariale: total,
    parGenre: parCle("gender"),   // { man: 360, woman: 220 }
    parPoste: parCle("job"),      // { Technicien: 580, ... }
  };
}
```

Alimente directement un mini-dashboard de fin de génération (cohérent avec le
dashboard « par genre » existant).

---

## 7. Dériver le salaire journalier du salarié (au lieu d'un montant fixe)

**Problème** : aujourd'hui l'utilisateur saisit **un** salaire par jour pour
tout le monde. On pourrait le **calculer par salarié** à partir de son salaire
mensuel et de ses heures (voir aussi `possible.md`), puisqu'aucun taux horaire
n'est stocké.

**Fonctions** :

```javascript
export const WEEKS_PER_MONTH = 52 / 12;   // ≈ 4,3333
export const WORK_DAYS_PER_WEEK = 5;

/** Taux horaire reconstruit = salaire mensuel / heures mensuelles moyennes. */
export function tauxHoraire(monthlySalary, weeklyHours) {
  const heuresMois = toNumber(weeklyHours) * WEEKS_PER_MONTH;
  if (heuresMois <= 0) return 0;
  return round2(toNumber(monthlySalary) / heuresMois);
}

/** Salaire journalier dérivé = taux horaire × (heures hebdo / jours ouvrés). */
export function salaireJournalierDeLEmploye(employe) {
  const heuresParJour = toNumber(employe.weeklyHours) / WORK_DAYS_PER_WEEK;
  return round2(tauxHoraire(employe.monthlySalary, employe.weeklyHours) * heuresParJour);
}
```

Dans la génération : si l'utilisateur laisse « salaire par jour » vide, utiliser
`salaireJournalierDeLEmploye(emp)` — sinon la valeur saisie. Prévoir un garde-fou
si `weeklyHours` ou `monthlySalary` valent 0 (le journalier vaut alors 0 →
prévenir l'utilisateur).

---

## 8. Validation & garde-fous avant génération

**Problème** : éviter les générations inutiles ou incohérentes.

**Fonctions** :

```javascript
/** true si le mois est déjà entièrement couvert (aucun intervalle à générer). */
export function moisDejaCouvert(couples, annee, mois) {
  return getIntervalleNonCompris(couples, annee, mois).length === 0;
}

/**
 * Valide les paramètres du formulaire de génération.
 * @returns {string[]} liste des messages d'erreur (vide = valide)
 */
export function validerParametresGeneration({ mois, salaireJournalier, pourcentage, selection }) {
  const erreurs = [];
  if (!mois) erreurs.push("Le mois et l'année sont obligatoires.");
  if (toNumber(salaireJournalier) <= 0) erreurs.push("Le salaire par jour doit être supérieur à zéro.");
  if (toNumber(pourcentage) < 0) erreurs.push("Le pourcentage de majoration ne peut pas être négatif.");
  if (!selection || selection.length === 0) erreurs.push("Veuillez sélectionner au moins un salarié.");
  return erreurs;
}
```

À appeler au début de `handleGenerate` : si `validerParametresGeneration(...)`
renvoie des erreurs, les afficher et interrompre.

---

## 9. Récapitulatif des fonctions proposées

| Fonction                                   | Rôle                                                    |
|--------------------------------------------|---------------------------------------------------------|
| `previsualiserGeneration(...)`             | dry-run : intervalles + montants sans rien créer        |
| `chargerFeriesSet()`                       | charge tous les fériés dans un Set (optimisation)       |
| `calculerSalaireIntervalleLocal(...)`      | calcul synchrone via le Set (0 requête par jour)        |
| `detaillerIntervalle(...)`                 | décompose jours normaux / fériés / majoration           |
| `estWeekend(date)`                         | samedi / dimanche ?                                     |
| `calculerSalaireIntervalleOuvre(...)`      | calcul avec option « exclure les week-ends »            |
| `annulerGenerationDuMois(...)`             | rollback des salaires générés d'un mois                 |
| `resumeGeneration(lignes)`                 | rapport : total, par genre, par poste                   |
| `tauxHoraire(...)` / `salaireJournalierDeLEmploye(...)` | dérive le journalier du salarié           |
| `moisDejaCouvert(...)`                      | le mois est-il déjà entièrement couvert ?               |
| `validerParametresGeneration(...)`         | garde-fous sur le formulaire                            |
