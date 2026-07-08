import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  listEmployees,
  createSalary,
  getSalary,
  listSalaryPayments,
  addSalaryPayment,
  computeSalaryBalance,
  formatMoney,
  formatDate,
  paymentTypeLabel,
  PAYMENT_TYPES,
} from "./salariesService";
import "./salaries.css";

/* ════════════════════════════════════════════════════════════════════
   SalaryCreatePayPage
   ────────────────────────────────────────────────────────────────────
   Page polyvalente à deux modes, pilotée par l'URL :

     /fo/salaries/nouveau            → MODE CRÉATION
                                       (formulaire de salaire ; après
                                        création on bascule en paiement)
     /fo/salaries/:id/payer          → MODE PAIEMENT
                                       (un salaire existe déjà : on ajoute
                                        des versements, éventuellement en
                                        plusieurs fois jusqu'au solde)

   Le composant orchestre l'enchaînement ; le travail réseau et les
   calculs (reste à payer) sont délégués à salariesService.
   ════════════════════════════════════════════════════════════════════ */

export default function SalaryCreatePayPage() {
  const { id: salaryIdFromUrl } = useParams();
  const navigate = useNavigate();

  return salaryIdFromUrl ? (
    <PaymentMode salaryId={salaryIdFromUrl} onBack={() => navigate("/fo/salaries/liste")} />
  ) : (
    // Après création, on enchaîne directement sur le paiement du salaire créé.
    <CreationMode
      onCreated={(newId) => navigate(`/fo/salaries/${newId}/payer`)}
      onBack={() => navigate("/fo/salaries/employes")}
    />
  );
}

/* ───────────────────────── MODE CRÉATION ───────────────────────── */

/** Valeurs initiales du formulaire de salaire. */
function emptySalaryForm(preselectedEmployeeId = "") {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  return {
    fk_user: preselectedEmployeeId,
    label: "",
    datesp: firstOfMonth, // début de période = 1er du mois courant
    dateep: today,
    amount: "",
    fk_typepayment: "", // mode de règlement
    // Bloc paiement (révélé par la case ci-dessous).
    alsoPay: false, // "Enregistrer également le paiement"
    datep: "", // date de paiement — obligatoire si alsoPay
    datev: "", // date de valeur — optionnelle (peut rester vide, pas de date du jour)
  };
}

