import {
  listSalaries,
  listEmployees,
  toNumber,
} from "../../FO/salaries/salariesService";

/* ════════════════════════════════════════════════════════════════════
   dashboardService.js
   ────────────────────────────────────────────────────────────────────
   Agrégations statistiques pour le tableau de bord du Back Office.
   Réutilise la couche d'accès `salariesService` (aucun appel API en dur
   ici) et se concentre sur le CALCUL : regroupements et sommes.

   Deux indicateurs :
     1) Montant de salaire par genre   → getSalaryAmountByGender()
     2) Montant de salaire par mois     → getSalaryAmountByMonth()
        (référence = date de début du salaire, `datesp`)
   ════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────── Genres ─────────────────────────── */

/**
 * Genres connus de Dolibarr + le cas "non renseigné" (valeur vide).
 * L'ordre fixe ici détermine l'ordre d'affichage des barres.
 */
export const GENDERS = [
  { key: "man", label: "Homme" },
  { key: "woman", label: "Femme" },
  { key: "", label: "Non renseigné" },
];

/**
 * Libellé lisible d'un genre Dolibarr.
 * @param {string} key  "man" | "woman" | "" | autre
 * @returns {string}
 */
export function genderLabel(key) {
  const found = GENDERS.find((g) => g.key === (key || ""));
  return found ? found.label : "Non renseigné";
}

/* ─────────────────── Helper générique d'agrégation ──────────────── */

/**
 * Regroupe une liste d'éléments par clé et somme une valeur numérique.
 * Brique de base réutilisée par les deux indicateurs.
 *
 * @template T
 * @param {T[]} items
 * @param {(item:T)=>string} keyOf      extrait la clé de regroupement
 * @param {(item:T)=>number} valueOf    extrait la valeur à sommer
 * @returns {Map<string,{ total:number, count:number }>}
 */
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

/* ─────────────── Indicateur 1 : montant par genre ───────────────── */

/**
 * Montant total des salaires regroupé par genre du salarié.
 *
 * On croise deux sources :
 *   - les salaires (montant + id du salarié) ;
 *   - les salariés (id → genre).
 *
 * @returns {Promise<Array<{ key:string, label:string,
 *                           total:number, count:number }>>}
 *          un élément par genre (Homme / Femme / Non renseigné), même à 0,
 *          pour un graphique stable.
 */
export async function getSalaryAmountByGender() {
  // On récupère salaires et salariés en parallèle.
  const [salaries, employees] = await Promise.all([
    listSalaries({ limit: 1000 }),
    listEmployees({ onlyEmployees: false, status: "", limit: 1000 }),
  ]);

  // Index id salarié → genre, pour un croisement en O(1).
  const genderByEmployee = new Map(
    employees.map((e) => [String(e.id), e.gender || ""])
  );

  // Regroupe les salaires par genre du salarié.
  const grouped = groupAndSum(
    salaries,
    (s) => genderByEmployee.get(String(s.employeeId)) ?? "",
    (s) => s.amount
  );

  // Projette sur la liste fixe des genres (garantit l'ordre et les 0).
  return GENDERS.map((g) => {
    const bucket = grouped.get(g.key) || { total: 0, count: 0 };
    return { key: g.key, label: g.label, total: bucket.total, count: bucket.count };
  });
}

/* ─────────────── Indicateur 2 : montant par mois ────────────────── */

/**
 * Convertit un timestamp Unix (secondes) en clé de mois "YYYY-MM".
 * @param {number|string} unixSeconds
 * @returns {string} ex: "2026-06" ("inconnu" si date absente)
 */
export function monthKey(unixSeconds) {
  const n = toNumber(unixSeconds);
  if (!n) return "inconnu";
  const d = new Date(n * 1000);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${month}`;
}

/**
 * Libellé lisible d'une clé de mois.
 * @param {string} key  "2026-06"
 * @returns {string}    ex: "juin 2026"
 */
export function monthLabel(key) {
  if (key === "inconnu") return "Date inconnue";
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/**
 * Montant des salaires regroupé par mois.
 * **Référence = date de début du salaire** (`datesp` → `periodStart`) :
 * chaque salaire compte une fois, sur le mois où débute sa période.
 *
 * @returns {Promise<Array<{ key:string, label:string,
 *                           total:number, count:number }>>}
 *          trié chronologiquement (du plus ancien au plus récent).
 */
export async function getSalaryAmountByMonth() {
  const salaries = await listSalaries({ limit: 1000 });

  const grouped = groupAndSum(
    salaries,
    (s) => monthKey(s.periodStart), // s.periodStart = date de début (datesp, timestamp)
    (s) => s.amount
  );

  // Map → tableau trié par clé de mois (ordre chronologique).
  return [...grouped.entries()]
    .map(([key, bucket]) => ({
      key,
      label: monthLabel(key),
      total: bucket.total,
      count: bucket.count,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ───────────────────────── Indicateurs globaux ──────────────────── */

/**
 * Quelques totaux d'en-tête à partir d'une série agrégée.
 * @param {Array<{total:number, count:number}>} series
 * @returns {{ grandTotal:number, totalCount:number }}
 */
export function summarize(series) {
  return series.reduce(
    (acc, item) => ({
      grandTotal: acc.grandTotal + toNumber(item.total),
      totalCount: acc.totalCount + (item.count || 0),
    }),
    { grandTotal: 0, totalCount: 0 }
  );
}
