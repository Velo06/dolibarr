import JSZip from "jszip";

import {
  findEmployeeByLogin,
  createEmployeeAccount,
  uploadEmployeePhoto,
  uploadEmployeePhotoThumb,
  setEmployeePhoto,
  createSalary,
  addSalaryPayment,
  toNumber,
  round2,
} from "../../FO/salaries/salariesService";

/* ════════════════════════════════════════════════════════════════════
   importService.js
   ────────────────────────────────────────────────────────────────────
   Import de données salariés depuis :
     • 2 fichiers CSV (1 = salariés, 1 = salaires + paiements) ;
     • 1 fichier ZIP d'images (nom de l'image = réf. du salarié).

   Contraintes prises en charge :
     • Les NOMS de fichiers peuvent changer → on auto-classe par colonnes.
     • Les NOMS de colonnes sont insensibles à la casse (et aux accents).
     • Les DATES sont acceptées dans de nombreux formats (pas seulement
       dd/mm/yyyy) → parseur de date tolérant.
     • Les MONTANTS acceptent la virgule décimale ("677,56").

   Le fichier est volontairement découpé en petites fonctions pures
   (parsing) + fonctions d'orchestration (appels API). Les fonctions de
   parsing sont testables isolément et réutilisables.
   ════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════ 1. Parsing CSV ═══════════════════════════ */

/**
 * Parseur CSV robuste (style RFC 4180) : gère les champs entre
 * guillemets contenant des virgules, des sauts de ligne et des
 * guillemets échappés (`""`).
 *
 * @param {string} text  contenu brut du fichier CSV
 * @returns {string[][]} tableau de lignes, chaque ligne = tableau de cellules
 */
export function parseCsvToMatrix(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // Normalise les fins de ligne et retire un éventuel BOM UTF-8.
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // guillemet échappé
          i++;
        } else {
          inQuotes = false; // fin de champ quoté
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // Dernier champ / dernière ligne (si pas de \n final).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Supprime les lignes entièrement vides.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Normalise un nom de colonne : minuscules, sans accents, espaces et
 * tirets remplacés par des underscores. Rend la lecture des colonnes
 * insensible à la casse et à la ponctuation.
 * @param {string} name
 * @returns {string}
 */
export function normalizeKey(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents (diacritiques combinants)
    .replace(/[\s-]+/g, "_");
}

/**
 * Transforme une matrice CSV en liste d'objets dont les clés sont les
 * en-têtes normalisés.
 * @param {string} text
 * @returns {{ headers:string[], rows:Array<Object> }}
 */
export function parseCsv(text) {
  const matrix = parseCsvToMatrix(text);
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map(normalizeKey);
  const rows = matrix.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

/**
 * Lit un champ d'une ligne en testant plusieurs noms de colonne
 * candidats (déjà normalisés). Renvoie "" si aucun ne correspond.
 * @param {Object} row
 * @param {...string} candidates
 * @returns {string}
 */
export function field(row, ...candidates) {
  for (const c of candidates) {
    if (row[c] != null && row[c] !== "") return row[c];
  }
  return "";
}

/* ═══════════════════ 2. Parsing valeurs (dates, montants) ═════════ */

/**
 * Parseur de date TOLÉRANT → renvoie une date normalisée "YYYY-MM-DD".
 *
 * Formats gérés :
 *   • ISO            : 2026-03-08, 2026/3/8
 *   • Européen       : 08/03/2026, 8-3-2026, 08.03.26 (jour en premier)
 *   • Année sur 2 chiffres : 26 → 2026
 *   • Repli          : Date.parse() (ex: "March 8, 2026")
 *
 * @param {string} value
 * @returns {string|null} "YYYY-MM-DD" ou null si non interprétable
 */
export function parseFlexibleDate(value) {
  if (!value) return null;
  const s = String(value).trim();

  // 1) Format ISO : année en premier.
  let m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  // 2) Format jour/mois/année (séparateurs / - .).
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const day = +m[1];
    const month = +m[2];
    const year = normalizeYear(+m[3]);
    return isoDate(year, month, day);
  }

  // 3) Repli : moteur natif (formats textuels, etc.).
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/** Complète une année sur 2 chiffres (26 → 2026, 98 → 1998). */
function normalizeYear(y) {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

/** Assemble une date "YYYY-MM-DD" avec zéro-padding (ou null si invalide). */
function isoDate(year, month, day) {
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parseur de montant tolérant à la virgule décimale et aux espaces.
 *   "677,56"   → 677.56
 *   "1 200,50" → 1200.5
 *   "1,200.50" → 1200.5
 * @param {string|number} value
 * @returns {number}
 */
export function parseAmount(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  let s = String(value).trim().replace(/\s/g, ""); // retire les espaces (milliers)

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Le dernier séparateur rencontré est le séparateur décimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // européen : . milliers, , décimal
    } else {
      s = s.replace(/,/g, ""); // anglo : , milliers, . décimal
    }
  } else if (hasComma) {
    s = s.replace(",", "."); // virgule = décimale
  }

  return toNumber(s);
}

/**
 * Parse le champ "paiement" : une pseudo-liste d'échéances de la forme
 *   {["08/03/26",890]}
 *   {["08/03/26",480],["08/03/26",300]}
 * Ce n'est PAS du JSON valide → on extrait les paires [date, montant]
 * par expression régulière.
 *
 * @param {string} value
 * @returns {Array<{ date:string|null, amount:number }>}
 */
export function parsePaymentField(value) {
  if (!value || !String(value).trim()) return [];

  // Méthode principale : on transforme les accolades externes en crochets pour
  // obtenir un tableau JSON valide, puis JSON.parse. Cela gère nativement les
  // montants décimaux : 100.5, "100.5", "100,5"→(string), 1000, "1000".
  //   {["08/03/26",480],["08/03/26",300]}  →  [["08/03/26",480],["08/03/26",300]]
  try {
    const json = String(value).replace(/{/g, "[").replace(/}/g, "]");
    const pairs = JSON.parse(json);
    if (Array.isArray(pairs)) {
      return pairs
        .filter((p) => Array.isArray(p) && p.length >= 2)
        .map((p) => ({ date: parseFlexibleDate(p[0]), amount: parseAmount(p[1]) }));
    }
  } catch {
    // format inattendu → on tente le repli regex ci-dessous.
  }

  // Repli : extraction par expression régulière des paires ["date", montant].
  const pairs = [];
  const re = /\[\s*"?([^",\]]+?)"?\s*,\s*"?([^"\]]+?)"?\s*\]/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    pairs.push({ date: parseFlexibleDate(m[1]), amount: parseAmount(m[2]) });
  }
  return pairs;
}

