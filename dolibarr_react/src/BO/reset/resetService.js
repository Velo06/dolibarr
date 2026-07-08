import {
  listSalaries,
  listAllSalaryPayments,
  listEmployees,
  deleteSalary,
  deleteSalaryPayment,
  deleteEmployee,
  deleteEmployeePhotos,
} from "../../FO/salaries/salariesService";
import { getAllJourFeries, deleteAllJourFeries } from "../../api/boot";

/* ════════════════════════════════════════════════════════════════════
   resetService.js
   ────────────────────────────────────────────────────────────────────
   Réinitialisation des données de salaires importées : on supprime
   TOUS les versements puis TOUS les salaires via les endpoints Dolibarr
   nouvellement disponibles :

     DELETE /salaries/{paymentId}/payments   (un versement)
     DELETE /salaries/salary/{id}            (un salaire)

   Ordre important : versements → salaires → salariés. On supprime les
   dépendances avant leur propriétaire (un salaire rattaché à des paiements,
   ou un salarié rattaché à des salaires, peut refuser d'être supprimé).

   Salariés supprimés = comptes `employee=1` NON administrateurs (les
   salariés importés). L'administrateur connecté est préservé.
   ════════════════════════════════════════════════════════════════════ */

/**
 * Renvoie les salariés supprimables : employés non administrateurs.
 * On exclut les admins pour ne jamais supprimer le super-utilisateur.
 * @returns {Promise<Array>} salariés normalisés
 */
async function resettableEmployees() {
  const employees = await listEmployees({ onlyEmployees: true, status: "", limit: 5000 });
  return employees.filter((e) => !e.isAdmin);
}

/**
 * Compte ce qui serait supprimé, sans rien effacer (pour l'aperçu).
 * @returns {Promise<{ salaries:number, payments:number, employees:number }>}
 */
export async function countResettableData() {
  const [salaries, payments, employees, jourFeries] = await Promise.all([
    listSalaries({ limit: 5000 }),
    listAllSalaryPayments({ limit: 5000 }),
    resettableEmployees(),
    // Jours fériés stockés dans SQLite (back Spring Boot). En cas
    // d'indisponibilité du service, on n'empêche pas l'aperçu Dolibarr.
    getAllJourFeries().catch(() => []),
  ]);
  return {
    salaries: salaries.length,
    payments: payments.length,
    employees: employees.length,
    jourFeries: jourFeries.length,
  };
}

/**
 * Supprime tous les versements puis tous les salaires.
 * Tolérant aux erreurs : un échec sur une ligne n'arrête pas le reste.
 *
 * @param {(msg:string)=>void} [onProgress]  callback de journal
 * @returns {Promise<{ paymentsDeleted:number, salariesDeleted:number,
 *                     employeesDeleted:number, photosDeleted:number,
 *                     errors:number, log:Array<{status:string,message:string}> }>}
 */
export async function resetSalariesData(onProgress = () => {}) {
  const log = [];
  const stats = {
    paymentsDeleted: 0,
    salariesDeleted: 0,
    employeesDeleted: 0,
    photosDeleted: 0,
    jourFeriesDeleted: 0,
    errors: 0,
  };

  const record = (status, message) => {
    log.push({ status, message });
    if (status === "error") stats.errors++;
    onProgress(`${status === "error" ? "[ERREUR]" : "[OK]"} ${message}`);
  };

  // 1) Versements d'abord.
  const payments = await listAllSalaryPayments({ limit: 5000 });
  for (const p of payments) {
    try {
      await deleteSalaryPayment(p.id);
      stats.paymentsDeleted++;
      record("ok", `Versement #${p.id} (${p.amount} €) supprimé.`);
    } catch (err) {
      record("error", `Versement #${p.id} : ${err.message}`);
    }
  }

  // 2) Salaires ensuite.
  const salaries = await listSalaries({ limit: 5000 });
  for (const s of salaries) {
    try {
      await deleteSalary(s.id);
      stats.salariesDeleted++;
      record("ok", `Salaire #${s.id} « ${s.label} » supprimé.`);
    } catch (err) {
      record("error", `Salaire #${s.id} : ${err.message}`);
    }
  }

  // 3) Salariés importés (employés non admin) en dernier.
  //    On efface d'abord leurs photos sur le disque (Dolibarr ne le fait
  //    pas à la suppression du compte), puis le compte lui-même.
  const employees = await resettableEmployees();
  for (const e of employees) {
    try {
      if (e.photo) {
        const n = await deleteEmployeePhotos(e.id, e.photo);
        if (n > 0) {
          stats.photosDeleted += n;
          record("ok", `Photo(s) du salarié #${e.id} supprimée(s) (${n} fichier(s)).`);
        }
      }
    } catch (err) {
      record("error", `Photos du salarié #${e.id} : ${err.message}`);
    }
    try {
      await deleteEmployee(e.id);
      stats.employeesDeleted++;
      record("ok", `Salarié #${e.id} « ${e.fullName} » (${e.login}) supprimé.`);
    } catch (err) {
      record("error", `Salarié #${e.id} : ${err.message}`);
    }
  }

  // 4) Jours fériés dans SQLite (back Spring Boot) : DELETE FROM jour_ferie.
  try {
    const deleted = await deleteAllJourFeries();
    stats.jourFeriesDeleted = deleted;
    record("ok", `Jours fériés (SQLite) supprimés (${deleted} ligne(s)).`);
  } catch (err) {
    record("error", `Jours fériés (SQLite) : ${err.message}`);
  }

  onProgress("— Réinitialisation terminée —");
  return { ...stats, log };
}
