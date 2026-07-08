# Exercices — Manipulation de tableaux (ancrés dans le projet)

Ce fichier est **isolé** : il n'est importé par aucun module du projet. Vous pouvez
écrire, tester et vous tromper ici sans jamais casser l'application. Recopiez les
fonctions à entraîner dans un fichier bac à sable (par ex. `exo/bac-a-sable.js`) ou
dans la console du navigateur.

Tous les exercices reprennent les **formes de données réelles** produites par
`src/FO/salaries/salariesService.js` (voir `mapEmployee`, `mapSalary`, `mapPayment`)
et les calculs de `src/BO/dashboard/dashboardService.js`. L'idée : vous réécrivez à
la main des fonctions qui existent déjà dans le projet, puis vous comparez votre
version à l'originale (indiquée à chaque exercice).

---

## Jeu de données de référence

Collez ce bloc en haut de votre bac à sable. Ces objets imitent exactement ce que
renvoient les fonctions `map*` du service.

```js
// Salariés normalisés (forme de mapEmployee)
const employees = [
  { id: 1, fullName: "Alice Martin",  job: "Développeuse", gender: "woman", monthlySalary: 3200, isActive: true,  isEmployee: true },
  { id: 2, fullName: "Bob Durand",    job: "Comptable",    gender: "man",   monthlySalary: 2800, isActive: true,  isEmployee: true },
  { id: 3, fullName: "Chloé Petit",   job: "Développeuse", gender: "woman", monthlySalary: 3500, isActive: false, isEmployee: true },
  { id: 4, fullName: "David Lefevre", job: "Commercial",   gender: "man",   monthlySalary: 2600, isActive: true,  isEmployee: true },
  { id: 5, fullName: "Eve Roux",      job: "RH",           gender: "",      monthlySalary: 3000, isActive: true,  isEmployee: false },
];

// Salaires normalisés (forme de mapSalary)
const salaries = [
  { id: 10, employeeId: 1, label: "Salaire juin",    amount: 3200, isPaid: true  },
  { id: 11, employeeId: 1, label: "Salaire juillet", amount: 3200, isPaid: false },
  { id: 12, employeeId: 2, label: "Salaire juin",    amount: 2800, isPaid: false },
  { id: 13, employeeId: 3, label: "Salaire juin",    amount: 3500, isPaid: true  },
  { id: 14, employeeId: 4, label: "Salaire juin",    amount: 2600, isPaid: false },
];

// Paiements normalisés (forme de mapPayment) — date = timestamp Unix (secondes)
const payments = [
  { id: 100, salaryId: 10, amount: 3200, date: 1717200000, typeId: 2 }, // juin 2024
  { id: 101, salaryId: 11, amount: 1000, date: 1719792000, typeId: 4 }, // juillet 2024
  { id: 102, salaryId: 12, amount: 1400, date: 1717200000, typeId: 7 }, // juin 2024
  { id: 103, salaryId: 12, amount:  700, date: 1719792000, typeId: 7 }, // juillet 2024
  { id: 104, salaryId: 13, amount: 3500, date: 1717200000, typeId: 2 }, // juin 2024
];
```

---

## Niveau 1 — Les bases (`map`, `filter`, `find`)

### Exercice 1.1 — Lister les noms (`map`)
Écrivez `employeeNames(list)` qui renvoie un tableau des `fullName` de tous les salariés.
```
employeeNames(employees) // ["Alice Martin", "Bob Durand", ...]
```
Indice : `array.map(...)` transforme chaque élément. Inspiré de `rows.map(mapEmployee)`.

### Exercice 1.2 — Filtrer les actifs (`filter`)
Écrivez `activeEmployees(list)` qui ne garde que les salariés avec `isActive === true`.
Indice : `array.filter(predicat)` garde les éléments pour lesquels le prédicat est vrai.

### Exercice 1.3 — Filtrer puis transformer (`filter` + `map`)
Écrivez `unpaidSalaryLabels(list)` qui renvoie les `label` des salaires **non payés**.
```
unpaidSalaryLabels(salaries) // ["Salaire juillet", "Salaire juin", "Salaire juin"]
```
Indice : chaînez `.filter(...).map(...)`.

### Exercice 1.4 — Trouver un élément (`find`)
Écrivez `employeeById(list, id)` qui renvoie le salarié dont l'`id` correspond, ou
`undefined` sinon. C'est exactement le motif de `GENDERS.find(...)` dans
`dashboardService.js` (`genderLabel`).
Indice : `array.find(predicat)` renvoie le **premier** élément qui matche.

---

## Niveau 2 — Agrégation (`reduce`)

### Exercice 2.1 — Somme des montants (`reduce`)
Écrivez `sumPayments(list)` qui additionne tous les `amount`. C'est la fonction réelle
`sumPayments` de `salariesService.js`.
```
sumPayments(payments) // 9800
```
Indice : `array.reduce((total, p) => total + p.amount, 0)`. Le `0` est la valeur initiale.

### Exercice 2.2 — Masse salariale moyenne
Écrivez `averageSalary(list)` qui renvoie la moyenne des `monthlySalary` des salariés.
Gérez le cas d'un tableau vide (renvoyez `0`, ne divisez pas par zéro).

### Exercice 2.3 — Totaux d'en-tête (reduce vers un objet)
Reproduisez `summarize(series)` du dashboard : à partir d'une liste d'objets
`{ total, count }`, renvoyez `{ grandTotal, totalCount }`.
Indice : l'accumulateur de `reduce` peut être un objet, pas seulement un nombre.

### Exercice 2.4 — Le ou les mieux payés
Écrivez `topEarner(list)` qui renvoie le salarié au plus gros `monthlySalary`.
Indice : `reduce` en gardant « le meilleur jusqu'ici », ou triez puis prenez le premier.

