Voici un résumé que tu peux conserver comme fiche de référence.

---

# Manipulation des dates en Spring Boot et React/JavaScript

## 1. Manipulation des dates en Spring Boot (Java)

### a) Classe `LocalDate`

`LocalDate` représente une date sans heure (année, mois, jour). C'est le type recommandé pour les anniversaires, jours fériés, périodes de salaire, etc.

```java
LocalDate date = LocalDate.now();
```

Créer une date précise :

```java
LocalDate date = LocalDate.of(2026, 7, 5);
```

Convertir une chaîne en date :

```java
LocalDate date = LocalDate.parse("2026-07-05");
```

Convertir une date en chaîne :

```java
String s = date.toString();   // 2026-07-05
```

---

### b) Classe `LocalDateTime`

Contient la date et l'heure.

```java
LocalDateTime now = LocalDateTime.now();
```

Exemple :

```
2026-07-05T15:42:10
```

---

### c) Obtenir les différentes parties d'une date

```java
LocalDate date = LocalDate.of(2026, 7, 5);

date.getYear();        // 2026
date.getMonthValue();  // 7
date.getDayOfMonth();  // 5
date.getDayOfWeek();   // SUNDAY
```

---

### d) Ajouter ou retirer du temps

```java
date.plusDays(5);
date.minusDays(3);

date.plusWeeks(2);
date.minusWeeks(1);

date.plusMonths(1);
date.minusMonths(2);

date.plusYears(1);
```

---

### e) Comparer deux dates

```java
date1.isBefore(date2);

date1.isAfter(date2);

date1.isEqual(date2);
```

---

### f) Nombre de jours entre deux dates

```java
long jours = ChronoUnit.DAYS.between(debut, fin);
```

Exemple :

```java
LocalDate debut = LocalDate.parse("2026-07-01");
LocalDate fin = LocalDate.parse("2026-07-31");

long jours = ChronoUnit.DAYS.between(debut, fin) + 1;
```

Le `+1` permet d'inclure le dernier jour.

---

### g) Nombre de semaines

```java
long semaines = ChronoUnit.WEEKS.between(debut, fin);
```

Ou :

```java
double semaines = ChronoUnit.DAYS.between(debut, fin) / 7.0;
```

---

### h) Parcourir toutes les dates d'une période

```java
LocalDate courant = debut;

while (!courant.isAfter(fin)) {

    System.out.println(courant);

    courant = courant.plusDays(1);
}
```

Très utile pour :

* compter les jours ouvrés ;
* détecter les jours fériés ;
* calculer un salaire.

---

### i) Formater une date

```java
DateTimeFormatter formatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy");

String s = date.format(formatter);
```

Résultat :

```
05/07/2026
```

---

## 2. Manipulation des dates avec React / JavaScript

JavaScript utilise l'objet `Date`.

### a) Date actuelle

```javascript
const date = new Date();
```

---

### b) Créer une date

```javascript
const date = new Date("2026-07-05");
```

---

### c) Obtenir les différentes parties

```javascript
date.getFullYear();

date.getMonth();       // 0 = janvier

date.getDate();

date.getDay();         // 0 = dimanche
```

Attention :

```
Janvier = 0
Février = 1
...
Décembre = 11
```

---

### d) Ajouter des jours

```javascript
const date = new Date();

date.setDate(date.getDate() + 5);
```

---

### e) Différence entre deux dates

```javascript
const debut = new Date("2026-07-01");
const fin = new Date("2026-07-31");

const diff =
    fin.getTime() - debut.getTime();

const jours =
    diff / (1000 * 60 * 60 * 24);
```

---

### f) Comparaison

```javascript
if (date1 > date2) {

}

if (date1 < date2) {

}
```

---

### g) Transformer une date pour un `<input type="date">`

Les champs HTML utilisent le format :

```
YYYY-MM-DD
```

Obtenir ce format :

