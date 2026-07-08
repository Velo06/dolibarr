import { useEffect, useState } from "react";

import {
  getSalaryAmountByGender,
  getSalaryAmountByMonth,
  summarize,
} from "./dashboardService";
import { formatMoney } from "../../FO/salaries/salariesService";
import "./dashboard.css";

/* ════════════════════════════════════════════════════════════════════
   DashboardPage (Back Office)
   ────────────────────────────────────────────────────────────────────
   Affiche deux indicateurs sur les salaires :
     1) Montant de salaire par genre
     2) Montant de salaire par mois (référence = date de début du salaire)

   Tout le calcul est délégué à dashboardService ; la page ne gère que le
   chargement et le rendu (cartes de synthèse + graphiques en barres).
   ════════════════════════════════════════════════════════════════════ */

export default function DashboardPage() {
  const [byGender, setByGender] = useState([]);
  const [byMonth, setByMonth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Incrémenté par le bouton "Rafraîchir" pour relancer le chargement.
  const [refreshKey, setRefreshKey] = useState(0);

  // Chargement des deux indicateurs en parallèle.
  // setState uniquement après l'await → pas de rendu en cascade.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [genders, months] = await Promise.all([
          getSalaryAmountByGender(),
          getSalaryAmountByMonth(),
        ]);
        if (!cancelled) {
          setByGender(genders);
          setByMonth(months);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Erreur de chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshKey((k) => k + 1);
  }

  // Synthèse globale : total des salaires sur l'ensemble des mois.
  const monthSummary = summarize(byMonth);
  const genderSummary = summarize(byGender);

  return (
    <div className="dash">
      <header className="dash__header">
        <div>
          <h1 className="dash__title">Tableau de bord — Salaires</h1>
          <p className="dash__subtitle">
            Répartition des montants de salaire par genre et par mois de début.
          </p>
        </div>
        <button className="dash__card" onClick={refresh} style={{ cursor: "pointer" }}>
          Rafraîchir
        </button>
      </header>

      {error && <div className="dash__msg dash__msg--error">{error}</div>}

      {loading ? (
        <div className="dash__loading">Chargement des statistiques…</div>
      ) : (
        <>
          {/* ── Cartes de synthèse ── */}
          <div className="dash__cards">
            {/* <SummaryCard
              label="Total des salaires"
              value={formatMoney(genderSummary.grandTotal)}
            /> */}
            {/* <SummaryCard
              label="Nombre de salaires"
              value={monthSummary.totalCount}
            />
            <SummaryCard
              label="Mois couverts"
              value={byMonth.length}
            /> */}
          </div>

          {/* ── Indicateur 1 : par genre (cartes) ── */}
          <section className="dash__section">
            <h2 className="dash__section-title">Montant de salaire par genre</h2>
            {byGender.length === 0 ? (
              <div className="dash__empty">Aucune donnée à afficher.</div>
            ) : (
              <div className="dash__cards">
                {byGender.map((g) => (
                  <div className="dash__card" key={g.key}>
                    <div className="dash__card-label">{g.label}</div>
                    <div className="dash__card-value">{formatMoney(g.total)}</div>
                    {/* <div className="dash__card-sub">
                      {g.count} salaire{g.count > 1 ? "s" : ""}
                    </div> */}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Indicateur 2 : par mois ── */}
          <section className="dash__section">
            <h2 className="dash__section-title">
              Montant de salaire par mois (date de début du salaire)
            </h2>
            <BarChart data={byMonth} />
          </section>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── Composants de présentation ─────────────── */

/** Petite carte "label + valeur". */
function SummaryCard({ label, value }) {
  return (
    <div className="dash__card">
      <div className="dash__card-label">{label}</div>
      <div className="dash__card-value">{value}</div>
    </div>
  );
}

/**
 * Graphique en barres horizontales, sans dépendance externe.
 * La largeur de chaque barre est proportionnelle au plus grand total
 * de la série (mise à l'échelle relative).
 *
 * @param {{ data: Array<{ key:string, label:string,
 *                         total:number, count:number }> }} props
 */
function BarChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="dash__empty">Aucune donnée à afficher.</div>;
  }

  // Échelle : 1 (évite la division par zéro si tous les totaux sont à 0).
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div>
      {data.map((d) => {
        const widthPct = Math.round((d.total / max) * 100);
        return (
          <div className="bar" key={d.key}>
            <div className="bar__label" title={d.label}>
              {d.label}
            </div>
            <div className="bar__track">
              <div className="bar__fill" style={{ width: `${widthPct}%` }} />
            </div>
            <div className="bar__value">
              {formatMoney(d.total)}{" "}
              <span className="bar__count">({d.count})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
