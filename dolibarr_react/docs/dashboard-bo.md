# Fonctionnalité : Tableau de bord des salaires (Back Office)

Fichiers :
- `src/BO/dashboard/DashboardPage.jsx` — la page et le rendu
- `src/BO/dashboard/dashboardService.js` — les agrégations (calcul)
- `src/BO/dashboard/dashboard.css` — styles

Route : `/bo/dashboard` (accès protégé par `BOLayout`, comme tout le BO).
Dépend de : [`salariesService.js`](./salaries-service.md)

Le tableau de bord affiche **deux indicateurs** :
1. **Montant de salaire par genre** ;
2. **Montant de salaire par mois**, avec la **date de règlement** (date des
   versements) comme référence.

---

## 1. Principe : séparer le calcul du rendu

- `dashboardService.js` ne fait **que du calcul** (regrouper, sommer). Il
  s'appuie sur la couche `salariesService` et ne contient **aucun appel API en
  dur**.
- `DashboardPage.jsx` ne fait **que charger et afficher**.

Cette séparation rend chaque indicateur testable et modifiable isolément.

---

## 2. Le service d'agrégation (`dashboardService.js`)

### Brique réutilisable : `groupAndSum`
Les deux indicateurs sont en réalité le **même calcul** (regrouper par une clé,
sommer un montant). On factorise donc dans une seule fonction générique :

```js
export function groupAndSum(items, keyOf, valueOf) {
  const result = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const value = toNumber(valueOf(item));
    const bucket = result.get(key) || { total: 0, count: 0 };
    bucket.total += value;
    bucket.count += 1;
    result.set(key, bucket);
  }
  return result;
}
```
- `keyOf` : comment extraire la clé de regroupement (genre, ou mois).
- `valueOf` : quelle valeur sommer (le montant).
- Renvoie une `Map` clé → `{ total, count }`.

### Indicateur 1 — `getSalaryAmountByGender()`
Le genre n'est pas porté par le salaire mais par le **salarié**. On croise donc
deux sources :

```js
const [salaries, employees] = await Promise.all([
  listSalaries({ limit: 1000 }),
  listEmployees({ onlyEmployees: false, status: "", limit: 1000 }),
]);

// index id salarié → genre (croisement en O(1))
const genderByEmployee = new Map(employees.map((e) => [String(e.id), e.gender || ""]));

const grouped = groupAndSum(
  salaries,
  (s) => genderByEmployee.get(String(s.employeeId)) ?? "", // clé = genre
  (s) => s.amount                                          // valeur = montant
);

// projette sur la liste fixe GENDERS → garantit l'ordre ET les genres à 0
return GENDERS.map((g) => {
  const bucket = grouped.get(g.key) || { total: 0, count: 0 };
  return { key: g.key, label: g.label, total: bucket.total, count: bucket.count };
});
```

Points clés :
- `Promise.all` charge les deux listes **en parallèle**.
- Le `Map` `genderByEmployee` évite une recherche linéaire par salaire.
- On projette toujours sur `GENDERS` (Homme / Femme / Non renseigné) pour que le
  graphique ait des barres stables même si une catégorie est vide.

> Le genre vient du champ Dolibarr `gender` (`"man"` / `"woman"` / vide). Il est
> exposé par `mapEmployee` dans `salariesService`.

### Indicateur 2 — `getSalaryAmountByMonth()`
Ici la référence est la **date de règlement**, donc on part des **paiements**
(pas des salaires) : un salaire payé en plusieurs fois compte sur **chaque mois**
où un versement a eu lieu.

```js
const payments = await listAllSalaryPayments({ limit: 1000 });

const grouped = groupAndSum(
  payments,
  (p) => monthKey(p.date), // clé = mois de la date de règlement
  (p) => p.amount
);

return [...grouped.entries()]
  .map(([key, bucket]) => ({ key, label: monthLabel(key), ...bucket }))
  .sort((a, b) => a.key.localeCompare(b.key)); // ordre chronologique
```

Helpers de date :
```js
monthKey(unixSeconds)  // 1782345600 → "2026-06"
monthLabel("2026-06")  // → "juin 2026"
```
`monthKey` transforme le timestamp Unix (secondes, format Dolibarr) en clé
triable `"YYYY-MM"` ; `monthLabel` la rend lisible en français. Le tri par clé
`localeCompare` donne l'ordre chronologique naturel.

### `summarize(series)`
Calcule les totaux d'en-tête (montant global, nombre d'éléments) à partir d'une
série déjà agrégée — réutilisé pour les cartes de synthèse.

---

## 3. La page (`DashboardPage.jsx`)

### Chargement (même motif que les autres pages)
```js
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [genders, months] = await Promise.all([
        getSalaryAmountByGender(),
        getSalaryAmountByMonth(),
      ]);
      if (!cancelled) { setByGender(genders); setByMonth(months); }
    } catch (err) { if (!cancelled) setError(err.message); }
    finally       { if (!cancelled) setLoading(false); }
  })();
  return () => { cancelled = true; };
}, [refreshKey]);
```
- Les deux indicateurs sont chargés **en parallèle**.
- `setState` seulement **après l'`await`** → conforme ESLint
  (`react-hooks/set-state-in-effect`), pas de rendu en cascade.
- Le drapeau `cancelled` ignore une réponse périmée.
- `refresh()` (bouton « 🔄 Rafraîchir ») incrémente `refreshKey` et relance
  l'effet.

### Rendu
1. **3 cartes de synthèse** : total dû, total versé, nombre de versements.
2. **Par genre** : une **carte par genre** (libellé, montant, nombre de salaires).
3. **Par mois** : un `<BarChart>` (barres horizontales).

### Les cartes « par genre »
On affiche une carte (`dash__card`) par genre — Homme / Femme / Non renseigné —
avec le montant total (`formatMoney`) et le nombre de salaires. (Auparavant des
barres ; remplacées par des cartes.)

### Le graphique `BarChart` (par mois, sans librairie)
Aucune dépendance de graphes n'est installée : on dessine des **barres
horizontales en CSS**, proportionnelles au plus grand total de la série.

```js
const max = Math.max(1, ...data.map((d) => d.total)); // évite la division par 0
const widthPct = Math.round((d.total / max) * 100);
// <div className="bar__fill" style={{ width: `${widthPct}%` }} />
```
Chaque ligne affiche : libellé · barre · montant formaté (`formatMoney`) +
nombre d'éléments entre parenthèses. Si la série est vide, un message
« Aucune donnée » s'affiche.

---

## 4. Branchement

- Route ajoutée dans `src/route/AppRouter.jsx` sous `/bo` :
  `path="dashboard"` → `<DashboardPage />`.
- Le menu BO (`src/BO/components/Sidebar.jsx`) pointe déjà vers `/bo/dashboard`.

---

## 5. Exemple de résultat (données de démonstration)

| Par genre | Montant |
|-----------|---------|
| Homme | 2 000,00 € (1) |
| Femme | 2 500,00 € (1) |
| Non renseigné | 1 200,00 € (1) |

| Par mois (règlement) | Montant |
|----------------------|---------|
| mai 2026 | 2 000,00 € (2 versements) |
| juin 2026 | 3 700,00 € (3 versements) |

> **Note Dolibarr** : « par genre » s'appuie sur le **montant dû** des salaires
> (table `salaries`), tandis que « par mois » s'appuie sur les **versements**
> réellement effectués (date de règlement `datep`). Les deux totaux peuvent donc
> différer tant que des salaires ne sont pas intégralement payés.