```javascript
const today =
    new Date().toISOString().split("T")[0];
```

Exemple :

```
2026-07-05
```

---

### h) Affichage français

```javascript
const date = new Date();

date.toLocaleDateString("fr-FR");
```

Résultat :

```
05/07/2026
```

---

### i) Affichage avec heure

```javascript
date.toLocaleString("fr-FR");
```

Résultat :

```
05/07/2026 14:35:18
```

---

### j) Transformer une chaîne en objet Date

```javascript
const date =
    new Date("2026-07-05");
```

---

## 3. Formats utilisés entre React et Spring Boot

Spring Boot (`LocalDate`) attend généralement :

```
2026-07-05
```

React (`<input type="date">`) renvoie également :

```
2026-07-05
```

Ils sont donc compatibles et ne nécessitent généralement aucune conversion supplémentaire.

---

## 4. Exemple de calcul du nombre de jours

### Spring Boot

```java
LocalDate debut = LocalDate.parse("2026-07-01");
LocalDate fin = LocalDate.parse("2026-07-31");

long nbJours = ChronoUnit.DAYS.between(debut, fin) + 1;
```

### React

```javascript
const debut = new Date("2026-07-01");
const fin = new Date("2026-07-31");

const nbJours =
    Math.floor(
        (fin - debut) / (1000 * 60 * 60 * 24)
    ) + 1;
```

---

## 5. Cas d'usage courants

* **Jours fériés** : utiliser `LocalDate` (Spring Boot) et des chaînes au format `YYYY-MM-DD` dans React.
* **Périodes de salaire** : calculer le nombre de jours entre `dateDébut` et `dateFin` avec `ChronoUnit.DAYS.between()`.
* **Âge d'un employé** : utiliser `Period.between(dateNaissance, LocalDate.now())`.
* **Validation** : vérifier que `dateDébut` n'est pas après `dateFin` avec `isAfter()` ou `isBefore()`.
* **Affichage** : conserver le format `YYYY-MM-DD` pour les échanges entre le frontend et le backend, et utiliser `toLocaleDateString()` (React) ou `DateTimeFormatter` (Spring Boot) pour un affichage adapté à l'utilisateur.

---

# Compléments (à connaître en plus)

Cette section ajoute les manipulations qui manquaient au-dessus et qui reviennent
souvent dans le projet (jours fériés, salaires, jours ouvrés).

## 6. Compléments Spring Boot (Java)

### a) Jour de la semaine et détection du week-end

```java
DayOfWeek jour = date.getDayOfWeek();          // MONDAY … SUNDAY

boolean estWeekend =
    jour == DayOfWeek.SATURDAY || jour == DayOfWeek.SUNDAY;
```

Le numéro du jour (1 = lundi, 7 = dimanche) :

```java
int numero = date.getDayOfWeek().getValue();
```

### b) Âge / durée entre deux dates avec `Period`

`ChronoUnit.DAYS.between()` donne un nombre de jours ; `Period` donne années / mois / jours.

```java
Period p = Period.between(dateNaissance, LocalDate.now());

int annees = p.getYears();
int mois   = p.getMonths();
int jours  = p.getDays();
```

### c) Premier / dernier jour du mois

```java
LocalDate premier = date.withDayOfMonth(1);

LocalDate dernier =
    date.withDayOfMonth(date.lengthOfMonth());   // 28, 29, 30 ou 31
```

Avec `TemporalAdjusters` (plus lisible) :

```java
LocalDate premier = date.with(TemporalAdjusters.firstDayOfMonth());
LocalDate dernier = date.with(TemporalAdjusters.lastDayOfMonth());
```

Nombre de jours dans le mois / année bissextile :

```java
int nbJoursMois = date.lengthOfMonth();
boolean bissextile = date.isLeapYear();
```

### d) Compter les jours ouvrés (lundi → vendredi)

