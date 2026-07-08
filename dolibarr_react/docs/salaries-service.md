# `salariesService.js` — couche d'accès aux salariés & salaires

Fichier : `src/FO/salaries/salariesService.js`

Ce module est le **point de passage unique** entre les pages React et l'API
REST de Dolibarr pour tout ce qui touche aux salariés et aux salaires. Aucune
page n'appelle l'API directement : elle passe par ces fonctions nommées. Si
Dolibarr change (noms de champs, endpoints…), **on ne modifie que ce fichier**.

---

## 1. Constantes

### `PAYMENT_TYPES`
```js
export const PAYMENT_TYPES = [
  { id: 4, code: "LIQ", label: "Espèces" },
  { id: 2, code: "VIR", label: "Virement bancaire" },
  ...
];
```
Liste des modes de règlement (table `c_paiement` de Dolibarr). Les `id`
correspondent à l'installation standard. Le champ `paiementtype` de l'API de
paiement attend l'un de ces `id`. On l'utilise pour remplir les `<select>`.

### `DEFAULT_BANK_ACCOUNT_ID`
Le module **Banque** de Dolibarr exige un compte (`accountid`) à chaque
versement. On expose une valeur par défaut (`1`) surchargeable dans le
formulaire de paiement.

---

## 2. Helpers de formatage

| Fonction | Rôle |
|----------|------|
| `toNumber(value)` | Convertit les chaînes Dolibarr (`"1200.00000000"`) en nombre JS. Renvoie `0` si invalide. |
| `formatMoney(value)` | Formate en euros : `"1 200,00 €"` via `toLocaleString`. |
| `formatDate(unixSeconds)` | Convertit un **timestamp Unix en secondes** (format renvoyé par Dolibarr) en date `JJ/MM/AAAA`. Renvoie `"—"` si absent. |
| `toApiDate(date)` | Normalise une date de formulaire au format `YYYY-MM-DD` attendu par l'API. |

Ces helpers isolent les formats « bizarres » de Dolibarr (montants en chaîne,
dates en timestamp) pour que l'UI manipule toujours des valeurs propres.

---

## 3. Construction des filtres SQL (`sqlfilters`)

Dolibarr accepte un paramètre `sqlfilters` au format « universel » :

```
(t.champ:=:valeur) and (t.autre:like:'%texte%')
```

Plutôt que d'écrire ces chaînes à la main (source d'erreurs), on les fabrique
avec trois helpers :

```js
eqClause("t.employee", 1)        // → "(t.employee:=:1)"
likeClause("t.lastname", "Rako") // → "(t.lastname:like:'%Rako%')"
joinClauses([clauseA, clauseB], "and") // assemble en ignorant les vides
```

`likeClause` **échappe les apostrophes** pour ne pas casser la requête.
`joinClauses` filtre les clauses `null`/`""`, ce qui permet d'ajouter des
critères conditionnellement sans se soucier des séparateurs.

---

## 4. Salariés

### `listEmployees(criteria)`
Recherche **multi-critères**. Tous les critères sont optionnels et combinés en
`ET`, sauf le champ libre `search` qui cherche dans **prénom OU nom OU login**
(combinés en `OU`).

```js
if (onlyEmployees) clauses.push(eqClause("t.employee", 1));
if (status !== "") clauses.push(eqClause("t.statut", status));
if (job.trim())    clauses.push(likeClause("t.job", job.trim()));
if (email.trim())  clauses.push(likeClause("t.email", email.trim()));

if (search.trim()) {
  const orPart = joinClauses([
    likeClause("t.firstname", term),
    likeClause("t.lastname",  term),
    likeClause("t.login",     term),
  ], "or");
  clauses.push(`(${orPart})`); // parenthésé pour préserver la priorité
}
```

Le résultat passe par `mapEmployee` (voir plus bas). En cas d'absence de
résultat, Dolibarr renvoie parfois un **404** : on l'attrape et on renvoie un
tableau vide pour simplifier l'appelant.

Avec `withPhotos: true`, on télécharge en parallèle la photo de chaque salarié
(via `getEmployeePhoto`) et on la place dans `photoUrl`. Désactivé par défaut
(un téléchargement par salarié, inutile pour les appelants sans photo).

### `getEmployee(id)`
Récupère un salarié unique via `GET /users/{id}` et le normalise.

