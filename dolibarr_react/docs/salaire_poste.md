1. Récupérer les utilisateurs (`/users`).
2. Récupérer les salaires (`/salaries`).
3. Faire le regroupement en JavaScript.

Par exemple :

```javascript
const users = await api.get("/users");
const salaries = await api.get("/salaries");
```

Construis d'abord une table de correspondance **id utilisateur → poste** :

```javascript
const jobByUserId = {};

users.forEach(user => {
    jobByUserId[user.id] = user.job || "Sans poste";
});
```

Puis calcule les totaux par poste :

```javascript
const totalByJob = salaries.reduce((acc, salary) => {
    const job = jobByUserId[salary.fk_user] || "Sans poste";

    acc[job] = (acc[job] || 0) + Number(salary.amount);

    return acc;
}, {});
```

```javascript
const result = Object.entries(totalByJob).map(([job, total]) => ({
    job,
    total,
}));
```

Tu obtiens :

```javascript
[
    { job: "Développeur", total: 12000 },
    { job: "Comptable", total: 8500 },
    { job: "RH", total: 6000 }
]
```

Tu peux ensuite faire simplement :

```jsx
<tbody>
    {result.map(row => (
        <tr key={row.job}>
            <td>{row.job}</td>
            <td>{row.total}</td>
        </tr>
    ))}
</tbody>
```

Salaire paye:

```js
const userById = {};
users.forEach(u => {
    userById[u.id] = u;
});

const salaryById = {};
salaries.forEach(s => {
    salaryById[s.id] = s;
});
```

Ensuite tu parcours les paiements.

Pour chaque paiement :

retrouver le salaire (fk_salary)
retrouver le salarié (fk_user)
retrouver son poste (job)
ajouter le montant au total de ce post

```js
const totalPaidByJob = {};

payments.forEach(payment => {

    const salary = salaryById[payment.fk_salary];
    if (!salary) return;

    const user = userById[salary.fk_user];
    if (!user) return;

    const job = user.job || "Sans poste";

    totalPaidByJob[job] =
        (totalPaidByJob[job] || 0) + Number(payment.amount);
});
```