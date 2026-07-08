# Fonctionnalité : Réinitialisation des données (Back Office)

Fichiers :
- `src/BO/reset/ResetDataPage.jsx` — l'écran (confirmation + journal)
- `src/BO/reset/resetService.js` — orchestration des suppressions
- `src/BO/reset/reset.css` — styles

Route : `/bo/reset` (protégé par `BOLayout`). Lié dans le menu BO.
Dépend de : [`salariesService.js`](./salaries-service.md)

Supprime **tous les versements, tous les salaires, puis les salariés importés**
(comptes `employee=1` **non administrateurs**). Le super-administrateur connecté
est toujours préservé.

---

## 1. Endpoints Dolibarr utilisés

Ces deux routes de suppression ont été activées côté Dolibarr :

```
DELETE /salaries/{paymentId}/payments   → supprime UN versement
DELETE /salaries/salary/{id}            → supprime UN salaire
DELETE /users/{id}                      → supprime UN salarié
DELETE /documents (modulepart=user)     → supprime UN fichier photo
```

⚠️ Subtilité : pour la route de versement, l'`{id}` de l'URL est l'id du
**paiement** (pas du salaire). Encapsulé dans le service :

```js
export async function deleteSalaryPayment(paymentId) {
  return api.del(`/salaries/${paymentId}/payments`);
}
export async function deleteSalary(id) {
  return api.del(`/salaries/salary/${id}`);
}
```

## 2. Orchestration : `resetSalariesData(onProgress)`

```js
// 1) Tous les versements d'abord…
for (const p of await listAllSalaryPayments(...)) { await deleteSalaryPayment(p.id); }
// 2) …puis tous les salaires…
for (const s of await listSalaries(...))          { await deleteSalary(s.id); }
// 3) …puis les salariés importés (employés non admin) :
//    leurs PHOTOS d'abord (Dolibarr ne nettoie pas le disque), puis le compte.
for (const e of await resettableEmployees()) {
  if (e.photo) await deleteEmployeePhotos(e.id, e.photo); // photo + vignettes _small/_mini
  await deleteEmployee(e.id);
}
```

> `User::delete()` de Dolibarr ne supprime **que** les lignes en base, pas le
> dossier `documents/users/{id}/`. On efface donc explicitement la photo et ses
> deux vignettes via `DELETE /documents` (best-effort : les 404 sont ignorés).

`resettableEmployees()` = `listEmployees({ onlyEmployees: true })` filtré sur
`!isAdmin` → on ne supprime **jamais** le super-administrateur.

Points clés :
- **Ordre** : versements → salaires → salariés. On supprime toujours la
  dépendance avant son propriétaire (sinon Dolibarr refuse la suppression).
- **Tolérant aux erreurs** : un échec sur une ligne est journalisé et n'arrête
  pas le reste (`record("error", …)`).
- Renvoie `{ paymentsDeleted, salariesDeleted, employeesDeleted, photosDeleted,
  errors, log }`.
- `countResettableData()` donne le volume **sans rien supprimer** (aperçu).

## 3. L'écran `ResetDataPage.jsx`

- **Aperçu** du volume concerné (X salaires, Y versements, Z salariés) via
  `countResettableData` au montage.
- **Un seul bouton** « Réinitialiser » (pas de confirmation), puis le **journal
  en direct** (`onProgress` → `setLog`) + **statistiques** finales.
- Après coup, on **recharge les compteurs** (`refreshKey`) — ils doivent
  retomber à 0.

```jsx
<button onClick={handleReset} disabled={running || !counts}>
  {running ? "Suppression…" : "🗑️ Réinitialiser"}
</button>
```

## 4. Portée

- Supprime salaires + versements + **salariés importés** (employés non admin) +
  **leurs fichiers photos** (photo + vignettes) sur le disque.
- Le **super-administrateur** (et tout compte `admin=1`) est préservé.
- Comme l'import ne dédoublonne pas les salaires, relancer plusieurs fois
  l'import crée des doublons : ce reset est l'outil pour repartir propre.
