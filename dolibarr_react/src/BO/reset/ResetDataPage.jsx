import { useEffect, useState } from "react";

import { countResettableData, resetSalariesData } from "./resetService";
import "./reset.css";

/* ════════════════════════════════════════════════════════════════════
   ResetDataPage (Back Office)
   ────────────────────────────────────────────────────────────────────
   Réinitialise les données importées : supprime TOUS les versements, TOUS
   les salaires, puis les SALARIÉS importés (employés non administrateurs).

   Un seul bouton, puis le journal en direct des suppressions.
   ════════════════════════════════════════════════════════════════════ */

export default function ResetDataPage() {
  const [counts, setCounts] = useState(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // Charge le volume de données réinitialisables (setState après await).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await countResettableData();
        if (!cancelled) setCounts(c);
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossible de lire les données.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleReset() {
    setRunning(true);
    setError("");
    setLog([]);
    setStats(null);
    try {
      const result = await resetSalariesData((msg) => setLog((prev) => [...prev, msg]));
      setStats(result);
      setRefreshKey((k) => k + 1); // recharge les compteurs (devraient tomber à 0)
    } catch (err) {
      setError(err.message || "Erreur lors de la réinitialisation.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rst">
      <header className="rst__header">
        <h1 className="rst__title">Réinitialisation des données</h1>
        <p className="rst__subtitle">
          Supprime <strong>tous les salaires, leurs versements, les salariés
          importés</strong> (l'administrateur est conservé) <strong>et les jours
          fériés (SQLite)</strong>. Action irréversible.
        </p>
      </header>

      {error && <div className="rst__msg rst__msg--error">{error}</div>}

      {/* ── Volume concerné + bouton ── */}
      <div className="rst__card">
        <div className="rst__counts">
          <div className="rst__count">
            <div className="rst__count-value">{counts ? counts.salaries : "…"}</div>
            <div className="rst__count-label">Salaires</div>
          </div>
          <div className="rst__count">
            <div className="rst__count-value">{counts ? counts.payments : "…"}</div>
            <div className="rst__count-label">Versements</div>
          </div>
          <div className="rst__count">
            <div className="rst__count-value">{counts ? counts.employees : "…"}</div>
            <div className="rst__count-label">Salariés</div>
          </div>
          <div className="rst__count">
            <div className="rst__count-value">{counts ? counts.jourFeries : "…"}</div>
            <div className="rst__count-label">Jours fériés</div>
          </div>
        </div>

        <button className="rst__btn" onClick={handleReset} disabled={running || !counts}>
          {running ? "Suppression…" : "Réinitialiser"}
        </button>
      </div>

      {/* ── Statistiques finales ── */}
      {stats && (
        <div className="rst__card">
          <div className="rst__counts">
            <div className="rst__count">
              <div className="rst__count-value">{stats.salariesDeleted}</div>
              <div className="rst__count-label">Salaires supprimés</div>
            </div>
            <div className="rst__count">
              <div className="rst__count-value">{stats.paymentsDeleted}</div>
              <div className="rst__count-label">Versements supprimés</div>
            </div>
            <div className="rst__count">
              <div className="rst__count-value">{stats.employeesDeleted}</div>
              <div className="rst__count-label">Salariés supprimés</div>
            </div>
            <div className="rst__count">
              <div className="rst__count-value">{stats.photosDeleted}</div>
              <div className="rst__count-label">Photos supprimées</div>
            </div>
            <div className="rst__count">
              <div className="rst__count-value">{stats.jourFeriesDeleted}</div>
              <div className="rst__count-label">Jours fériés supprimés</div>
            </div>
            <div className={`rst__count ${stats.errors > 0 ? "rst__count--danger" : ""}`}>
              <div className="rst__count-value">{stats.errors}</div>
              <div className="rst__count-label">Erreurs</div>
            </div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="rst__log">
          {log.map((line, i) => (
            <div key={i} className={line.startsWith("[ERREUR]") ? "rst__log--err" : ""}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