```java
long joursOuvres = debut.datesUntil(fin.plusDays(1))
    .filter(d -> d.getDayOfWeek() != DayOfWeek.SATURDAY
              && d.getDayOfWeek() != DayOfWeek.SUNDAY)
    .count();
```

`datesUntil(fin)` **exclut** la borne de fin : on ajoute `plusDays(1)` pour l'inclure.

### e) Convertir un timestamp Unix (Dolibarr) en `LocalDate`

Dolibarr renvoie souvent des dates en **secondes** (timestamp Unix).

```java
LocalDate date = Instant.ofEpochSecond(timestamp)
    .atZone(ZoneId.systemDefault())
    .toLocalDate();
```

### f) Comparer deux dates en ignorant l'heure

Deux `LocalDateTime` peuvent différer par l'heure. Pour comparer le **jour seul** :

```java
boolean memeJour = dt1.toLocalDate().isEqual(dt2.toLocalDate());
```

### g) Formatage avec la locale française (mois/jour en toutes lettres)

```java
DateTimeFormatter f = DateTimeFormatter
    .ofPattern("EEEE dd MMMM yyyy", Locale.FRENCH);

String s = date.format(f);   // "dimanche 05 juillet 2026"
```

---

## 7. Compléments React / JavaScript

### a) Piège : `new Date("YYYY-MM-DD")` est interprété en **UTC**

```javascript
new Date("2026-07-05");   // minuit UTC → peut afficher le 04/07 le soir en France
```

Pour rester sur la date locale, construire à partir des composants :

```javascript
const [y, m, d] = "2026-07-05".split("-").map(Number);
const date = new Date(y, m - 1, d);   // minuit LOCAL, mois 0-indexé
```

### b) Détecter un week-end

```javascript
function estWeekend(date) {
  const jour = date.getDay();       // 0 = dimanche, 6 = samedi
  return jour === 0 || jour === 6;
}
```

### c) Ajouter des mois / années proprement

```javascript
const d = new Date("2026-07-05");

d.setMonth(d.getMonth() + 1);       // + 1 mois
d.setFullYear(d.getFullYear() + 1); // + 1 an
```

Attention : `setMonth(...+1)` sur le 31 janvier peut « déborder » sur mars.

### d) Premier / dernier jour du mois

```javascript
const premier = new Date(annee, mois, 1);
const dernier = new Date(annee, mois + 1, 0);   // jour 0 = dernier jour du mois précédent
const nbJours = dernier.getDate();              // nombre de jours du mois
```

### e) Différence en mois

```javascript
function moisEntre(debut, fin) {
  return (fin.getFullYear() - debut.getFullYear()) * 12
       + (fin.getMonth() - debut.getMonth());
}
```

### f) Parcourir toutes les dates d'une période (équivalent de la boucle Java)

```javascript
function joursDeLaPeriode(debut, fin) {
  const jours = [];
  const courant = new Date(debut);
  while (courant <= fin) {
    jours.push(new Date(courant));
    courant.setDate(courant.getDate() + 1);
  }
  return jours;
}
```

### g) Comparer deux dates au jour près

Un `<input type="date">` renvoie une chaîne `"YYYY-MM-DD"` : comparer directement les
chaînes fonctionne car ce format est **trié dans l'ordre chronologique**.

```javascript
"2026-07-05" < "2026-07-10";   // true — comparaison alphabétique = chronologique
```

Sur des objets `Date`, comparer les seules dates :

```javascript
function memeJour(a, b) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
```

### h) Affichage « long » en français

```javascript
new Date("2026-07-05").toLocaleDateString("fr-FR", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
// "dimanche 5 juillet 2026"
```

---

## 8. Récapitulatif des correspondances Java ⇄ JavaScript

