import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { listEmployees, getEmployeDetailById } from "./salariesService";
import "./salaries.css";

/* ════════════════════════════════════════════════════════════════════
   EmployeeListPage
   ────────────────────────────────────────────────────────────────────
   Affiche la liste des salariés avec un formulaire de recherche
   multi-critères. La logique réseau vit dans salariesService ; ce
   composant ne s'occupe que de l'état de l'UI (critères, chargement,
   erreurs) et du rendu.
   ════════════════════════════════════════════════════════════════════ */

/** Critères de recherche par défaut (formulaire vide). */
const EMPTY_CRITERIA = {
  search: "",
  job: "",
  email: "",
  onlyEmployees: true,
  status: "1", // par défaut, on ne montre que les salariés actifs
  withPhotos: true, // on affiche l'avatar de chaque salarié dans la liste
};

export default function EmployeeListPage() {
  const navigate = useNavigate();

  // `criteria`       = ce que l'utilisateur saisit dans le formulaire.
  // `activeCriteria` = les critères réellement appliqués à la recherche.
  // `trigger`        = compteur incrémenté à chaque recherche pour
  //                    (re)lancer l'effet de chargement.
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA);
  const [activeCriteria, setActiveCriteria] = useState(EMPTY_CRITERIA);
  const [trigger, setTrigger] = useState(0);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Effet de chargement : se relance à chaque changement de `trigger`.
   * Le setState n'a lieu qu'APRÈS l'await (pas de rendu en cascade), et
   * `cancelled` ignore une réponse obsolète si la recherche est relancée.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listEmployees(activeCriteria);
        if (!cancelled) setEmployees(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Erreur lors de la recherche.");
          setEmployees([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trigger, activeCriteria]);

  /** Redirige vers la page de création d'un salaire, salarié pré-sélectionné. */
  function createSalaryFor(employee) {
    navigate(`/fo/salaries/nouveau?employe=${employee.id}`);
  }

  async function handleDetail(e) {
    navigate(`/fo/salaries/detail/${e}`)
  }

  return (
    <div className="sal-page">

      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">Salariés</h1>
        </div>
        {/* <button
          className="sal-btn sal-btn--primary"
          onClick={() => navigate("/fo/salaries/nouveau")}
        >
          + Nouveau salaire
        </button> */}
      </header>

      {/* ── Résultats ── */}
      <div className="sal-card">
        <h2 className="sal-card__title">
          Résultats {!loading && `(${employees.length})`}
        </h2>

        {error && <div className="sal-msg sal-msg--error">{error}</div>}

        {loading ? (
          <div className="sal-loading">Chargement…</div>
        ) : employees.length === 0 ? (
          <div className="sal-empty">Aucun salarié ne correspond aux critères.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sal-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Login</th>
                  <th>Poste</th>
                  <th>Statut</th>
                  <th>Lien</th>
                  {/* <th></th> */}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <div className="sal-name">
                        {emp.photoUrl ? (
                          <img className="sal-avatar" src={emp.photoUrl} alt="" />
                        ) : (
                          <span className="sal-avatar sal-avatar--empty" />
                        )}
                        {emp.fullName}
                      </div>
                    </td>
                    <td>{emp.login}</td>
                    <td>{emp.job || "—"}</td>
                    <td>
                      <span
                        className={`sal-badge ${
                          emp.isActive ? "sal-badge--ok" : "sal-badge--muted"
                        }`}
                      >
                        {emp.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td>
                      <button className="sal-btn sal-btn--ghost" onClick={() => handleDetail(emp.id)}>D&eacute;tail</button>
                    </td>
                    {/* <td>
                      <button
                        className="sal-btn sal-btn--ghost"
                        onClick={() => createSalaryFor(emp)}
                      >
                        Créer un salaire
                      </button>
                    </td> */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
