import { useEffect, useState } from 'react';
import { getEmployeDetailById, getEmployeePhoto } from './salariesService'
import {
    formatMoney,
    formatDate,
    computeSalaryBalance,
    paymentTypeLabel,
} from './salariesService';
import { useNavigate, useParams } from "react-router-dom";
import './employeeDetail.css';

/** Libellé lisible du genre Dolibarr. */
function genderLabel(gender) {
    if (gender === "man") return "Homme";
    if (gender === "woman") return "Femme";
    return "—";
}

export default function EmployeeDetailPage() {
    const { id } = useParams();
    const [user, setUser] = useState(null);
    const [salaries, setSalaries] = useState([]);
    const [payments, setPayments] = useState([]);
    const [photo, setPhoto] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            const donnee = await getEmployeDetailById(id);
            setUser(donnee.user);
            const sary = await getEmployeePhoto(id, donnee.user.photo);
            setSalaries(donnee.salaries);
            setPayments(donnee.payments);
            setPhoto(sary)
        }

        if (id) load();
    }, [id]);

    if (!user) {
        return <div className="emp-page"><div className="emp-loading">Chargement…</div></div>;
    }

    const fullName = `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.login || `#${user.id}`;
    const mySalaries = salaries.filter((s) => Number(s.fk_user) === Number(user.id));
    const totalRemaining = mySalaries.reduce((sum, salary) => {
        const salaryPayments = payments.filter(
            (p) => Number(p.fk_salary) === Number(salary.id)
        );

        const balance = computeSalaryBalance(salary, salaryPayments);

        return sum + balance.remaining;
    }, 0);

    return (
        <div className="emp-page">
            <button onClick={() => navigate("/fo/salaries/employes")}>Retour &agrave; la liste</button>

            {/* ── Carte d'identité ── */}
            <div className="emp-hero">
                {/* <div className="emp-avatar">{initials(user)}</div> */}
                <div><img src={photo} alt={"Photo de " + user.id} className="emp-avatar"/></div>
                
                <div className="emp-hero__main">
                    <h2 className="emp-name">{fullName}</h2>
                    <p className="emp-job">{user.job || "Poste non renseigné"}</p>
                    <div className="emp-badges">
                        <span className={`emp-badge ${String(user.statut) === "1" ? "emp-badge--ok" : "emp-badge--muted"}`}>
                            {String(user.statut) === "1" ? "Actif" : "Inactif"}
                        </span>
                        {String(user.employee) === "1" && <span className="emp-badge emp-badge--accent">Salari&eacute;</span>}
                        {String(user.admin) === "1" && <span className="emp-badge emp-badge--accent">Administrateur</span>}
                    </div>
                </div>
            </div>

            {/* ── Informations personnelles (regroupées dans un seul div) ── */}
            <div className="emp-personal">
                <h3 className="emp-personal__title">Informations personnelles</h3>
                <div className="emp-personal__row">
                    <span className="emp-personal__label">Identifiant</span>
                    <span className="emp-personal__value">#{user.id}</span>
                </div>
                <div className="emp-personal__row">
                    <span className="emp-personal__label">Nom</span>
                    <span className="emp-personal__value">{fullName}</span>
                </div>
                <div className="emp-personal__row">
                    <span className="emp-personal__label">Login</span>
                    <span className="emp-personal__value">{user.login || "—"}</span>
                </div>
                <div className="emp-personal__row">
                    <span className="emp-personal__label">Genre</span>
                    <span className="emp-personal__value">{genderLabel(user.gender)}</span>
                </div>
                <div className="emp-personal__row">
                    <span className="emp-personal__label">Poste</span>
                    <span className="emp-personal__value">{user.job || "—"}</span>
                </div>
            </div>

            {/* ── Salaires ── */}
            <h2 className="emp-section-title">Salaires &amp; paiements</h2>
            <h2>Total reste &agrave; payer: {formatMoney(totalRemaining)}</h2>

            {mySalaries.length === 0 && (
                <div className="emp-salary-card">
                    <div className="emp-empty">Aucun salaire enregistré pour ce salarié.</div>
                </div>
            )}

            {mySalaries.map((salary) => {
                const salaryPayments = payments.filter(
                    (p) => Number(p.fk_salary) === Number(salary.id)
                );
                const balance = computeSalaryBalance(salary, salaryPayments);

                return (
                    <div key={salary.id} className="emp-salary-card">
                        <div className="emp-salary-card__head">
                            <div>
                                <h4 className="emp-salary-card__label">{salary.label || "Salaire"}</h4>
                                <p className="emp-salary-card__meta">
                                    Période : {formatDate(salary.datesp)} → {formatDate(salary.dateep)}
                                </p>
                            </div>
                            <div className="emp-salary-card__amount">{formatMoney(salary.amount)}</div>
                        </div>

                        {/* Récapitulatif du solde */}
                        <div className="emp-balance">
                            <div className="emp-balance__item">
                                <div className="emp-balance__label">Total dû</div>
                                <div className="emp-balance__value">{formatMoney(balance.total)}</div>
                            </div>
                            <div className="emp-balance__item">
                                <div className="emp-balance__label">Payé</div>
                                <div className="emp-balance__value">{formatMoney(balance.paid)}</div>
                            </div>
                            <div className="emp-balance__item">
                                <div className="emp-balance__label">Restant</div>
                                <div className="emp-balance__value emp-balance__value--remaining">{formatMoney(balance.remaining)}</div>
                            </div>
                        </div>

                        {/* <div className="emp-progress">
                            <div className="emp-progress__bar" style={{ width: `${Math.round(balance.progress * 100)}%` }} />
                        </div> */}

                        {/* Paiements */}
                        <p className="emp-payments-title">Paiements ({salaryPayments.length})</p>
                        {salaryPayments.length === 0 ? (
                            <div className="emp-empty">Aucun paiement pour ce salaire.</div>
                        ) : (
                            <table className="emp-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Mode de règlement</th>
                                        <th className="emp-table__num">Montant</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {salaryPayments.map((payment) => (
                                        <tr key={payment.id}>
                                            <td>{formatDate(payment.datep || payment.datepaye)}</td>
                                            <td>{paymentTypeLabel(payment.fk_typepayment)}</td>
                                            <td className="emp-table__num">{formatMoney(payment.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
