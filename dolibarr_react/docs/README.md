# Documentation — module Salariés & Salaires (Front Office)

Documentation du code de gestion des salariés et des salaires côté FO,
basé sur l'API REST de Dolibarr 23.

## Fonctionnalités

| Doc | Fonctionnalité | Fichier source | Route |
|-----|----------------|----------------|-------|
| [liste-salaries.md](./liste-salaries.md) | (FO) Liste des salariés + recherche multi-critères | `src/FO/salaries/EmployeeListPage.jsx` | `/fo/salaries/employes` |
| [liste-salaires.md](./liste-salaires.md) | (FO) Liste des salaires (tous statuts) → paiement | `src/FO/salaries/SalaryListPage.jsx` | `/fo/salaries/liste` |
| [creation-paiement-salaire.md](./creation-paiement-salaire.md) | (FO) Créer un salaire et le payer (en plusieurs fois) | `src/FO/salaries/SalaryCreatePayPage.jsx` | `/fo/salaries/nouveau`, `/fo/salaries/:id/payer` |
| [dashboard-bo.md](./dashboard-bo.md) | (BO) Tableau de bord : salaire par genre et par mois | `src/BO/dashboard/DashboardPage.jsx` | `/bo/dashboard` |
| [import-donnees.md](./import-donnees.md) | (BO) Import : 2 CSV (salariés/salaires) + ZIP d'images | `src/BO/import/ImportPage.jsx` | `/bo/import` |
| [reinitialisation-donnees.md](./reinitialisation-donnees.md) | (BO) Réinitialiser : supprime versements + salaires + salariés importés | `src/BO/reset/ResetDataPage.jsx` | `/bo/reset` |
| [salaries-service.md](./salaries-service.md) | Couche d'accès API + règles métier (partagée) | `src/FO/salaries/salariesService.js` | — |

## Architecture en une phrase

Les **pages** (React) ne s'occupent que de l'UI ; tous les appels API et les
calculs (reste à payer, filtres SQL, formatage) vivent dans
**`salariesService.js`**. Ainsi, un changement d'API ne touche qu'un fichier.

## Endpoints Dolibarr utilisés

```
GET  /users                    liste / recherche des salariés
GET  /users/{id}               un salarié
GET  /salaries                 liste des salaires
POST /salaries                 créer un salaire
GET  /salaries/{id}            un salaire
GET  /salaries/payments        liste des versements
POST /salaries/{id}/payments   ajouter un versement
DELETE /salaries/salary/{id}        supprimer un salaire
DELETE /salaries/{paymentId}/payments  supprimer un versement
```

## Configuration requise

Le fichier `.env` à la racine doit contenir l'URL et la clé d'API Dolibarr :

```
VITE_DOLIBARR_API_URL=http://localhost/dolibarr/api/index.php
VITE_DOLIBARR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Le module **Salaires** et le module **Banque** doivent être activés dans
Dolibarr (le paiement exige un compte bancaire, `accountid`).
