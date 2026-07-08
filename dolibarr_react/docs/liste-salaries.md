# Fonctionnalité : Liste des salariés avec recherche multi-critères

Fichier : `src/FO/salaries/EmployeeListPage.jsx`
Route : `/fo/salaries/employes`
Dépend de : [`salariesService.js`](./salaries-service.md)

Cette page affiche les salariés de l'entreprise et permet de les filtrer selon
plusieurs critères combinés. Chaque ligne propose un bouton pour démarrer la
création d'un salaire pour ce salarié.

---

## 1. Critères par défaut

```js
const EMPTY_CRITERIA = {
  search: "",        // recherche libre : nom / prénom / login
  job: "",           // poste / fonction
  email: "",         // email contient…
  onlyEmployees: true,
  status: "1",       // par défaut : salariés actifs uniquement
};
```
Un objet unique décrit l'état « formulaire vide ». Il sert à l'initialisation
**et** au bouton « Réinitialiser », ce qui évite toute divergence.

---

## 2. Gestion d'état (3 variables clés)

```js
const [criteria, setCriteria]             = useState(EMPTY_CRITERIA); // saisie en cours
const [activeCriteria, setActiveCriteria] = useState(EMPTY_CRITERIA); // critères appliqués
const [trigger, setTrigger]               = useState(0);             // relance la recherche
```

On **distingue volontairement** :
- `criteria` : ce que l'utilisateur tape (mis à jour à chaque frappe) ;
- `activeCriteria` : ce qui est réellement envoyé à l'API (figé tant qu'on n'a
  pas cliqué sur « Rechercher »).

Cette séparation évite de relancer une requête à chaque touche du clavier.

À cela s'ajoutent `employees` (résultats), `loading` (initialisé à `true`) et
`error`.

---

## 3. L'effet de chargement

```js
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const rows = await listEmployees(activeCriteria);
      if (!cancelled) setEmployees(rows);
    } catch (err) {
      if (!cancelled) { setError(...); setEmployees([]); }
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();
  return () => { cancelled = true; };
}, [trigger, activeCriteria]);
```

Points importants :
- **Fonction asynchrone interne (IIFE)** : tous les `setState` ont lieu *après*
  le `await`. On évite ainsi les rendus en cascade que l'ESLint `react-hooks`
  signalerait si on appelait `setState` de façon synchrone dans l'effet.
- **Drapeau `cancelled`** : si l'utilisateur relance une recherche avant la fin
  de la précédente, la réponse périmée est ignorée (pas de résultat obsolète
  affiché). C'est le nettoyage retourné par l'effet qui le positionne.
- L'effet se redéclenche dès que `trigger` (ou `activeCriteria`) change.

---

## 4. Lancer une recherche

```js
function search(newCriteria) {
  setActiveCriteria(newCriteria);
  setError("");
  setLoading(true);     // setState dans un gestionnaire d'événement → autorisé
  setTrigger((t) => t + 1);
}
```

`search` est appelée depuis des **gestionnaires d'événements** (soumission du
formulaire, réinitialisation), pas depuis un effet : on peut donc y faire un
`setLoading(true)` synchrone sans déclencher l'avertissement ESLint.

```js
function handleSubmit(e) { e.preventDefault(); search(criteria); }
function handleReset()   { setCriteria(EMPTY_CRITERIA); search(EMPTY_CRITERIA); }
function updateCriterion(name, value) {
  setCriteria((prev) => ({ ...prev, [name]: value }));
}
```

`updateCriterion` est un **setter générique** : il met à jour n'importe quel
champ par son nom, ce qui évite d'écrire un handler par input.

---

## 5. Le formulaire (rendu)

Chaque champ est un input **contrôlé** relié à `criteria` via
`updateCriterion` :

```jsx
<input value={criteria.search}
       onChange={(e) => updateCriterion("search", e.target.value)} />
```

Le `<select>` Statut propose Tous / Actifs / Inactifs et la case à cocher
« Uniquement les salariés » pilote `onlyEmployees`. La soumission appelle
`handleSubmit`.

---

## 6. Le tableau de résultats

```jsx
{loading ? <Chargement…/>
  : employees.length === 0 ? <Aucun résultat/>
  : <table>…</table>}
```

Trois états visuels distincts : **chargement**, **vide**, **résultats**.

Pour chaque salarié on affiche son **avatar** (`emp.photoUrl`, sinon une pastille
vide), le nom, le login, le poste, l'email, un **badge** de statut (vert actif /
gris inactif), et le bouton d'action. La page appelle
`listEmployees({ ..., withPhotos: true })` pour que `photoUrl` soit peuplé (voir
`getEmployeePhoto` dans la [doc du service](./salaries-service.md)).

```jsx
{emp.photoUrl
  ? <img className="sal-avatar" src={emp.photoUrl} alt="" />
  : <span className="sal-avatar sal-avatar--empty" />}
<button onClick={() => createSalaryFor(emp)}>Créer un salaire</button>
```

```js
function createSalaryFor(employee) {
  navigate(`/fo/salaries/nouveau?employe=${employee.id}`);
}
```

Le salarié est passé en **paramètre d'URL** (`?employe=ID`) à la page de
création, qui le pré-sélectionnera automatiquement. C'est le lien entre les
deux fonctionnalités.

---

## Résumé du flux

```
[Critères] --handleSubmit--> search() --setTrigger--> useEffect --listEmployees()--> [Tableau]
                                                                                         |
                                                              "Créer un salaire" --------+
                                                                                         v
                                                          /fo/salaries/nouveau?employe=ID
```