### `getEmployeePhoto(userId, fileName)`
Renvoie la photo en **data URL** affichable, ou `null` si absente.
`GET /documents/download` ne renvoie pas un binaire mais un JSON
`{ filename, "content-type", filesize, content (base64), encoding }` ; on
construit donc `data:<content-type>;base64,<content>`. Le paramètre attendu est
**`original_file`** (= `"{userId}/photos/{fileName}"`), pas `file`. Un 404
(fichier absent) est lissé en `null`.

### `mapEmployee(u)`
Projette l'utilisateur Dolibarr **brut** sur une forme **stable et concise** :
```js
{ id, login, firstName, lastName, fullName, email, job,
  isEmployee, isActive, isAdmin, monthlySalary, gender, photo, photoUrl }
```
C'est le seul endroit qui « connaît » les noms de champs Dolibarr
(`firstname`, `statut`, `employee`…). L'UI ne manipule que cette forme propre.
`photo` = nom de fichier ; `photoUrl` = data URL (peuplée si `withPhotos`).

---

## 5. Salaires

### `createSalary(input)`
Crée un salaire dû via `POST /salaries`. **Champs obligatoires côté Dolibarr :
`fk_user`, `label`, `amount`.** Les dates de période sont normalisées :
```js
const payload = {
  fk_user: Number(input.fk_user),
  label: input.label,
  amount: toNumber(input.amount),
  datesp: toApiDate(input.datesp), // début période
  dateep: toApiDate(input.dateep), // fin période
  datev:  toApiDate(input.datev),  // date de valeur
};
return api.post("/salaries", payload); // renvoie l'id (entier) créé
```

### `listSalaries(criteria)` / `getSalary(id)` / `mapSalary(s)`
Liste/récupère les salaires et les normalise. `mapSalary` expose notamment
`amount` (nombre) et `isPaid` (`paye == 1` → salaire totalement réglé).

---

## 6. Paiements (versements)

### `listSalaryPayments(salaryId)`
Liste les versements d'un salaire via
`GET /salaries/payments?sqlfilters=(t.fk_salary:=:ID)`.

### `addSalaryPayment(salaryId, payment)`
**Cœur du paiement en plusieurs fois.** L'API de Dolibarr a plusieurs pièges,
tous encapsulés ici :

```js
const body = {
  chid: Number(salaryId),                 // id du salaire (exigé EN PLUS de l'URL)
  paiementtype: Number(payment.typeId),   // mode de règlement (orthographe FR !)
  datepaye: toApiDate(payment.date),       // date du versement
  amounts: { [salaryId]: toNumber(payment.amount) }, // tableau associatif !
  accountid: Number(payment.accountId ?? DEFAULT_BANK_ACCOUNT_ID),
};
return api.post(`/salaries/${salaryId}/payments`, body);
```

Pièges Dolibarr documentés ici :
- **`amounts` est un tableau associatif** `{ idSalaire: montant }` — Dolibarr
  ventile le paiement par salaire et insère une ligne par entrée. Un montant
  scalaire échoue (`total = 0`).
- **`chid`** est exigé dans le corps bien qu'il soit déjà dans l'URL.
- **`paiementtype`** s'écrit à la française (et non `paymenttype`).
- **`datepaye`** (et non `datepaid`).
- ⚠️ **Limitation Dolibarr** : `paiementtype` est validé mais **n'est pas
  persisté** dans la colonne `fk_typepayment` (l'API mappe mal le champ). La
  liste des versements renvoie donc `fk_typepayment = 0`. Le « mode » affiché
  peut donc être `—`. Ce n'est pas un bug du front.

---

## 7. Règles métier (calculs)

### `sumPayments(payments)`
Somme des versements (`reduce`).

### `computeSalaryBalance(salary, payments)` — **fonction centrale**
Calcule l'état de règlement, ce qui pilote tout le paiement échelonné :
```js
{
  total,        // montant dû
  paid,         // déjà versé
  remaining,    // reste à payer (≥ 0)
  isFullyPaid,  // true quand remaining ≤ 0
  progress,     // ratio 0→1 pour la barre de progression
}
```
Tant que `remaining > 0`, l'UI propose un nouveau versement.

### `round2(n)`
Arrondi monétaire à 2 décimales (évite les artefacts de flottants type
`899.9999999`).

### `paymentTypeLabel(typeId)`
Traduit un id de mode de règlement en libellé lisible.

---

## Pourquoi cette organisation ?

- **Une fonction = une responsabilité claire**, nommée en clair.
- **Aucune chaîne d'API en dur dans les composants** : tout est ici.
- **Formats Dolibarr isolés** dans les `map*` et les helpers.
- **Changement facile** : un nouvel endpoint ou un champ renommé ne touche
  que ce fichier, jamais les pages.
