import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  listSalariesWithBalance,
  SALARY_STATUSES,
  PAYMENT_TYPES,
  paymentTypeLabel,
  formatMoney,
  formatDate,
} from "./salariesService";
import "./salaries.css";

/* ════════════════════════════════════════════════════════════════════
   SalaryListPage
   ────────────────────────────────────────────────────────────────────
   Liste TOUS les salaires avec leur état de règlement (payé / partiel /
   impayé) et un panneau de filtres multi-critères (côté client, puisque
   tous les salaires sont déjà chargés). Un clic sur une ligne ouvre
   l'interface de versement (/fo/salaries/:id/payer).
   ════════════════════════════════════════════════════════════════════ */

/** Options du filtre de statut (clé "" = tous). */
const STATUS_FILTERS = [
  { key: "", label: "Tous" },
  { key: "impaye", label: "Impayés" },
  { key: "partiel", label: "Partiellement réglés" },
  { key: "paye", label: "Payés" },
];

/** Filtres vides (état initial / réinitialisation). */
const EMPTY_FILTERS = {
  employee: "",
  label: "",
  ref: "",
  typePayment: "",
  dateStart: "",
  dateEnd: "",
  minRemaining: "",
  status: "",
};

/** Timestamp Unix (secondes) → "YYYY-MM-DD" en heure locale (comparable). */
function tsToISODate(ts) {
  const n = Number(ts);
  if (!n) return "";
  const d = new Date(n * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Test "contient" insensible à la casse. */
function contains(haystack, needle) {
  return String(haystack || "").toLowerCase().includes(needle.trim().toLowerCase());
}

/** Applique tous les filtres à un salaire enrichi. */
function matchesFilters(s, f) {
  if (f.status && s.statusKey !== f.status) return false;
  if (f.employee && !contains(s.employeeName, f.employee)) return false;
  if (f.label && !contains(s.label, f.label)) return false;
  if (f.ref && !contains(s.ref, f.ref)) return false;
  if (f.typePayment && String(s.typePaymentId) !== f.typePayment) return false;
  if (f.dateStart && tsToISODate(s.periodStart) < f.dateStart) return false;
  if (f.dateEnd && tsToISODate(s.periodEnd) > f.dateEnd) return false;
  if (f.minRemaining !== "" && s.remaining < Number(f.minRemaining)) return false;
  return true;
}

export default function SalaryListPage() {
  const navigate = useNavigate();

  const [salaries, setSalaries] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Chargement (setState après await → pas de rendu en cascade).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSalariesWithBalance();
        if (!cancelled) setSalaries(rows);
      } catch (err) {
        if (!cancelled) setError(err.message || "Erreur de chargement des salaires.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateFilter(name, value) {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }

  /** Ouvre l'interface de paiement d'un salaire. */
  function openPayment(salary) {
    navigate(`/fo/salaries/${salary.id}/payer`);
  }

  // Filtrage multi-critères (côté client).
  const visible = salaries.filter((s) => matchesFilters(s, filters));

  return (
    <div className="sal-page">
      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">Salaires</h1>
          <p className="sal-page__subtitle">
            Tous les salaires et leur état de règlement. Cliquez sur un salaire
            pour le payer.
          </p>
        </div>
        <button
          className="sal-btn sal-btn--primary"
          onClick={() => navigate("/fo/salaries/nouveau")}
        >
          + Nouveau salaire
        </button>
      </header>

      {/* ── Filtres ── */}
      <div className="sal-card">
        <h2 className="sal-card__title">Filtres</h2>
        <div className="sal-grid">
          <div className="sal-field">
            <label htmlFor="f-employee">Salarié</label>
            <input
              id="f-employee"
              className="sal-input"
              type="text"
              placeholder="Nom du salarié"
              value={filters.employee}
              onChange={(e) => updateFilter("employee", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-label">Libellé</label>
            <input
              id="f-label"
              className="sal-input"
              type="text"
              placeholder="Libellé du salaire"
              value={filters.label}
              onChange={(e) => updateFilter("label", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-ref">Référence</label>
            <input
              id="f-ref"
              className="sal-input"
              type="text"
              placeholder="Réf."
              value={filters.ref}
              onChange={(e) => updateFilter("ref", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-type">Mode de paiement</label>
            <select
              id="f-type"
              className="sal-select"
              value={filters.typePayment}
              onChange={(e) => updateFilter("typePayment", e.target.value)}
            >
              <option value="">Tous</option>
              {PAYMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="sal-field">
            <label htmlFor="f-datestart">Date début (à partir de)</label>
            <input
              id="f-datestart"
              className="sal-input"
              type="date"
              value={filters.dateStart}
              onChange={(e) => updateFilter("dateStart", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-dateend">Date fin (jusqu'à)</label>
            <input
              id="f-dateend"
              className="sal-input"
              type="date"
              value={filters.dateEnd}
              onChange={(e) => updateFilter("dateEnd", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-remaining">Montant à payer (≥)</label>
            <input
              id="f-remaining"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={filters.minRemaining}
              onChange={(e) => updateFilter("minRemaining", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-status">Statut</label>
            <select
              id="f-status"
              className="sal-select"
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sal-actions">
          <button
            type="button"
            className="sal-btn sal-btn--ghost"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      {/* ── Résultats ── */}
      <div className="sal-card">
        <h2 className="sal-card__title">
          Résultats {!loading && `(${visible.length})`}
        </h2>

        {error && <div className="sal-msg sal-msg--error">{error}</div>}

        {loading ? (
          <div className="sal-loading">Chargement…</div>
        ) : visible.length === 0 ? (
          <div className="sal-empty">Aucun salaire ne correspond aux filtres.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="sal-table">
              <thead>
                <tr>
                  <th>Réf</th>
                  <th>Salarié</th>
                  <th>Libellé</th>
                  <th>Mode</th>
                  <th>Période</th>
                  <th className="sal-table__num">Montant</th>
                  <th className="sal-table__num">Payé</th>
                  <th className="sal-table__num">Reste</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const status = SALARY_STATUSES[s.statusKey];
                  return (
                    <tr
                      key={s.id}
                      onClick={() => openPayment(s)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{s.ref}</td>
                      <td>{s.employeeName}</td>
                      <td>{s.label || "—"}</td>
                      <td>{paymentTypeLabel(s.typePaymentId)}</td>
                      <td>
                        {formatDate(s.periodStart)} - {formatDate(s.periodEnd)}
                      </td>
                      <td className="sal-table__num">{formatMoney(s.amount)}</td>
                      <td className="sal-table__num">{formatMoney(s.paid)}</td>
                      <td className="sal-table__num">{formatMoney(s.remaining)}</td>
                      <td>
                        <span className={`sal-badge sal-badge--${status.tone}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <button
                          className="sal-btn sal-btn--ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPayment(s);
                          }}
                        >
                          Payer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