---

## Niveau 3 — Croisement de deux tableaux (le cœur du projet)

C'est exactement ce que fait `listSalariesWithBalance` : croiser salaires, paiements
et salariés sans refaire un appel réseau par ligne.

### Exercice 3.1 — Index avec `Map`
Écrivez `nameIndex(employees)` qui renvoie une `Map` `id (string) → fullName`.
Indice : `new Map(employees.map((e) => [String(e.id), e.fullName]))`. Voir
`nameByEmployee` dans `listSalariesWithBalance`.

### Exercice 3.2 — Enrichir les salaires avec le nom du salarié
Écrivez `salariesWithEmployeeName(salaries, employees)` qui renvoie les salaires avec
en plus un champ `employeeName`. Utilisez l'index de 3.1 pour rester en O(1) par ligne.
```
// [{ id: 10, employeeId: 1, ..., employeeName: "Alice Martin" }, ...]
```
Indice : `salaries.map((s) => ({ ...s, employeeName: index.get(String(s.employeeId)) }))`.

### Exercice 3.3 — Regrouper les paiements par salaire
Écrivez `paymentsBySalary(payments)` qui renvoie une `Map` `salaryId → tableau de paiements`.
C'est la boucle de regroupement de `listSalariesWithBalance`.
Indice : pour chaque paiement, récupérez le tableau de sa clé (ou `[]`), puis `push`.

### Exercice 3.4 — Reste à payer par salaire
À partir de 3.3, écrivez `remainingBySalary(salaries, payments)` qui renvoie pour chaque
salaire `{ id, label, remaining }` où `remaining = amount - somme des paiements` (jamais
négatif). Réutilisez `sumPayments` (2.1). Inspiré de `computeSalaryBalance`.

---

## Niveau 4 — Regroupement et statistiques (le dashboard)

### Exercice 4.1 — `groupAndSum` générique
Reproduisez le helper réel `groupAndSum(items, keyOf, valueOf)` de `dashboardService.js` :
il renvoie une `Map` `clé → { total, count }`.
```
const byType = groupAndSum(payments, (p) => p.typeId, (p) => p.amount);
// Map { 2 => {total: 6700, count: 2}, 4 => {total: 1000, count: 1}, 7 => {total: 2100, count: 2} }
```
Indice : c'est le motif « bucket » : `const bucket = result.get(key) || { total: 0, count: 0 }`.

### Exercice 4.2 — Montant par genre
À l'aide de 3.1 (un index `id → gender`) et de `groupAndSum`, reproduisez
`getSalaryAmountByGender` (version synchrone, sans `await`) : montant total des salaires
regroupé par genre du salarié, projeté sur la liste fixe
`["man", "woman", ""]` pour garder un ordre stable même à 0.

### Exercice 4.3 — Trier le résultat (`sort`)
À partir d'une `Map` de `groupAndSum`, écrivez `toSortedArray(map)` qui renvoie un tableau
`[{ key, total, count }]` trié par `total` **décroissant**.
Indice : `[...map.entries()].map(...).sort((a, b) => b.total - a.total)`. Voir le `.sort`
final de `getSalaryAmountByMonth`. Attention : `sort` modifie le tableau en place.

---

## Niveau 5 — Pour aller plus loin (`some`, `every`, `flatMap`, `Set`)

### Exercice 5.1 — Y a-t-il un impayé ? (`some`)
Écrivez `hasUnpaid(salaries)` → `true` si au moins un salaire a `isPaid === false`.

### Exercice 5.2 — Tout est-il payé ? (`every`)
Écrivez `allPaid(salaries)` → `true` si **tous** les salaires sont payés.

### Exercice 5.3 — Postes distincts (`Set`)
Écrivez `distinctJobs(employees)` qui renvoie la liste **sans doublon** des `job`.
Indice : `[...new Set(list.map((e) => e.job))]`.

### Exercice 5.4 — Construire des clauses SQL (`filter(Boolean)` + `join`)
Reproduisez `joinClauses(clauses, operator)` de `salariesService.js` : il assemble des
chaînes avec ` and ` / ` or ` en **ignorant** les valeurs vides/`null`/`false`.
Indice : `clauses.filter(Boolean).join(" " + operator + " ")`.

---

## Méthode de travail conseillée

1. Créez `exo/bac-a-sable.js`, collez le jeu de données, écrivez une fonction.
2. Testez vite : `console.log(maFonction(employees))` puis `node exo/bac-a-sable.js`.
3. Comparez avec l'original cité dans l'énoncé (ouvrez le fichier indiqué).
4. Question pour chaque exo : « est-ce que je modifie le tableau d'origine, ou j'en
   crée un nouveau ? » — `map`/`filter`/`reduce` créent du neuf ; `sort`/`push` modifient.

## Aide-mémoire

| Besoin                                   | Méthode                  | Renvoie            |
| ---------------------------------------- | ------------------------ | ------------------ |
| Transformer chaque élément               | `map`                    | nouveau tableau    |
| Garder certains éléments                 | `filter`                 | nouveau tableau    |
| Réduire à une seule valeur (somme, objet)| `reduce`                 | la valeur accumulée|
| Trouver le premier qui matche            | `find`                   | élément / undefined|
| « au moins un »                          | `some`                   | booléen            |
| « tous »                                 | `every`                  | booléen            |
| Trier                                    | `sort` (en place)        | le tableau trié    |
| Index clé → valeur, regrouper            | `Map`                    | une Map            |
| Dédoublonner                             | `Set`                    | un Set             |
```

Aucune solution n'est fournie : les originaux dans `salariesService.js` et `dashboardService.js` sont vos corrigés.