| Besoin                        | Spring Boot (Java)                         | React (JavaScript)                          |
|-------------------------------|--------------------------------------------|---------------------------------------------|
| Date du jour                  | `LocalDate.now()`                          | `new Date()`                                |
| Jour de la semaine            | `date.getDayOfWeek()`                      | `date.getDay()` (0 = dimanche)              |
| Nb de jours entre 2 dates     | `ChronoUnit.DAYS.between(a, b)`            | `(b - a) / 86400000`                        |
| Ajouter des jours             | `date.plusDays(n)`                         | `date.setDate(date.getDate() + n)`          |
| Dernier jour du mois          | `date.lengthOfMonth()`                     | `new Date(y, m + 1, 0).getDate()`           |
| Année bissextile              | `date.isLeapYear()`                        | `new Date(y, 1, 29).getMonth() === 1`       |
| Format `YYYY-MM-DD`           | `date.toString()`                          | `date.toISOString().slice(0, 10)`           |
| Mois indexé                   | 1 = janvier                                | 0 = janvier                                 |

---

## 9. Manipulation des dates en SQLite

SQLite **n'a pas de vrai type "date"**. Les dates sont stockées dans l'un de
ces trois formats, puis manipulées avec des fonctions dédiées :

* **TEXT** au format ISO 8601 : `"2026-07-05"` ou `"2026-07-05 15:42:10"` — **recommandé** ;
* **INTEGER** : timestamp Unix (secondes depuis 1970) ;
* **REAL** : jour julien.

Le format TEXT `YYYY-MM-DD` est le plus pratique : il se trie et se compare
comme du texte tout en restant chronologique (comme côté React/Spring Boot).

### a) Les 5 fonctions de base

```sql
date('now');                    -- '2026-07-05'          (date seule)
time('now');                    -- '15:42:10'            (heure seule)
datetime('now');                -- '2026-07-05 15:42:10' (date + heure)
julianday('now');               -- 2461...               (jour julien, pour les calculs)
strftime('%Y-%m-%d', 'now');    -- '2026-07-05'          (format personnalisé)
```

> Attention : `'now'` renvoie l'heure **UTC**. Pour l'heure locale, ajouter le
> modificateur `'localtime'` : `datetime('now', 'localtime')`.

### b) Date du jour / date précise

```sql
SELECT date('now');                 -- aujourd'hui (UTC)
SELECT date('now', 'localtime');    -- aujourd'hui (heure locale)
SELECT date('2026-07-05');          -- normalise une chaîne en date
```

### c) Ajouter ou retirer du temps (modificateurs)

On enchaîne des modificateurs dans `date()` / `datetime()` :

```sql
SELECT date('2026-07-05', '+5 days');       -- 2026-07-10
SELECT date('2026-07-05', '-3 days');       -- 2026-07-02
SELECT date('2026-07-05', '+2 months');     -- 2026-09-05
SELECT date('2026-07-05', '+1 year');       -- 2027-07-05
SELECT datetime('2026-07-05', '+90 minutes');
```

Modificateurs cumulables : `'+1 month'`, `'-7 days'`, `'+1 year'`, `'+2 hours'`…

### d) Premier / dernier jour du mois

```sql
-- Premier jour du mois
SELECT date('2026-07-05', 'start of month');            -- 2026-07-01

-- Dernier jour du mois (1er du mois suivant, moins 1 jour)
SELECT date('2026-07-05', 'start of month', '+1 month', '-1 day');  -- 2026-07-31

-- Premier jour de l'année
SELECT date('2026-07-05', 'start of year');             -- 2026-01-01
```

### e) Extraire une partie d'une date (`strftime`)

```sql
SELECT strftime('%Y', '2026-07-05');   -- '2026'  année
SELECT strftime('%m', '2026-07-05');   -- '07'    mois
SELECT strftime('%d', '2026-07-05');   -- '05'    jour
SELECT strftime('%w', '2026-07-05');   -- '0'     jour de semaine (0 = dimanche)
SELECT strftime('%W', '2026-07-05');   -- numéro de semaine dans l'année
SELECT strftime('%j', '2026-07-05');   -- jour de l'année (001–366)
SELECT strftime('%Y-%m', '2026-07-05');-- '2026-07' (regroupement par mois)
```

