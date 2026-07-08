# Fonctionnalité : Liste des salaires (tous statuts)

Fichier : `src/FO/salaries/SalaryListPage.jsx`
Route : `/fo/salaries/liste`
Dépend de : [`salariesService.js`](./salaries-service.md)

Étape intermédiaire du flux **création → liste → paiement** : cette page liste
**tous les salaires** avec leur état de règlement et permet d'ouvrir l'interface
de versement d'un clic.

---

## 1. Données : `listSalariesWithBalance()`

La page a besoin, pour chaque salaire, du **nom du salarié** et de son **état de
règlement** (payé / partiel / impayé). Ces informations viennent de 3 sources
différentes ; le service les croise **en mémoire** après 3 appels parallèles :

```js
const [salaries, payments, employees] = await Promise.all([
  listSalaries({ limit: 1000 }),
  listAllSalaryPayments({ limit: 5000 }),     // tous les versements en 1 appel
  listEmployees({ onlyEmployees: false, status: "", limit: 1000 }),
]);
```

On évite ainsi un appel « paiements » par salaire. Puis :
- index `id salarié → nom` ;
- versements **regroupés par salaire** ;
- pour chaque salaire, `computeSalaryBalance` → `{ paid, remaining, progress }`
  et `salaryStatusOf` → `statusKey`.

## 2. Le statut d'un salaire

```js
export function salaryStatusOf(balance) {
  if (balance.isFullyPaid) return "paye";     // payé
  if (balance.paid > 0)     return "partiel"; // règlement commencé
  return "impaye";                            // rien versé
}
```

Le statut est **calculé à partir des versements**, pas du seul drapeau `paye` de
Dolibarr (qui ne distingue pas le « partiellement réglé »). Les libellés et la
couleur du badge viennent de `SALARY_STATUSES` :

```js
SALARY_STATUSES = {
  paye:    { label: "Payé",                 tone: "ok" },    // badge vert
  partiel: { label: "Partiellement réglé",  tone: "warn" },  // badge orange
  impaye:  { label: "Impayé",               tone: "muted" }, // badge gris
};
```

## 3. La page

### Filtres multi-critères (côté client)
Tous les salaires étant déjà chargés, les filtres s'appliquent en mémoire via
`matchesFilters(salaire, filtres)`. Champs disponibles :

| Filtre | Champ comparé | Règle |
|--------|---------------|-------|
| Salarié | `employeeName` | contient (insensible casse) |
| Libellé | `label` | contient |
| Référence | `ref` | contient |
| Mode de paiement | `typePaymentId` | égalité (select des `PAYMENT_TYPES`) |
| Date début (à partir de) | `periodStart` | `tsToISODate(periodStart) >= valeur` |
| Date fin (jusqu'à) | `periodEnd` | `tsToISODate(periodEnd) <= valeur` |
| Montant à payer (≥) | `remaining` | `remaining >= valeur` |
| Statut | `statusKey` | égalité (Tous / Impayés / Partiels / Payés) |

`tsToISODate` convertit un timestamp Unix en `"YYYY-MM-DD"` (heure locale) pour
une comparaison de dates sûre (l'ordre lexicographique = ordre chronologique).
Un bouton « Réinitialiser les filtres » remet `EMPTY_FILTERS`.

### Tableau
Colonnes : Réf · Salarié · Libellé · **Mode** · Période · Montant · Payé ·
Reste · Statut (badge) · bouton **Payer**.

- **Clic sur la ligne** (ou sur « Payer ») → `navigate("/fo/salaries/:id/payer")`
  → l'interface de versement existante. Le bouton « Payer » appelle
  `e.stopPropagation()` pour ne pas déclencher deux fois la navigation.

```jsx
<tr onClick={() => openPayment(s)} style={{ cursor: "pointer" }}>
  …
  <span className={`sal-badge sal-badge--${status.tone}`}>{status.label}</span>
  <button onClick={(e) => { e.stopPropagation(); openPayment(s); }}>Payer</button>
</tr>
```

Le chargement suit le motif habituel (IIFE asynchrone dans `useEffect`, `setState`
après `await`, drapeau `cancelled`).
