# Fonctionnalité : Création et paiement d'un salaire (en plusieurs fois)

Fichier : `src/FO/salaries/SalaryCreatePayPage.jsx`
Routes :
- `/fo/salaries/nouveau` → **mode création**
- `/fo/salaries/:id/payer` → **mode paiement** (salaire existant)

Dépend de : [`salariesService.js`](./salaries-service.md)

Cette page gère le cycle de vie d'un salaire. Le **flux** est direct :

```
création (formulaire)  ->  paiement du salaire créé
  /fo/salaries/nouveau      /fo/salaries/:id/payer
```

Il existe par ailleurs une page **liste des salaires** ([liste-salaires.md](./liste-salaires.md),
route `/fo/salaries/liste`) qui mène aussi au paiement, mais elle n'est pas
intercalée dans ce flux (et n'est plus liée dans le menu).

---

## 1. Un seul composant, deux modes pilotés par l'URL

```jsx
export default function SalaryCreatePayPage() {
  const { id: salaryIdFromUrl } = useParams();
  const navigate = useNavigate();

  return salaryIdFromUrl
    ? <PaymentMode  salaryId={salaryIdFromUrl} onBack={...} />
    : <CreationMode onCreated={(newId) => navigate(`/fo/salaries/${newId}/payer`)} onBack={...} />;
}
```

- Sans `:id` dans l'URL → on affiche le **formulaire de création**.
- Après création, on **enchaîne directement** sur le paiement du salaire créé
  (`/:id/payer`).

Découper en deux sous-composants (`CreationMode`, `PaymentMode`) garde chaque
responsabilité isolée et lisible.

### Champs du formulaire de création (calqué sur Dolibarr)

**Base** : `fk_user` (obligatoire), `label`, `datesp` (début) / `dateep` (fin) de
période, `amount` (obligatoire), `fk_typepayment` (mode de règlement).

**Case « Enregistrer également le paiement »** (`alsoPay`, décochée par défaut).
Quand elle est cochée :
- on révèle **Date de paiement** (`datep`, **obligatoire**) et **Date de valeur**
  (`datev`, **optionnelle** — peut rester vide ; vide = `null`, pas la date du
  jour) ;
- le **mode de règlement devient obligatoire** ;
- à la soumission, on **crée le salaire PUIS on enregistre un paiement du montant
  TOTAL** avec **le même mode de règlement** :
  ```js
  const newId = await createSalary({ fk_user, label, amount, datesp, dateep,
                                     fk_typepayment, datep, datev });
  if (form.alsoPay) {
    await addSalaryPayment(newId, { amount, date: form.datep,
                                    typeId: Number(form.fk_typepayment) });
  }
  ```
Décochée, on crée seulement le salaire (le paiement se fait plus tard depuis
`/:id/payer`). `createSalary` n'envoie `datep`/`datev` que s'ils sont renseignés.

### Ordre d'affichage du mode paiement (`/:id/payer`)

1. **Formulaire d'ajout de versement** (en premier) ;
2. **État du règlement** (total / payé / reste + barre de progression) ;
3. **Historique des versements**.

---

## 2. Mode création (`CreationMode`)

### Valeurs initiales intelligentes
```js
function emptySalaryForm(preselectedEmployeeId = "") {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  return { fk_user: preselectedEmployeeId, label: "", datesp: firstOfMonth,
           dateep: today, amount: "", fk_typepayment: "",
           alsoPay: false, datep: "", datev: "" };
}
```
La période est pré-remplie sur le **mois courant** (du 1er à aujourd'hui).

### Pré-sélection du salarié via l'URL
```js
const [searchParams] = useSearchParams();
const preselectedEmployeeId = searchParams.get("employe") || "";
```
Quand on arrive depuis la liste (`?employe=ID`), le salarié est déjà choisi.

### Chargement de la liste déroulante des salariés
```js
useEffect(() => {
  listEmployees({ onlyEmployees: true, status: "1", limit: 200 })
    .then(setEmployees)
    .catch((err) => setError(err.message));
}, []);
```
On peuple le `<select>` avec les salariés actifs.

### Libellé suggéré automatiquement
```js
function suggestedLabel() {
  const emp = employees.find((e) => String(e.id) === String(form.fk_user));
  const period = form.datesp ? ` ${form.datesp.slice(0, 7)}` : "";
  return emp ? `Salaire ${emp.fullName}${period}` : "";
}
```
Si l'utilisateur ne saisit pas de libellé, on en génère un du type
`« Salaire Jean Dupont 2026-06 »`.

### Validation + création
```js
if (!form.fk_user)               return setError("Veuillez choisir un salarié.");
if (!form.amount || amount <= 0) return setError("Le montant doit être > 0.");

await createSalary({ ...form, label: form.label.trim() || suggestedLabel() });
onCreated(); // → redirige vers la liste des salaires
```
On valide les champs obligatoires côté client avant d'appeler l'API. Après
création, `onCreated` redirige vers la **liste des salaires** (le salaire créé y
apparaît, prêt à être payé).

---

## 3. Mode paiement (`PaymentMode`)

### Chargement salaire + paiements (avec rafraîchissement)
```js
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [s, p] = await Promise.all([ getSalary(salaryId), listSalaryPayments(salaryId) ]);
      if (!cancelled) { setSalary(s); setPayments(p); }
    } catch (err) { if (!cancelled) setError(err.message); }
    finally       { if (!cancelled) setLoading(false); }
  })();
  return () => { cancelled = true; };
}, [salaryId, refreshKey]);

function refresh() { setLoading(true); setRefreshKey((k) => k + 1); }
```

- On charge **en parallèle** (`Promise.all`) le salaire et ses versements.
- Tous les `setState` sont **après l'`await`** → pas de rendu en cascade
  (conforme à la règle ESLint `react-hooks/set-state-in-effect`).
- `refresh()` (appelée après un versement) incrémente `refreshKey`, ce qui
  **relance l'effet** et recharge des données à jour.

### Le calcul central : le solde
```js
const balance = computeSalaryBalance(salary, payments);
// → { total, paid, remaining, isFullyPaid, progress }
```
C'est ce calcul (dans le service) qui rend possible le **paiement échelonné** :
tant que `remaining > 0`, on propose un nouveau versement.

### Affichage
1. **Récapitulatif** : 3 cartes (Montant total / Déjà payé / Reste à payer) +
   une **barre de progression** dont la largeur = `progress * 100 %`.
2. **Historique des versements** : tableau date / mode / montant.
3. **Formulaire d'ajout de versement** — affiché **uniquement si non soldé** :
   ```jsx
   {!balance.isFullyPaid && (
     <AddPaymentForm key={payments.length}
                     salaryId={salaryId}
                     remaining={balance.remaining}
                     onPaid={refresh} />
   )}
   ```
   - `key={payments.length}` : à chaque versement, le nombre de paiements
     change, donc React **remonte** le formulaire et **réinitialise** ses
     valeurs par défaut (montant = nouveau reste à payer, date = aujourd'hui).
     C'est plus simple et plus sûr qu'un `useEffect` qui resynchronise l'état.
   - Si le salaire est soldé, on affiche « ✅ intégralement payé » à la place.

---

## 4. Le sous-formulaire de versement (`AddPaymentForm`)

### État local
```js
const today = new Date().toISOString().slice(0, 10);
const [amount, setAmount]   = useState(String(remaining)); // défaut = solde restant
const [date, setDate]       = useState(today);
const [typeId, setTypeId]   = useState(PAYMENT_TYPES[0].id);
```
Le montant proposé par défaut est **le reste à payer** : un clic suffit pour
solder, mais on peut saisir moins pour un paiement partiel. Le **compte bancaire
n'est plus saisi** dans le formulaire ; `addSalaryPayment` utilise le compte par
défaut (`DEFAULT_BANK_ACCOUNT_ID`) côté service.

### Validation métier
```js
if (!value || value <= 0)         return setError("Le montant doit être positif.");
if (value > remaining + 0.001)    return setError(`Le montant dépasse le reste à payer…`);
```
On empêche de verser plus que le reste dû (la petite tolérance `0.001` absorbe
les arrondis de flottants).

### Enregistrement
```js
await addSalaryPayment(salaryId, { amount: value, date, typeId });
await onPaid(); // recharge salaire + paiements via refresh()
```

### Raccourcis « paiement en plusieurs fois »
```js
function setFraction(fraction) {
  setAmount(String(Math.round(remaining * fraction * 100) / 100));
}
```
Trois boutons (`1/4`, `1/2`, `Solde total`) pré-remplissent le montant avec une
fraction du reste à payer — pratique pour échelonner rapidement.

---

## 5. Scénario complet

```
Création                  Liste des salaires        Paiement (répétable)
─────────                 ──────────────────        ────────────────────
choisir salarié           le salaire apparaît       reste = 1200 €
montant = 1200 €    ──►    avec statut « Impayé »  → verser 300 €  → reste 900 €
"Créer le salaire →"       clic sur la ligne  ──►    → verser 600 €  → reste 300 €
                                                     → "Solde total" → reste 0 €
                                                     ✅ payé (paye = 1)
```

Chaque versement appelle `POST /salaries/:id/payments`. Quand la somme des
versements atteint le montant dû, Dolibarr passe le salaire à `paye = 1` et le
formulaire d'ajout disparaît automatiquement.

> **Note Dolibarr** : le mode de règlement envoyé (`paiementtype`) est exigé par
> l'API mais n'est pas re-persisté dans la liste des paiements (`fk_typepayment`
> revient à `0`). La colonne « Mode » peut donc afficher `—`. Voir la doc du
> [service](./salaries-service.md#6-paiements-versements).