Principaux motifs : `%Y` année, `%m` mois, `%d` jour, `%H` heure, `%M` minute,
`%S` seconde, `%w` jour de semaine, `%j` jour de l'année.

### f) Nombre de jours entre deux dates

`julianday()` convertit en nombre de jours → une simple soustraction suffit :

```sql
SELECT julianday('2026-07-31') - julianday('2026-07-01');       -- 30.0

-- En entier (nombre de jours pleins)
SELECT CAST(julianday('2026-07-31') - julianday('2026-07-01') AS INTEGER);  -- 30
```

Différence en heures / minutes :

```sql
SELECT (julianday('2026-07-05 18:00') - julianday('2026-07-05 12:00')) * 24;   -- 6.0 heures
```

### g) Détecter un week-end

```sql
-- %w : 0 = dimanche, 6 = samedi
SELECT CASE
         WHEN strftime('%w', '2026-07-05') IN ('0', '6') THEN 'week-end'
         ELSE 'jour de semaine'
       END;
```

### h) Comparaisons et filtres (WHERE)

Le format TEXT `YYYY-MM-DD` se compare directement (ordre chronologique) :

```sql
-- Jours fériés entre deux dates (bornes incluses)
SELECT * FROM jour_ferie
WHERE date BETWEEN '2026-01-01' AND '2026-12-31'
ORDER BY date;

-- Enregistrements du mois courant
SELECT * FROM salaire
WHERE strftime('%Y-%m', date_paiement) = strftime('%Y-%m', 'now');

-- Dates à venir
SELECT * FROM jour_ferie
WHERE date >= date('now')
ORDER BY date
LIMIT 1;                       -- prochain jour férié
```

### i) Regrouper par mois / année (agrégation)

```sql
-- Total des salaires payés par mois
SELECT strftime('%Y-%m', date_paiement) AS mois,
       SUM(montant)                     AS total
FROM paiement
GROUP BY mois
ORDER BY mois;
```

### j) Timestamp Unix ⇄ date lisible

Utile car certaines API (dont Dolibarr) stockent des timestamps en secondes :

```sql
-- Unix (secondes) → texte lisible
SELECT datetime(1751725330, 'unixepoch');               -- '2025-07-05 15:42:10'
SELECT datetime(1751725330, 'unixepoch', 'localtime');  -- en heure locale

-- Texte → Unix (secondes)
SELECT strftime('%s', '2026-07-05 15:42:10');           -- '1783... '
```

### k) Âge / durée en années

```sql
-- Âge à partir d'une date de naissance
SELECT (strftime('%Y', 'now') - strftime('%Y', date_naissance))
     - (strftime('%m-%d', 'now') < strftime('%m-%d', date_naissance)) AS age;
```

La seconde ligne retranche 1 an si l'anniversaire n'est pas encore passé cette année.

### l) Récapitulatif SQLite

| Besoin                        | SQLite                                                      |
|-------------------------------|-------------------------------------------------------------|
| Date du jour                  | `date('now')` (ou `date('now','localtime')`)                |
| Jour de la semaine            | `strftime('%w', d)` (0 = dimanche)                          |
| Nb de jours entre 2 dates     | `julianday(b) - julianday(a)`                               |
| Ajouter des jours             | `date(d, '+n days')`                                        |
| Dernier jour du mois          | `date(d, 'start of month', '+1 month', '-1 day')`           |
| Extraire l'année / le mois    | `strftime('%Y', d)` / `strftime('%m', d)`                   |
| Regrouper par mois            | `GROUP BY strftime('%Y-%m', d)`                             |
| Unix → date                   | `datetime(ts, 'unixepoch')`                                 |
| Format `YYYY-MM-DD`           | `strftime('%Y-%m-%d', d)` ou `date(d)`                      |