/**
 * Convertit un genre textuel en code Dolibarr.
 *   "homme"/"h"/"m"/"male"   → "man"
 *   "femme"/"f"/"w"/"female" → "woman"
 *   vide / "autre" / inconnu → "other"
 * Insensible à la casse et aux accents (via normalizeKey). Un salarié sans
 * genre exploitable est donc rangé en "other" (et non laissé vide).
 * @param {string} value
 * @returns {"man"|"woman"|"other"}
 */
export function mapGender(value) {
  const v = normalizeKey(value);
  if (["homme", "h", "m", "male", "man", "masculin"].includes(v)) return "man";
  if (["femme", "f", "w", "female", "woman", "feminin"].includes(v)) return "woman";
  return "other";
}

/* ═══════════════════ 3. Classification des fichiers ═══════════════ */

/**
 * Détermine la nature d'un CSV à partir de ses en-têtes (les noms de
 * fichiers pouvant changer, on se fie au CONTENU).
 * @param {string[]} headers  en-têtes normalisés
 * @returns {"employees"|"salaries"|"unknown"}
 */
export function classifyCsv(headers) {
  const has = (h) => headers.includes(h);
  // Feuille salaires : montant + paiement (ou ref_salaire).
  if ((has("montant") && has("paiement")) || has("ref_salaire")) return "salaries";
  // Feuille salariés : identifiant/login + nom.
  if ((has("identifiant") || has("login")) && (has("nom") || has("ref_employe")))
    return "employees";
  return "unknown";
}

/**
 * Lit un fichier texte (CSV) côté navigateur.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return file.text();
}

/* ═══════════════════ 4. Lecture du ZIP d'images ══════════════════ */

/**
 * Ouvre le ZIP et indexe chaque image par sa "référence" = nom de
 * fichier sans extension (ex: "1.png" → clé "1").
 *
 * @param {File} zipFile
 * @returns {Promise<Map<string, { filename:string, base64:string }>>}
 */
