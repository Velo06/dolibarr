import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  listEmployees,
  createSalary,
  formatMoney,
  getEmployeDetailById,
  getIntervalleNonCompris,
  calculerSalaireIntervalle
} from "./salariesService";
import "./salaries.css";

/** Valeurs fixes pour la génération multiple. */
const BULK_LABEL = "Salaire multiple";
const DEFAULT_PAYMENT_TYPE_ID = 4; // Espèces (LIQ)

function emptyFilters() {
  return { job: "", gender: "", minHours: "", maxHours: "" };
}

function emptyForm() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  return {
    datesp: firstOfMonth,
    dateep: today,
    amount: "",
  };
}

export default function GenerationSalaire() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(emptyFilters);
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // ids cochés
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { ok, errors: [{name, message}] }

  // Jours de weekend travaillés (payés). Décoché = non travaillé → non compté.
  const [estSamedi, setEstSamedi] = useState(false);
  const [estDimanche, setEstDimanche] = useState(false);

  function updateFilter(name, value) {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }
  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  /** Coche / décoche un salarié. */
  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Coche / décoche tous les salariés affichés. */
  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === employees.length
        ? new Set()
        : new Set(employees.map((e) => e.id))
    );
  }

  const allSelected =
    employees.length > 0 && selectedIds.size === employees.length;

  /** Recherche les salariés correspondant au filtre. */
  async function search() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const rows = await listEmployees({
        onlyEmployees: true,
        status: "1",
        job: filters.job,
        gender: filters.gender,
        minHours: filters.minHours,
        maxHours: filters.maxHours,
        limit: 500,
      });
      setEmployees(rows);
      // Par défaut, tous les salariés trouvés sont cochés.
      setSelectedIds(new Set(rows.map((e) => e.id)));
    } catch (err) {
      setError(err.message || "Erreur lors de la recherche des salariés.");
      setEmployees([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  // Chargement initial (aucun filtre → tous les salariés actifs).
  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Génère un salaire pour chaque salarié filtré, avec les mêmes valeurs. */
  async function handleGenerate(e) {

    e.preventDefault();
    setError("");
    setResult(null);

    // const amount = Number(form.amount);
    const selected = employees.filter((e) => selectedIds.has(e.id));
    // if (selected.length === 0)
    //   return setError("Veuillez cocher au moins un salarié.");
    // if (!form.datesp || !form.dateep)
    //   return setError("Les dates de début et de fin sont obligatoires.");
    // if (!amount || amount <= 0)
    //   return setError("Le montant doit être supérieur à zéro.");

    setSubmitting(true);
    const errors = [];
    let ok = 0;

    // Mois / année saisis dans le formulaire (input type="month" → "YYYY-MM").
    const [anneeSaisie, moisSaisi] = (form.mois || "").split("-").map(Number); // moisSaisi : 1-12

    for (const emp of selected) {
        // 1) Salaires existants de CE salarié.
        //    getEmployeDetailById renvoie TOUS les salaires → on filtre sur fk_user.
        const employee = await getEmployeDetailById(emp.id)
        const salairesEmp = (employee.salaries || []).filter(
          (s) => Number(s.fk_user) === Number(emp.id)
        );

        // 2) Liste des couples { debut, fin } dont le mois/année de la date de
        //    début (datesp) = le mois/année saisi.
        //    datesp / dateep sont des timestamps Unix (secondes) côté Dolibarr.
        const couples = salairesEmp
          .map((s) => ({
            debut: new Date(Number(s.datesp) * 1000),
            fin: new Date(Number(s.dateep) * 1000),
          }))
          .filter(
            (c) =>
              c.debut.getMonth() + 1 === moisSaisi &&
              c.debut.getFullYear() === anneeSaisie
          );
        console.log("COUPLES:", couples);

        // 3) Intervalles NON couverts du mois (les "trous" entre les salaires
        //    déjà créés), calculés sur le mois ENTIER à partir de tous les couples.
        const intervalles = getIntervalleNonCompris(couples, anneeSaisie, moisSaisi);
        console.log("INTERVALLES NON COUVERTS:", intervalles);

        // 4) Pour chaque intervalle : on calcule le salaire (jours fériés
        //    majorés) et on crée le salaire sur les bornes de l'intervalle.
        for (const it of intervalles) {
          try {
            // Salaire = (nb de jours × salaire journalier), jours fériés majorés.
            const montant = await calculerSalaireIntervalle(
              it.debut_intervalle,
              it.fin_intervalle,
              form.montant_journalier,
              form.pourcentage,
              estSamedi,
              estDimanche,
              form.pourcentage_weekend
            );

            // Création du salaire avec date début/fin = bornes de l'intervalle.
            await createSalary({
              fk_user: emp.id,
              label: BULK_LABEL,
              amount: montant,
              datesp: it.debut_intervalle,
              dateep: it.fin_intervalle,
              datev: it.fin_intervalle,
              fk_typepayment: DEFAULT_PAYMENT_TYPE_ID,
            });
            ok++;
          } catch (err) {
            errors.push({ name: emp.fullName, message: err.message || "échec" });
          }
        }
    }

    setSubmitting(false);
    setResult({ ok, errors });
  }

  return (
    <div className="sal-page">
      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">Salaire multiple</h1>
          <p className="sal-page__subtitle">
            Filtrez les salariés puis générez le même salaire (période et
            montant identiques) pour tous ceux qui correspondent.
          </p>
        </div>
        <button
          className="sal-btn sal-btn--ghost"
          onClick={() => navigate("/fo/salaries/liste")}
        >
          Voir les salaires
        </button>
      </header>

      {error && <div className="sal-msg sal-msg--error">{error}</div>}

      {/* ── 1) Filtres ── */}
      <div className="sal-card">
        <h2 className="sal-card__title">1. Filtrer les salariés</h2>

        <div className="sal-grid">
          <div className="sal-field">
            <label htmlFor="f-job">Poste</label>
            <input
              id="f-job"
              className="sal-input"
              type="text"
              placeholder="ex : Développeur"
              value={filters.job}
              onChange={(e) => updateFilter("job", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-gender">Genre</label>
            <select
              id="f-gender"
              className="sal-select"
              value={filters.gender}
              onChange={(e) => updateFilter("gender", e.target.value)}
            >
              <option value="">— Tous —</option>
              <option value="man">Homme</option>
              <option value="woman">Femme</option>
            </select>
          </div>

          <div className="sal-field">
            <label htmlFor="f-min">Heures / semaine (min)</label>
            <input
              id="f-min"
              className="sal-input"
              type="number"
              min="0"
              step="0.5"
              placeholder="ex : 20"
              value={filters.minHours}
              onChange={(e) => updateFilter("minHours", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="f-max">Heures / semaine (max)</label>
            <input
              id="f-max"
              className="sal-input"
              type="number"
              min="0"
              step="0.5"
              placeholder="ex : 39"
              value={filters.maxHours}
              onChange={(e) => updateFilter("maxHours", e.target.value)}
            />
          </div>
        </div>

        <div className="sal-actions">
          <button
            type="button"
            className="sal-btn sal-btn--ghost"
            onClick={() => {
              setFilters(emptyFilters());
            }}
            disabled={loading}
          >
            Réinitialiser
          </button>
          <button
            type="button"
            className="sal-btn sal-btn--primary"
            onClick={search}
            disabled={loading}
          >
            {loading ? "Recherche…" : "Rechercher"}
          </button>
        </div>
      </div>

      {/* ── Aperçu des salariés retenus ── */}
      <div className="sal-card">
        <h2 className="sal-card__title">
          Salariés trouvés ({employees.length}) — {selectedIds.size} sélectionné
          {selectedIds.size > 1 ? "s" : ""}
        </h2>
        {loading ? (
          <div className="sal-loading">Chargement…</div>
        ) : employees.length === 0 ? (
          <div className="sal-empty">Aucun salarié ne correspond au filtre.</div>
        ) : (
          <table className="sal-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th>Salarié</th>
                <th>Poste</th>
                <th>Genre</th>
                <th className="sal-table__num">Heures / sem.</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleOne(emp.id)}
                      aria-label={`Sélectionner ${emp.fullName}`}
                    />
                  </td>
                  <td>{emp.fullName}</td>
                  <td>{emp.job || "—"}</td>
                  <td>
                    {emp.gender === "man"
                      ? "Homme"
                      : emp.gender === "woman"
                      ? "Femme"
                      : "—"}
                  </td>
                  <td className="sal-table__num">{emp.weeklyHours || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 2) Paramètres du salaire + génération ── */}
      <form className="sal-card" onSubmit={handleGenerate}>
        <h2 className="sal-card__title">2. Salaire à générer</h2>

        <div className="sal-grid">
          <div className="sal-field">
            <label htmlFor="b-datesp">Mois et Ann&eacute;e</label>
            <input
              id="b-datesp"
              className="sal-input"
              type="month"
              value={form.mois}
              onChange={(e) => updateField("mois", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-amount">Salaire par jour</label>
            <input
              id="b-amount"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="ex: 1200"
              value={form.montant_journalier}
              onChange={(e) => updateField("montant_journalier", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-amount">Pourcentage majoration</label>
            <input
              id="b-amount"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="ex: 100%"
              value={form.pourcentage}
              onChange={(e) => updateField("pourcentage", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-pct-weekend">Pourcentage weekend</label>
            <input
              id="b-pct-weekend"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="ex: 80%"
              value={form.pourcentage_weekend}
              onChange={(e) => updateField("pourcentage_weekend", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label>Jours de weekend travaillés</label>
            <div className="sal-checkboxes">
              <label className="sal-checkbox">
                <input
                  type="checkbox"
                  checked={estSamedi}
                  onChange={(e) => setEstSamedi(e.target.checked)}
                />
                Samedi
              </label>
              <label className="sal-checkbox">
                <input
                  type="checkbox"
                  checked={estDimanche}
                  onChange={(e) => setEstDimanche(e.target.checked)}
                />
                Dimanche
              </label>
            </div>
          </div>
        </div>

        <div className="sal-actions">
          <button
            type="submit"
            className="sal-btn sal-btn--primary"
            disabled={submitting || selectedIds.size === 0}
          >
            {submitting
              ? "Génération…"
              : `Générer le salaire pour ${selectedIds.size} salarié${
                  selectedIds.size > 1 ? "s" : ""
                }`}
          </button>
        </div>
      </form>

      {/* ── Résultat ── */}
      {result && (
        <div className="sal-card">
          <h2 className="sal-card__title">Résultat</h2>
          <div className="sal-msg sal-msg--ok">
            {result.ok} salaire{result.ok > 1 ? "s" : ""} de{" "}
            {formatMoney(Number(form.amount))} généré
            {result.ok > 1 ? "s" : ""} avec succès.
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="sal-msg sal-msg--error" style={{ marginTop: 12 }}>
                {result.errors.length} échec
                {result.errors.length > 1 ? "s" : ""} :
              </div>
              <table className="sal-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Salarié</th>
                    <th>Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((er, i) => (
                    <tr key={i}>
                      <td>{er.name}</td>
                      <td>{er.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
