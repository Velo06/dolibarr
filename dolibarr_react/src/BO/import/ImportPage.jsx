import { useState } from "react";

import { analyzeFiles, runImport } from "./importService";
import "./ImportPage.css";

/* ════════════════════════════════════════════════════════════════════
   ImportPage (Back Office)
   ────────────────────────────────────────────────────────────────────
   Import en un seul clic : on sélectionne les fichiers puis « Importer »
   lit/parse les fichiers ET écrit dans Dolibarr, avec un journal en direct.

   Trois champs de fichier distincts (CSV salariés, CSV salaires, ZIP images).
   Le nom des fichiers n'a pas d'importance : importService classe les CSV par
   leur CONTENU. Toute la logique vit dans importService.
   ════════════════════════════════════════════════════════════════════ */

/** Les trois emplacements de fichier, dans l'ordre d'affichage. */
const SLOTS = [
  {
    key: "employees",
    label: "CSV des salariés",
    hint: "Colonnes : ref_employe, nom, genre, identifiant, mdp, heure_travail_semaine, poste",
    accept: ".csv",
  },
  {
    key: "salaries",
    label: "CSV des salaires",
    hint: "Colonnes : ref_salaire, ref_employe, date_debut, date_fin, montant, paiement",
    accept: ".csv",
  },
  {
    key: "images",
    label: "ZIP des images",
    hint: "Une image par salarié, nommée d'après sa référence (ex: 1.png)",
    accept: ".zip",
  },
];

export default function ImportPage() {
  // Un fichier par emplacement : { employees: File|null, salaries, images }.
  const [slots, setSlots] = useState({ employees: null, salaries: null, images: null });
  // Si coché, on n'importe pas les images (le ZIP est ignoré). Décoché par défaut.
  const [skipImages, setSkipImages] = useState(false);
  const [importing, setImporting] = useState(false);
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  /** Affecte (ou retire) le fichier d'un emplacement donné. */
  function setSlotFile(key, file) {
    setSlots((prev) => ({ ...prev, [key]: file }));
    resetResults();
  }

  function resetResults() {
    setStats(null);
    setLog([]);
    setError("");
  }

  /** Liste des fichiers réellement sélectionnés (slots non vides).
   *  Le ZIP d'images est exclu quand « ne pas importer les images » est coché. */
  function selectedFiles() {
    return SLOTS.filter((s) => !(s.key === "images" && skipImages))
      .map((s) => slots[s.key])
      .filter(Boolean);
  }

  /* ── Import : parse les fichiers PUIS écrit dans Dolibarr (un seul clic) ── */
  async function handleImport() {
    setImporting(true);
    setError("");
    setLog([]);
    setStats(null);
    try {
      const data = await analyzeFiles(selectedFiles());
      // Les avertissements de lecture (CSV non reconnu, fichier manquant…)
      // sont injectés en tête du journal.
      data.warnings.forEach((w) => setLog((prev) => [...prev, `[INFO] ${w}`]));

      const { stats: finalStats } = await runImport(data, (msg) =>
        setLog((prev) => [...prev, msg])
      );
      setStats(finalStats);
    } catch (err) {
      setError(err.message || "Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="imp-page">
      <header className="imp-header">
        <h1 className="imp-title">Import de données</h1>
        <p className="imp-subtitle">
          Sélectionnez les 2 fichiers CSV (salariés &amp; salaires) et le ZIP
          d'images (nom de l'image = réf. du salarié). Les noms de fichiers et la
          casse des colonnes n'ont pas d'importance.
        </p>
      </header>

      {error && (
        <div className="imp-alert imp-alert--error">
          <div>{error}</div>
        </div>
      )}

      {/* ── Un champ de fichier par fichier ── */}
      <div className="imp-fields">
        {SLOTS.map((slot) => (
          <FileField
            key={slot.key}
            slot={slot}
            file={slots[slot.key]}
            disabled={importing || (slot.key === "images" && skipImages)}
            onChange={(file) => setSlotFile(slot.key, file)}
          >
            {slot.key === "images" && (
              <label className="imp-field-check">
                <input
                  type="checkbox"
                  checked={skipImages}
                  disabled={importing}
                  onChange={(e) => {
                    setSkipImages(e.target.checked);
                    resetResults();
                  }}
                />
                Ne pas importer les images
              </label>
            )}
          </FileField>
        ))}
      </div>

      {/* ── Actions ── */}
      <div className="imp-actions">
        <button
          className="imp-btn imp-btn--primary"
          onClick={handleImport}
          disabled={selectedFiles().length === 0 || importing}
        >
          {importing && <span className="imp-spinner" />}
          {importing ? "Import en cours…" : "Importer"}
        </button>

        {selectedFiles().length > 0 && (
          <button
            className="imp-btn imp-btn--ghost"
            onClick={() => {
              setSlots({ employees: null, salaries: null, images: null });
              resetResults();
            }}
            disabled={importing}
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* ── Statistiques finales ── */}
      {stats && (
        <div className="imp-counts">
          <Count label="Salariés créés" value={stats.employeesCreated} />
          <Count label="Réutilisés" value={stats.employeesReused} />
          <Count label="Photos" value={stats.photos} />
          <Count label="Salaires" value={stats.salaries} />
          <Count label="Versements" value={stats.payments} />
          <Count label="Erreurs" value={stats.errors} danger={stats.errors > 0} />
        </div>
      )}

      {/* ── Journal d'import ── */}
      {log.length > 0 && (
        <div className="imp-log">
          <div className="imp-log-header">
            <span className="imp-log-title">Journal d'import</span>
            <span className="imp-log-count">{log.length} lignes</span>
          </div>
          <div className="imp-log-body">
            {log.map((line, i) => (
              <div
                key={i}
                className={`imp-log-line ${
                  line.startsWith("[ERREUR]")
                    ? "imp-log-line--err"
                    : line.startsWith("[OK]")
                    ? "imp-log-line--ok"
                    : ""
                }`}
              >
                <span className="imp-log-idx">{String(i + 1).padStart(3, "0")}</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Composants de présentation ─────────────── */

/**
 * Un champ de fichier (label + input natif + nom du fichier choisi).
 * `children` permet d'ajouter un contrôle annexe (ex: la case "ne pas
 * importer les images") sous le champ, hors de la zone cliquable.
 * @param {{ slot:{label,hint,accept}, file:File|null, disabled:boolean,
 *           onChange:(file:File|null)=>void, children?:any }} props
 */
function FileField({ slot, file, disabled, onChange, children }) {
  return (
    <div className={`imp-field ${file ? "imp-field--filled" : ""}`}>
      <label className="imp-field-pick">
        <div className="imp-field-head">
          <span className="imp-field-label">{slot.label}</span>
          {file && <span className="imp-dot imp-dot--ok" />}
        </div>
        <div className="imp-field-hint">{slot.hint}</div>

        <input
          type="file"
          accept={slot.accept}
          disabled={disabled}
          className="imp-field-input"
          onChange={(e) => onChange(e.target.files[0] || null)}
        />

        {file && (
          <div className="imp-field-file">
            {file.name}{" "}
            <span className="imp-dropzone-sub">({Math.round(file.size / 1024)} Ko)</span>
          </div>
        )}
      </label>

      {children}
    </div>
  );
}

function Count({ label, value, danger }) {
  return (
    <div className={`imp-count ${danger ? "imp-count--danger" : ""}`}>
      <div className="imp-count-value">{value}</div>
      <div className="imp-count-label">{label}</div>
    </div>
  );
}