export async function readImagesZip(zipFile) {
  const zip = await JSZip.loadAsync(zipFile);
  const images = new Map();

  // On parcourt les entrées non-dossier.
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    const filename = entry.name.split("/").pop(); // ignore les sous-dossiers
    if (!filename || filename.startsWith(".")) continue;
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(filename)) continue;

    const ref = normalizeKey(filename.replace(/\.[^.]+$/, "")); // sans extension
    const base64 = await entry.async("base64");
    images.set(ref, { filename, base64 });
  }
  return images;
}

/* ─────────────── Vignettes (générées côté navigateur) ────────────── */

/**
 * Type MIME déduit de l'extension d'un nom de fichier image.
 * @param {string} filename
 * @returns {string}
 */
export function mimeFromName(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

/**
 * Nom de fichier de vignette : insère un suffixe avant l'extension.
 *   thumbName("1.png", "_small") → "1_small.png"
 * @param {string} filename
 * @param {string} suffix  "_small" | "_mini"
 * @returns {string}
 */
export function thumbName(filename, suffix) {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return filename + suffix;
  return filename.slice(0, dot) + suffix + filename.slice(dot);
}

/**
 * Redimensionne une image (base64) à `maxDim` pixels sur son plus grand
 * côté, via un <canvas>. Renvoie le base64 (sans préfixe data:).
 * Fonction navigateur (utilise document/Image/canvas).
 *
 * @param {string} base64       image source en base64
 * @param {string} mimeType     ex: "image/png"
 * @param {number} maxDim       taille max du plus grand côté (px)
 * @returns {Promise<string>}   base64 de la vignette
 */
export function makeThumbnailBase64(base64, mimeType, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(mimeType).split(",")[1]);
    };
    img.onerror = () => reject(new Error("Image illisible pour la vignette."));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/* ═══════════════════ 5. Analyse globale (avant import) ════════════ */

/**
 * Analyse l'ensemble des fichiers fournis et prépare les données pour
 * l'import, SANS rien écrire dans Dolibarr. Sert à l'aperçu.
 *
 * @param {File[]} files  mélange de .csv et .zip, dans n'importe quel ordre
 * @returns {Promise<{
 *   employees: Array<Object>,
 *   salaries: Array<Object>,
 *   images: Map<string,{filename:string,base64:string}>,
 *   warnings: string[]
 * }>}
 */
export async function analyzeFiles(files) {
  const warnings = [];
  let employees = [];
  let salaries = [];
  let images = new Map();
  let sawSalariesCsv = false; // un CSV « salaires » a-t-il été fourni (même vide) ?

  for (const file of files) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".zip")) {
      images = await readImagesZip(file);
      continue;
    }

    if (lower.endsWith(".csv")) {
      const { headers, rows } = parseCsv(await readFileAsText(file));
      const kind = classifyCsv(headers);

      if (kind === "employees") {
        employees = rows.map(mapEmployeeRow);
      } else if (kind === "salaries") {
        // Un CSV salaires est accepté même sans données (juste les en-têtes) :
        // on n'importe alors aucun salaire, sans erreur.
        sawSalariesCsv = true;
        salaries = mergeSalaryRows(rows.map(mapSalaryRow));
      } else {
        warnings.push(
          `Fichier « ${file.name} » : type de CSV non reconnu (colonnes : ${headers.join(", ")}).`
        );
      }
      continue;
    }

    warnings.push(`Fichier « ${file.name} » ignoré (extension non gérée).`);
  }

  if (employees.length === 0)
    warnings.push("Aucune ligne de salarié détectée (CSV salariés manquant ?).");
  // On n'avertit que si le CSV salaires est réellement absent. Un fichier
  // fourni mais vide (en-têtes seuls) est un cas normal : on n'importe rien.
  if (salaries.length === 0 && !sawSalariesCsv)
    warnings.push("Aucune ligne de salaire détectée (CSV salaires manquant ?).");

  return { employees, salaries, images, warnings };
}

/** Projette une ligne CSV "salariés" sur un objet métier clair. */
export function mapEmployeeRow(row) {
  return {
    ref: normalizeKey(field(row, "ref_employe", "ref", "reference")),
    lastName: field(row, "nom", "lastname", "name"),
    gender: mapGender(field(row, "genre", "gender", "sexe")),
    login: field(row, "identifiant", "login", "user"),
    password: field(row, "mdp", "password", "pass", "motdepasse"),
    weeklyHours: parseAmount(field(row, "heure_travail_semaine", "heures", "weeklyhours")),
    job: field(row, "poste", "job", "fonction", "position"),
  };
}

