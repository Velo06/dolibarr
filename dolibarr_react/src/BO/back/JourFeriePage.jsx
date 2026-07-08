import { getAllJourFeries, getJourFerieById, updateJourFerie, deleteJourFerie, createJourFerie } from '../../api/boot'
import { useState, useEffect } from 'react';
import './jourFerie.css';

/**
 * Formate une date ISO "YYYY-MM-DD" (renvoyée par l'API Spring Boot)
 * au format français "JJ/MM/AAAA". Renvoie "—" si absente.
 */
function formatDateFr(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).split("-");
    if (!y || !m || !d) return iso;
    return `${d}/${m}/${y}`;
}

export default function JourFeriePage() {
    const [jourFerie, setJourFerie] = useState([])
    const [loading, setLoading] = useState(true)
    const [modalCreate, setModalCreate] = useState(false)
    const [modalEdit, setModalEdit] = useState(false)
    const [label, setLabel] = useState("")
    const [date, setDate] = useState("")
    const [unJour, setUnJour] = useState({
        id: "",
        libelle: "",
        date: "",
    });

    async function load() {
        setLoading(true)
        const donnee = await getAllJourFeries();
        setJourFerie(donnee || []);
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, []);

    async function handleCreate() {
        const data = {
            libelle: label,
            date: date
        }
        await createJourFerie(data)
        setModalCreate(false)
        setLabel("")
        setDate("")
        load()
    }

    async function edit(e) {
        const resp = await getJourFerieById(e)
        setUnJour({
            id: resp.id,
            libelle: resp.libelle,
            date: resp.date,
        })
        setModalEdit(true)
    }

    async function handleEdit(e) {
        const data = {
            libelle: unJour.libelle,
            date: unJour.date
        }
        await updateJourFerie(e, data)
        setModalEdit(false)
        load()
    }

    async function handleDelete(e) {
        await deleteJourFerie(e)
        load()
    }

    return (
        <div className="jf-page">
            <div className="jf-header">
                <div>
                    <h2 className="jf-title">Jours f&eacute;ri&eacute;s</h2>
                    <p className="jf-subtitle">
                        {jourFerie.length} jour{jourFerie.length > 1 ? "s" : ""} f&eacute;ri&eacute;{jourFerie.length > 1 ? "s" : ""} enregistr&eacute;{jourFerie.length > 1 ? "s" : ""}
                    </p>
                </div>
                <button className="jf-btn jf-btn--primary" onClick={() => setModalCreate(true)}>
                    + Ajouter
                </button>
            </div>

            <div className="jf-card">
                {loading ? (
                    <div className="jf-loading">Chargement…</div>
                ) : jourFerie.length === 0 ? (
                    <div className="jf-empty">Aucun jour f&eacute;ri&eacute; pour le moment.</div>
                ) : (
                    <table className="jf-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Libell&eacute;</th>
                                <th>Date</th>
                                <th style={{ textAlign: "right" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {jourFerie.map((jf) => (
                                <tr key={jf.id}>
                                    <td className="jf-id">#{jf.id}</td>
                                    <td>{jf.libelle || "—"}</td>
                                    <td className="jf-date">{formatDateFr(jf.date)}</td>
                                    <td>
                                        <div className="jf-row-actions">
                                            <button className="jf-btn jf-btn--ghost jf-btn--sm" onClick={() => edit(jf.id)}>Modifier</button>
                                            <button className="jf-btn jf-btn--danger jf-btn--sm" onClick={() => handleDelete(jf.id)}>Supprimer</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modalCreate && (
                <div className="jf-overlay" onClick={() => setModalCreate(false)}>
                    <div className="jf-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="jf-modal__title">Ajouter un jour f&eacute;ri&eacute;</h3>
                        <div className="jf-field">
                            <label htmlFor="label">Libell&eacute;</label>
                            <input className="jf-input" type="text" value={label} onChange={(e) => setLabel(e.target.value)} id="label" placeholder="ex : F&ecirc;te nationale" />
                        </div>
                        <div className="jf-field">
                            <label htmlFor="daty">Date</label>
                            <input className="jf-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} id="daty" />
                        </div>
                        <div className="jf-modal__actions">
                            <button className="jf-btn jf-btn--ghost" onClick={() => setModalCreate(false)}>Annuler</button>
                            <button className="jf-btn jf-btn--primary" onClick={handleCreate} disabled={!date}>Enregistrer</button>
                        </div>
                    </div>
                </div>
            )}

            {modalEdit && (
                <div className="jf-overlay" onClick={() => setModalEdit(false)}>
                    <div className="jf-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="jf-modal__title">Modifier le jour f&eacute;ri&eacute;</h3>
                        <div className="jf-field">
                            <label htmlFor="edit-label">Libell&eacute;</label>
                            <input
                                className="jf-input"
                                id="edit-label"
                                type="text"
                                value={unJour.libelle || ""}
                                onChange={(e) => setUnJour({ ...unJour, libelle: e.target.value })}
                            />
                        </div>
                        <div className="jf-field">
                            <label htmlFor="edit-daty">Date</label>
                            <input
                                className="jf-input"
                                id="edit-daty"
                                type="date"
                                value={unJour.date || ""}
                                onChange={(e) => setUnJour({ ...unJour, date: e.target.value })}
                            />
                        </div>
                        <div className="jf-modal__actions">
                            <button className="jf-btn jf-btn--ghost" onClick={() => setModalEdit(false)}>Annuler</button>
                            <button className="jf-btn jf-btn--primary" onClick={() => handleEdit(unJour.id)} disabled={!unJour.date}>Modifier</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
