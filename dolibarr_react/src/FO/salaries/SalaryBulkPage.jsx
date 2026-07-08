import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  listEmployees,
  createSalary,
  formatMoney,
} from "./salariesService";
import "./salaries.css";

/** Valeurs fixes pour la génération multiple. */
const BULK_LABEL = "Salaire multiple";
const DEFAULT_PAYMENT_TYPE_ID = 4; // Espèces (LIQ)

/* ════════════════════════════════════════════════════════════════════
   SalaryBulkPage — « Salaire multiple »
   ────────────────────────────────────────────────────────────────────
   1) On filtre les salariés (poste, genre, heures de travail min/max).
   2) On saisit UNE période (début/fin) et UN montant.
   3) « Générer les salaires » crée le MÊME salaire pour tous les salariés
      retenus par le filtre.

   La création s'appuie sur createSalary() — la MÊME fonction utilisée par
   la création d'un salaire simple (SalaryCreatePayPage) et par l'import
   (importService.runImport).
   ════════════════════════════════════════════════════════════════════ */

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

export default function SalaryBulkPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(emptyFilters);
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // ids cochés
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { ok, errors: [{name, message}] }

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

    const amount = Number(form.amount);
    const selected = employees.filter((e) => selectedIds.has(e.id));
    if (selected.length === 0)
      return setError("Veuillez cocher au moins un salarié.");
    if (!form.datesp || !form.dateep)
      return setError("Les dates de début et de fin sont obligatoires.");
    if (!amount || amount <= 0)
      return setError("Le montant doit être supérieur à zéro.");

    setSubmitting(true);
    const errors = [];
    let ok = 0;

    for (const emp of selected) {
      try {
        // MÊME fonction que la création simple et l'import.
        await createSalary({
          fk_user: emp.id,
          label: BULK_LABEL,
          amount,
          datesp: form.datesp,
          dateep: form.dateep,
          datev: form.dateep,
          fk_typepayment: DEFAULT_PAYMENT_TYPE_ID,
        });
        ok++;
      } catch (err) {
        errors.push({ name: emp.fullName, message: err.message || "échec" });
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
            <label htmlFor="b-datesp">Date de début *</label>
            <input
              id="b-datesp"
              className="sal-input"
              type="date"
              value={form.datesp}
              onChange={(e) => updateField("datesp", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-dateep">Date de fin *</label>
            <input
              id="b-dateep"
              className="sal-input"
              type="date"
              value={form.dateep}
              onChange={(e) => updateField("dateep", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-amount">Montant (€) *</label>
            <input
              id="b-amount"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="ex: 1200"
              value={form.amount}
              onChange={(e) => updateField("amount", e.target.value)}
              required
            />
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
