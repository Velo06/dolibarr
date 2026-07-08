import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  listEmployees,
  listAllSalaryPayments,
  computeSalaryBalance,
  addSalaryPayment,
  formatMoney,
  toNumber,
  round2,
  toApiDate,
  getPoste,
  getSalaires,
  DEFAULT_BANK_ACCOUNT_ID,
} from "./salariesService";
import "./salaries.css";
const DEFAULT_PAYMENT_TYPE_ID = 4;

function emptyForm() {
  return { mois: "", montant: "", poste_priori: "" };
}

export default function GenerationPaiement() {
  const navigate = useNavigate();

  const [postes, setPostes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await getPoste();
        const jobsDistincts = [
          ...new Set((p || []).map((x) => x.job).filter((j) => j && j.trim())),
        ].sort();
        setPostes(jobsDistincts);
        if (jobsDistincts.length) {
          setForm((prev) => ({
            ...prev,
            poste_priori: prev.poste_priori || jobsDistincts[0],
          }));
        }
      } catch (err) {
        setError(err.message || "Impossible de charger les postes.");
      }
    })();
  }, []);

  async function handleGenerate(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);

    const paid = [];
    const errors = [];

    try {
      const [anneeSaisie, moisSaisi] = (form.mois || "").split("-").map(Number);
      const postePrioritaire = form.poste_priori || "";
      let budget = round2(toNumber(form.montant));

      const salairesDuMois = await getSalaires(moisSaisi, anneeSaisie);

      const [employes, tousPaiements] = await Promise.all([
        listEmployees({ onlyEmployees: false, status: "", limit: 1000 }),
        listAllSalaryPayments({ limit: 5000 }),
      ]);
      const jobByUser = new Map(employes.map((emp) => [String(emp.id), emp.job || ""]));
      const nameByUser = new Map(employes.map((emp) => [String(emp.id), emp.fullName]));
      const paiementsBySalaire = new Map();
      for (const p of tousPaiements) {
        const k = String(p.salaryId);
        if (!paiementsBySalaire.has(k)) paiementsBySalaire.set(k, []);
        paiementsBySalaire.get(k).push(p);
      }

      const parDatesp = (a, b) => Number(a.datesp) - Number(b.datesp);
      const estPrioritaire = (s) => jobByUser.get(String(s.fk_user)) === postePrioritaire;
      const prioritaires = salairesDuMois.filter(estPrioritaire).sort(parDatesp);
      const autres = salairesDuMois.filter((s) => !estPrioritaire(s)).sort(parDatesp);
      const ordre = [...prioritaires, ...autres];

      const dateJour = toApiDate(new Date());
      for (const s of ordre) {
        if (budget <= 0) break;

        const solde = computeSalaryBalance(s, paiementsBySalaire.get(String(s.id)) || []);
        const du = solde.remaining;
        if (du <= 0) continue;

        const aPayer = round2(Math.min(du, budget));
        const name = nameByUser.get(String(s.fk_user)) || `#${s.fk_user}`;

        try {
          await addSalaryPayment(s.id, {
            amount: aPayer,
            date: dateJour,
            typeId: DEFAULT_PAYMENT_TYPE_ID,
            accountId: DEFAULT_BANK_ACCOUNT_ID,
          });
          budget = round2(budget - aPayer);
          paid.push({
            name,
            job: jobByUser.get(String(s.fk_user)) || "—",
            montant: aPayer,
            // Reste à payer sur CE salaire après ce versement.
            reste: round2(du - aPayer),
            datesp: s.datesp,
          });
        } catch (err) {
          errors.push({ name, message: err.message || "échec" });
        }
      }

      setResult({ ok: paid.length, paid, reste: budget, errors });
    } catch (err) {
      setError(err.message || "Erreur lors de la génération des paiements.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sal-page">
      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">Paiement salaire multiple</h1>
        </div>
      </header>

      {error && <div className="sal-msg sal-msg--error">{error}</div>}

      <form className="sal-card" onSubmit={handleGenerate}>
        <div className="sal-grid">
          <div className="sal-field">
            <label htmlFor="b-mois">Mois et Ann&eacute;e</label>
            <input
              id="b-mois"
              className="sal-input"
              type="month"
              value={form.mois}
              onChange={(e) => updateField("mois", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-montant">Montant total &agrave; r&eacute;partir</label>
            <input
              id="b-montant"
              className="sal-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="ex: 1200"
              value={form.montant}
              onChange={(e) => updateField("montant", e.target.value)}
              required
            />
          </div>

          <div className="sal-field">
            <label htmlFor="b-poste">Poste prioritaire</label>
            <select
              id="b-poste"
              className="sal-select"
              value={form.poste_priori}
              onChange={(e) => updateField("poste_priori", e.target.value)}
            >
              {postes.map((job) => (
                <option key={job} value={job}>
                  {job}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sal-actions">
          <button
            type="submit"
            className="sal-btn sal-btn--primary"
            disabled={submitting}
          >
            {submitting ? "Paiement…" : "Générer les paiements"}
          </button>
        </div>
      </form>

      {result && (
        <div className="sal-card">
          <h2 className="sal-card__title">R&eacute;sultat</h2>
          <div className="sal-msg sal-msg--ok">
            {result.ok} paiement{result.ok > 1 ? "s" : ""} effectu&eacute;
            {result.ok > 1 ? "s" : ""}. Reste du montant : {formatMoney(result.reste)}.
          </div>

          {result.paid.length > 0 && (
            <table className="sal-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Salari&eacute;</th>
                  <th>Poste</th>
                  <th className="sal-table__num">Montant pay&eacute;</th>
                  <th className="sal-table__num">Reste &agrave; payer</th>
                </tr>
              </thead>
              <tbody>
                {result.paid.map((p, i) => (
                  <tr key={i}>
                    <td>{p.name}</td>
                    <td>{p.job}</td>
                    <td className="sal-table__num">{formatMoney(p.montant)}</td>
                    <td className="sal-table__num">{formatMoney(p.reste)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.errors.length > 0 && (
            <>
              <div className="sal-msg sal-msg--error" style={{ marginTop: 12 }}>
                {result.errors.length} &eacute;chec{result.errors.length > 1 ? "s" : ""} :
              </div>
              <table className="sal-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Salari&eacute;</th>
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