function CreationMode({ onCreated, onBack }) {
  const [searchParams] = useSearchParams();
  const preselectedEmployeeId = searchParams.get("employe") || "";

  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(() => emptySalaryForm(preselectedEmployeeId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Charge la liste des salariés pour le menu déroulant.
  useEffect(() => {
    listEmployees({ onlyEmployees: true, status: "1", limit: 200 })
      .then(setEmployees)
      .catch((err) => setError(err.message));
  }, []);

  function updateField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  /** Petit libellé auto si l'utilisateur n'en saisit pas. */
  function suggestedLabel() {
    const emp = employees.find((e) => String(e.id) === String(form.fk_user));
    const period = form.datesp ? ` ${form.datesp.slice(0, 7)}` : "";
    return emp ? `Salaire ${emp.fullName}${period}` : "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const amount = Number(form.amount);
    if (!form.fk_user) return setError("Veuillez choisir un salarié.");
    if (!amount || amount <= 0)
      return setError("Le montant doit être supérieur à zéro.");

    // Si on enregistre aussi le paiement, le mode et la date sont requis.
    if (form.alsoPay) {
      if (!form.fk_typepayment)
        return setError("Choisissez un mode de règlement pour enregistrer le paiement.");
      if (!form.datep) return setError("La date de paiement est obligatoire.");
    }

    setSubmitting(true);
    try {
      const newId = await createSalary({
        fk_user: form.fk_user,
        label: form.label.trim() || suggestedLabel(),
        amount,
        datesp: form.datesp,
        dateep: form.dateep,
        fk_typepayment: form.fk_typepayment,
        // Dates de paiement / valeur portées par le salaire uniquement quand
        // on enregistre le paiement dans la foulée (sinon laissées vides).
        datep: form.alsoPay ? form.datep : "",
        datev: form.alsoPay ? form.datev : "",
      });

      // Paiement TOTAL avec le MÊME mode de règlement que le salaire.
      if (form.alsoPay) {
        await addSalaryPayment(newId, {
          amount,
          date: form.datep,
          typeId: Number(form.fk_typepayment),
        });
      }

      onCreated(newId);
    } catch (err) {
      setError(err.message || "Erreur lors de la création du salaire.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sal-page">
      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">Nouveau salaire</h1>
          <p className="sal-page__subtitle">
            Créez le salaire dû. Cochez « Enregistrer également le paiement »
            pour régler le montant total dans la foulée.
          </p>
        </div>
        <button className="sal-btn sal-btn--ghost" onClick={onBack}>
          Retour
        </button>
      </header>

      <form className="sal-card" onSubmit={handleSubmit}>
        <h2 className="sal-card__title">Détails du salaire</h2>

        {error && <div className="sal-msg sal-msg--error">{error}</div>}

        <div className="sal-grid">
          <div className="sal-field">
            <label htmlFor="fk_user">Salarié *</label>
            <select
              id="fk_user"
              className="sal-select"
              value={form.fk_user}
              onChange={(e) => updateField("fk_user", e.target.value)}
              required
            >
              <option value="">— Choisir —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} {emp.job ? `(${emp.job})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="sal-field">
            <label htmlFor="label">Libellé</label>
            <input
              id="label"
              className="sal-input"
              type="text"
              placeholder={suggestedLabel() || "Libellé du salaire"}
              value={form.label}
              onChange={(e) => updateField("label", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="datesp">Début de période</label>
            <input
              id="datesp"
              className="sal-input"
              type="date"
              value={form.datesp}
              onChange={(e) => updateField("datesp", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="dateep">Fin de période</label>
            <input
              id="dateep"
              className="sal-input"
              type="date"
              value={form.dateep}
              onChange={(e) => updateField("dateep", e.target.value)}
            />
          </div>

          <div className="sal-field">
            <label htmlFor="amount">Montant (€) *</label>
            <input
              id="amount"
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

          <div className="sal-field">
            <label htmlFor="fk_typepayment">
              Mode de règlement {form.alsoPay ? "*" : ""}
            </label>
            <select
              id="fk_typepayment"
              className="sal-select"
              value={form.fk_typepayment}
              onChange={(e) => updateField("fk_typepayment", e.target.value)}
            >
              <option value="">— Non précisé —</option>
              {PAYMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Case "Enregistrer également le paiement" */}
        <label className="sal-checkbox" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={form.alsoPay}
            onChange={(e) => updateField("alsoPay", e.target.checked)}
          />
          Enregistrer également le paiement (montant total, même mode de règlement)
        </label>

        {/* Bloc paiement, affiché uniquement si la case est cochée */}
        {form.alsoPay && (
          <div className="sal-grid" style={{ marginTop: 16 }}>
            <div className="sal-field">
              <label htmlFor="datep">Date de paiement *</label>
              <input
                id="datep"
                className="sal-input"
                type="date"
                value={form.datep}
                onChange={(e) => updateField("datep", e.target.value)}
                required
              />
            </div>

            <div className="sal-field">
              <label htmlFor="datev">Date de valeur (optionnelle)</label>
              <input
                id="datev"
                className="sal-input"
                type="date"
                value={form.datev}
                onChange={(e) => updateField("datev", e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="sal-actions">
          <button type="submit" className="sal-btn sal-btn--primary" disabled={submitting}>
            {submitting
              ? "Enregistrement…"
              : form.alsoPay
              ? "Créer le salaire et le paiement"
              : "Créer le salaire"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── MODE PAIEMENT ───────────────────────── */

function PaymentMode({ salaryId, onBack }) {
  const [salary, setSalary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Incrémenté après chaque versement pour re-déclencher le chargement.
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Effet de chargement du salaire + ses paiements. Se relance quand
   * `refreshKey` change (après l'ajout d'un versement). Les setState
   * n'ont lieu qu'après l'await → pas de rendu en cascade.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, p] = await Promise.all([
          getSalary(salaryId),
          listSalaryPayments(salaryId),
        ]);
        if (!cancelled) {
          setSalary(s);
          setPayments(p);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossible de charger le salaire.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salaryId, refreshKey]);

  /** Appelé après un versement : relance le chargement des données. */
  function refresh() {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }

  if (loading) return <div className="sal-page sal-loading">Chargement du salaire…</div>;
  if (error && !salary)
    return (
      <div className="sal-page">
        <div className="sal-msg sal-msg--error">{error}</div>
        <button className="sal-btn sal-btn--ghost" onClick={onBack}>Retour</button>
      </div>
    );

  // Calcul central : total / déjà payé / reste à payer.
  const balance = computeSalaryBalance(salary, payments);

  return (
    <div className="sal-page">
      <header className="sal-page__header">
        <div>
          <h1 className="sal-page__title">{salary.label || `Salaire #${salary.id}`}</h1>
          <p className="sal-page__subtitle">
            Période {formatDate(salary.periodStart)} - {formatDate(salary.periodEnd)}
          </p>
        </div>
        <button className="sal-btn sal-btn--ghost" onClick={onBack}>Retour</button>
      </header>

      {/* 1) Formulaire d'ajout de versement (en premier).
           key={payments.length} : on remonte le formulaire après chaque
           versement pour réinitialiser ses valeurs par défaut (montant =
           nouveau reste à payer, date = aujourd'hui). */}
      {!balance.isFullyPaid && (
        <AddPaymentForm
          key={payments.length}
          salaryId={salaryId}
          remaining={balance.remaining}
          onPaid={refresh}
        />
      )}

      {/* 2) État du règlement */}
      <div className="sal-card">
        <h2 className="sal-card__title">État du règlement</h2>

        <div className="sal-balance">
          <div className="sal-balance__item">
            <div className="sal-balance__label">Montant total</div>
            <div className="sal-balance__value">{formatMoney(balance.total)}</div>
          </div>
          <div className="sal-balance__item">
            <div className="sal-balance__label">Déjà payé</div>
            <div className="sal-balance__value">{formatMoney(balance.paid)}</div>
          </div>
          <div className="sal-balance__item">
            <div className="sal-balance__label">Reste à payer</div>
            <div className="sal-balance__value sal-balance__value--remaining">
              {formatMoney(balance.remaining)}
            </div>
          </div>
        </div>

        <div className="sal-progress">
          <div
            className="sal-progress__bar"
            style={{ width: `${Math.round(balance.progress * 100)}%` }}
          />
        </div>

        {balance.isFullyPaid && (
          <div className="sal-msg sal-msg--ok" style={{ marginTop: 16 }}>
            Ce salaire est intégralement payé.
          </div>
        )}
      </div>

      {/* 3) Historique des versements */}
      <div className="sal-card">
        <h2 className="sal-card__title">Versements ({payments.length})</h2>
        {payments.length === 0 ? (
          <div className="sal-empty">Aucun versement pour l'instant.</div>
        ) : (
          <table className="sal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th className="sal-table__num">Montant</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>{paymentTypeLabel(p.typeId)}</td>
                  <td className="sal-table__num">{formatMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ───────────── Sous-formulaire : ajouter un versement ───────────── */

function AddPaymentForm({ salaryId, remaining, onPaid }) {
  const today = new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(today);
  const [typeId, setTypeId] = useState(PAYMENT_TYPES[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const value = Number(amount);
    if (!value || value <= 0) return setError("Le montant doit être positif.");
    if (value > remaining + 0.001)
      return setError(`Le montant dépasse le reste à payer (${formatMoney(remaining)}).`);

    setSubmitting(true);
    try {
      await addSalaryPayment(salaryId, {
        amount: value,
        date,
        typeId,
      });
      await onPaid(); // recharge salaire + paiements
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement du paiement.");
    } finally {
      setSubmitting(false);
    }
  }

  /** Pré-remplit le champ montant avec une fraction du reste à payer. */
  function setFraction(fraction) {
    setAmount(String(Math.round(remaining * fraction * 100) / 100));
  }

  return (
    <form className="sal-card" onSubmit={handleSubmit}>
      <h2 className="sal-card__title">Ajouter un versement</h2>

      {error && <div className="sal-msg sal-msg--error">{error}</div>}

      <div className="sal-grid">
        <div className="sal-field">
          <label htmlFor="pay-amount">Montant du versement (€)</label>
          <input
            id="pay-amount"
            className="sal-input"
            type="number"
            min="0"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="sal-field">
          <label htmlFor="pay-date">Date du versement</label>
          <input
            id="pay-date"
            className="sal-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="sal-field">
          <label htmlFor="pay-type">Mode de règlement</label>
          <select
            id="pay-type"
            className="sal-select"
            value={typeId}
            onChange={(e) => setTypeId(Number(e.target.value))}
          >
            {PAYMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Raccourcis pour le paiement en plusieurs fois. */}
      <div className="sal-actions">
        <button type="button" className="sal-btn sal-btn--ghost" onClick={() => setFraction(0.25)}>
          1/4
        </button>
        <button type="button" className="sal-btn sal-btn--ghost" onClick={() => setFraction(0.5)}>
          1/2
        </button>
        <button type="button" className="sal-btn sal-btn--ghost" onClick={() => setFraction(1)}>
          Solde total
        </button>

        <button type="submit" className="sal-btn sal-btn--primary" disabled={submitting}>
          {submitting ? "Enregistrement…" : "Enregistrer le versement"}
        </button>
      </div>
    </form>
  );
}