/** Projette une ligne CSV "salaires" sur un objet métier clair. */
export function mapSalaryRow(row) {
  // Montant : on garde la valeur brute pour distinguer « champ absent/vide »
  // (→ erreur : montant obligatoire) de « 0 » explicite.
  const amountRaw = field(row, "montant", "amount", "salaire");
  return {
    ref: field(row, "ref_salaire", "ref", "reference"),
    employeeRef: normalizeKey(field(row, "ref_employe", "ref_emp", "employe")),
    periodStart: parseFlexibleDate(field(row, "date_debut", "datedebut", "debut", "datesp")),
    periodEnd: parseFlexibleDate(field(row, "date_fin", "datefin", "fin", "dateep")),
    amount: parseAmount(amountRaw),
    hasAmount: String(amountRaw).trim() !== "",
    payments: parsePaymentField(field(row, "paiement", "paiements", "payments")),
  };
}

/**
 * Fusionne les lignes de salaire qui décrivent le MÊME salaire.
 *
 * Clé d'unicité : (ref_salaire, ref_employe, date_debut, date_fin). Quand
 * plusieurs lignes partagent cette clé, c'est un seul salaire : on **somme les
 * montants** et on **concatène tous les paiements** (qui s'imputent alors sur ce
 * montant total). L'ordre d'apparition est préservé.
 *
 * @param {Array} rows  lignes déjà passées par mapSalaryRow
 * @returns {Array} salaires fusionnés
 */
export function mergeSalaryRows(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = [r.ref, r.employeeRef, r.periodStart, r.periodEnd].join("|");
    const existing = byKey.get(key);
    if (existing) {
      existing.amount += r.amount;
      existing.hasAmount = existing.hasAmount || r.hasAmount;
      existing.payments.push(...r.payments);
    } else {
      // Copie défensive (payments dans un nouveau tableau).
      byKey.set(key, { ...r, payments: [...r.payments] });
    }
  }
  return [...byKey.values()];
}

/* ═══════════════════ 6. Orchestration de l'import ═════════════════ */

/**
 * Exécute l'import complet. Émet une progression via `onProgress` et
 * renvoie un rapport détaillé. Tolérant aux erreurs : une ligne en échec
 * n'interrompt pas le reste.
 *
 * @param {Object} data            résultat de analyzeFiles()
 * @param {(msg:string)=>void} [onProgress]
 * @returns {Promise<{ refToUserId:Object, log:Array, stats:Object }>}
 */
export async function runImport(data, onProgress = () => {}) {
  const { employees, salaries, images } = data;
  const log = [];
  const refToUserId = {}; // ref_employe → id Dolibarr
  const stats = {
    employeesCreated: 0,
    employeesReused: 0,
    photos: 0,
    salaries: 0,
    payments: 0,
    errors: 0,
  };

  const record = (status, scope, message) => {
    const entry = { status, scope, message };
    log.push(entry);
    if (status === "error") stats.errors++;
    onProgress(`${status === "error" ? "[ERREUR]" : "[OK]"} [${scope}] ${message}`);
  };

  /* ── Étape 1 : salariés ── */
  for (const emp of employees) {
    if (!emp.login) {
      record("error", "salarié", `Réf ${emp.ref} : identifiant manquant, ignoré.`);
      continue;
    }
    if (!emp.lastName || !String(emp.lastName).trim()) {
      record("error", "salarié", `${emp.login} : nom manquant, salarié non créé.`);
      continue;
    }
    if (emp.weeklyHours < 0) {
      record(
        "error",
        "salarié",
        `${emp.login} : heures de travail négatives (${emp.weeklyHours}), salarié non créé.`
      );
      continue;
    }
    try {
      const existing = await findEmployeeByLogin(emp.login);
      if (existing) {
        refToUserId[emp.ref] = existing.id;
        stats.employeesReused++;
        record("ok", "salarié", `${emp.login} existe déjà (id ${existing.id}), réutilisé.`);
      } else {
        const id = await createEmployeeAccount(emp);
        refToUserId[emp.ref] = id;
        stats.employeesCreated++;
        record("ok", "salarié", `${emp.login} créé (id ${id}).`);
      }
    } catch (err) {
      record("error", "salarié", `${emp.login} : ${err.message}`);
    }
  }

  /* ── Étape 2 : photos ── */
  for (const [ref, img] of images.entries()) {
    const userId = refToUserId[ref];
    if (!userId) {
      record("error", "photo", `Image « ${img.filename} » : aucun salarié de réf ${ref}.`);
      continue;
    }
    try {
      const mime = mimeFromName(img.filename);
      // 1) Photo taille réelle.
      await uploadEmployeePhoto(userId, img.filename, img.base64);
      // 2) Vignettes _small (480px) et _mini (128px) — sinon Dolibarr
      //    affiche l'avatar par défaut dans les listes/fiches.
      const [small, mini] = await Promise.all([
        makeThumbnailBase64(img.base64, mime, 480),
        makeThumbnailBase64(img.base64, mime, 128),
      ]);
      await uploadEmployeePhotoThumb(userId, thumbName(img.filename, "_small"), small);
      await uploadEmployeePhotoThumb(userId, thumbName(img.filename, "_mini"), mini);
      // 3) Renseigne le champ photo (avatar affiché).
      await setEmployeePhoto(userId, img.filename);
      stats.photos++;
      record("ok", "photo", `Photo « ${img.filename} » (+ vignettes) associée au salarié id ${userId}.`);
    } catch (err) {
      record("error", "photo", `Image « ${img.filename} » : ${err.message}`);
    }
  }

  /* ── Étape 3 : salaires + paiements ── */
  for (const sal of salaries) {
    const userId = refToUserId[sal.employeeRef];
    if (!userId) {
      record(
        "error",
        "salaire",
        `Salaire réf ${sal.ref} : salarié de réf ${sal.employeeRef} introuvable.`
      );
      continue;
    }
    // Montant obligatoire : champ absent/vide → erreur (salaire non créé).
    if (!sal.hasAmount) {
      record("error", "salaire", `Salaire réf ${sal.ref} : montant obligatoire manquant, non créé.`);
      continue;
    }
    // Montant négatif → salaire non créé.
    if (sal.amount < 0) {
      record(
        "error",
        "salaire",
        `Salaire réf ${sal.ref} : montant négatif (${sal.amount} €), non créé.`
      );
      continue;
    }
    // Dates de période obligatoires : début ou fin manquante → erreur.
    if (!sal.periodStart || !sal.periodEnd) {
      record(
        "error",
        "salaire",
        `Salaire réf ${sal.ref} : date de début ou de fin manquante, non créé.`
      );
      continue;
    }
    try {
      const label = `Salaire ${sal.ref} (réf. employé ${sal.employeeRef})`;
      const salaryId = await createSalary({
        fk_user: userId,
        label,
        amount: sal.amount,
        datesp: sal.periodStart,
        dateep: sal.periodEnd,
        datev: sal.periodEnd,
        fk_typepayment: 4, // Espèces par défaut (mode de règlement prévu)
      });
      stats.salaries++;
      record("ok", "salaire", `Salaire réf ${sal.ref} créé (id ${salaryId}, ${sal.amount} €).`);

      // Paiements (échéances éventuellement multiples). On PLAFONNE le cumulé
      // des versements au montant du salaire : un versement qui dépasserait le
      // reste à payer est ramené au reste, et une fois le salaire soldé, les
      // versements en trop sont ignorés (jamais de reste négatif).
      let remaining = round2(sal.amount);
      for (const pay of sal.payments) {
        if (!pay.amount) continue;
        if (remaining <= 0) {
          record(
            "ok",
            "paiement",
            `Salaire id ${salaryId} déjà soldé : versement de ${pay.amount} € ignoré.`
          );
          continue;
        }
        const toPay = Math.min(round2(pay.amount), remaining);
        try {
          await addSalaryPayment(salaryId, {
            amount: toPay,
            date: pay.date || sal.periodEnd,
            typeId: 4, // Espèces par défaut
            accountId: 1,
          });
          stats.payments++;
          remaining = round2(remaining - toPay);
          const capped = toPay < round2(pay.amount)
            ? ` (plafonné, demandé ${pay.amount} €)`
            : "";
          record("ok", "paiement", `Versement ${toPay} €${capped} sur salaire id ${salaryId}.`);
        } catch (err) {
          record("error", "paiement", `Salaire id ${salaryId} : ${err.message}`);
        }
      }
    } catch (err) {
      record("error", "salaire", `Salaire réf ${sal.ref} : ${err.message}`);
    }
  }

  onProgress("— Import terminé —");
  return { refToUserId, log, stats };
}
