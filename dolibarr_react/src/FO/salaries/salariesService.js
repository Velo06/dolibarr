import { api } from "../../api/api";
import { checkJourFerie } from "../../api/boot";

/* ════════════════════════════════════════════════════════════════════
   salariesService.js
   ────────────────────────────────────────────────────────────────────
   Couche d'accès aux API Dolibarr pour les salariés et les salaires.

   Objectif : centraliser TOUS les appels réseau + les règles métier
   (calcul du reste à payer, construction des filtres SQL, formatage)
   dans des petites fonctions nommées et réutilisables. Les composants
   React n'ont ainsi jamais à connaître la forme exacte de l'API : si
   Dolibarr change, on ne modifie que ce fichier.

   Endpoints utilisés (Dolibarr 23) :
     GET  /users                       → liste des utilisateurs/salariés
     GET  /users/{id}                  → un salarié
     GET  /salaries                    → liste des salaires
     POST /salaries                    → créer un salaire
     GET  /salaries/{id}               → un salaire
     GET  /salaries/payments           → liste des paiements
     POST /salaries/{id}/payments      → ajouter un paiement (versement)
   ════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────── Constantes ─────────────────────────── */

/**
 * Modes de règlement Dolibarr (table `c_paiement`).
 * Les `id` correspondent à l'installation standard et sont attendus par
 * le champ `paiementtype` de l'API de paiement des salaires.
 */
export const PAYMENT_TYPES = [
  { id: 4, code: "LIQ", label: "Espèces" },
  { id: 2, code: "VIR", label: "Virement bancaire" },
  { id: 7, code: "CHQ", label: "Chèque" },
  { id: 6, code: "CB", label: "Carte bancaire" },
  { id: 3, code: "PRE", label: "Prélèvement" },
];

/**
 * Compte bancaire utilisé par défaut pour enregistrer les paiements.
 * Le module "Banque" de Dolibarr exige un compte (`accountid`) à chaque
 * versement. On expose une valeur par défaut surchargeable dans le
 * formulaire de paiement.
 */
export const DEFAULT_BANK_ACCOUNT_ID = 1;

/* ───────────────────── Helpers de formatage ─────────────────────── */

/**
 * Convertit une valeur Dolibarr (souvent une chaîne "1200.00000000")
 * en nombre JS exploitable. Renvoie 0 si la valeur est vide/invalide.
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formate un montant en euros pour l'affichage.
 * @param {string|number} value
 * @returns {string} ex: "1 200,00 €"
 */
export function formatMoney(value) {
  return toNumber(value).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * Convertit un timestamp Unix (en secondes, comme renvoyé par Dolibarr)
 * en date lisible. Renvoie "—" si la date est absente.
 * @param {number|string|null} unixSeconds
 * @returns {string} ex: "25/06/2026"
 */
export function formatDate(unixSeconds) {
  const n = toNumber(unixSeconds);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleDateString("fr-FR");
}

/**
 * Normalise une date de formulaire (objet Date ou chaîne) au format
 * "YYYY-MM-DD" attendu par l'API Dolibarr.
 * @param {string|Date} date
 * @returns {string}
 */
export function toApiDate(date) {
  if (!date) return "";
  if (typeof date === "string") return date; // déjà au format input[type=date]
  // Composants LOCAUX (toISOString convertit en UTC et peut décaler d'un jour
  // dans les fuseaux à décalage positif).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ──────────────── Construction des filtres SQL Dolibarr ──────────── */
/*
   Dolibarr accepte un paramètre `sqlfilters` au format "universel" :
     (t.champ:operateur:valeur) and (t.autre:like:'%texte%')
   On encapsule cette syntaxe dans des helpers pour éviter les erreurs
   de chaîne à la main dans les composants.
*/

/**
 * Clause d'égalité : (t.champ:=:valeur)
 * @param {string} field  Nom de colonne préfixé (ex: "t.employee")
 * @param {string|number} value
 */
export function eqClause(field, value) {
  return `(${field}:=:${value})`;
}

/**
 * Clause "contient" (LIKE) sur du texte : (t.champ:like:'%valeur%')
 * On échappe les apostrophes pour ne pas casser la requête.
 * @param {string} field
 * @param {string} value
 */
export function likeClause(field, value) {
  const safe = String(value).replace(/'/g, "");
  return `(${field}:like:'%${safe}%')`;
}

/**
 * Assemble plusieurs clauses (déjà parenthésées) avec un opérateur
 * logique. Ignore les clauses vides/null.
 * @param {Array<string|null|undefined|false>} clauses
 * @param {"and"|"or"} [operator="and"]
 * @returns {string} chaîne sqlfilters prête à l'emploi ("" si aucune)
 */
export function joinClauses(clauses, operator = "and") {
  return clauses.filter(Boolean).join(` ${operator} `);
}

/* ──────────────────────────── Salariés ──────────────────────────── */

/**
 * Recherche multi-critères de salariés (utilisateurs Dolibarr).
 *
 * Tous les critères sont optionnels et se combinent en "ET". Le critère
 * `search` est un champ libre qui cherche dans le prénom OU le nom OU
 * le login (combinés en "OU").
 *
 * @param {Object}  [criteria]
 * @param {string}  [criteria.search]        Recherche libre (nom/prénom/login)
 * @param {string}  [criteria.job]           Poste / fonction
 * @param {string}  [criteria.email]         Email (contient)
 * @param {""|"man"|"woman"} [criteria.gender] Genre Dolibarr
 * @param {number|string} [criteria.minHours]  Heures/semaine minimum (>=)
 * @param {number|string} [criteria.maxHours]  Heures/semaine maximum (<=)
 * @param {boolean} [criteria.onlyEmployees] true → uniquement les salariés
 * @param {""|"0"|"1"} [criteria.status]     Statut actif (1) / inactif (0)
 * @param {number}  [criteria.limit=50]
 * @param {number}  [criteria.page=0]
 * @param {boolean} [criteria.withPhotos=false] true → peuple `photoUrl` (data URL) de chaque salarié
 * @returns {Promise<Array>} liste de salariés normalisés (voir mapEmployee)
 */
export async function listEmployees(criteria = {}) {
  const {
    search = "",
    job = "",
    email = "",
    gender = "",
    minHours = "",
    maxHours = "",
    onlyEmployees = true,
    status = "",
    limit = 50,
    page = 0,
    // Si true, on récupère aussi la photo (data URL) de chaque salarié dans
    // `photoUrl`. Désactivé par défaut : c'est coûteux (un téléchargement par
    // salarié) et inutile pour les appelants qui n'affichent pas les photos.
    withPhotos = false,
  } = criteria;

  const clauses = [];

  if (onlyEmployees) clauses.push(eqClause("t.employee", 1));
  if (status !== "") clauses.push(eqClause("t.statut", status));
  if (job.trim()) clauses.push(likeClause("t.job", job.trim()));
  if (email.trim()) clauses.push(likeClause("t.email", email.trim()));
  if (gender) clauses.push(`(t.gender:=:'${gender}')`);
  if (minHours !== "" && minHours != null)
    clauses.push(`(t.weeklyhours:>=:${toNumber(minHours)})`);
  if (maxHours !== "" && maxHours != null)
    clauses.push(`(t.weeklyhours:<=:${toNumber(maxHours)})`);

  if (search.trim()) {
    const term = search.trim();
    // Recherche large : prénom OU nom OU login.
    const orPart = joinClauses(
      [
        likeClause("t.firstname", term),
        likeClause("t.lastname", term),
        likeClause("t.login", term),
      ],
      "or"
    );
    clauses.push(`(${orPart})`);
  }

  const params = {
    limit,
    page,
    sortfield: "t.lastname",
    sortorder: "ASC",
  };
  const sqlfilters = joinClauses(clauses, "and");
  if (sqlfilters) params.sqlfilters = sqlfilters;

  // Dolibarr renvoie 404 (objet erreur) quand aucun résultat : on lisse
  // ce cas en tableau vide pour simplifier l'appelant.
  let employees;
  try {
    const rows = await api.get("/users", params);
    employees = Array.isArray(rows) ? rows.map(mapEmployee) : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }

  // Chargement optionnel des photos, en parallèle (un download par salarié
  // ayant une photo). On attache le résultat dans `photoUrl`.
  if (withPhotos) {
    await Promise.all(
      employees.map(async (e) => {
        if (!e.photo) return;
        try {
          e.photoUrl = await getEmployeePhoto(e.id, e.photo);
        } catch {
          e.photoUrl = null;
        }
      })
    );
  }

  return employees;
}

/**
 * Récupère un salarié par son id.
 * @param {number|string} id
 * @returns {Promise<Object>} salarié normalisé
 */
export async function getEmployee(id) {
  const user = await api.get(`/users/${id}`);
  return mapEmployee(user);
}

/**
 * Projette un utilisateur Dolibarr brut sur une forme stable et concise
 * utilisée par l'UI. Centralise la connaissance des noms de champs.
 * @param {Object} u  utilisateur brut renvoyé par l'API
 */
export function mapEmployee(u) {
  const fullName = `${u.firstname || ""} ${u.lastname || ""}`.trim();
  return {
    id: u.id,
    login: u.login,
    firstName: u.firstname || "",
    lastName: u.lastname || "",
    fullName: fullName || u.login || `#${u.id}`,
    email: u.email || "",
    job: u.job || "",
    isEmployee: String(u.employee) === "1",
    isActive: String(u.statut) === "1",
    isAdmin: String(u.admin) === "1",
    monthlySalary: toNumber(u.salary),
    // Heures travaillées par semaine (sert au filtre "génération multiple").
    weeklyHours: toNumber(u.weeklyhours),
    // Genre Dolibarr : "man" | "woman" | "" (non renseigné).
    gender: u.gender || "",
    // Nom de fichier de la photo (avatar), ex: "1.png" ("" si aucune).
    photo: u.photo || "",
    // Data URL de la photo, peuplée par listEmployees({ withPhotos: true }).
    photoUrl: null,
  };
}

/**
 * Recherche un salarié par son login (identifiant unique).
 * Sert de clé naturelle pour éviter les doublons à l'import.
 * @param {string} login
 * @returns {Promise<Object|null>} salarié normalisé, ou null si absent
 */
export async function findEmployeeByLogin(login) {
  try {
    const user = await api.get(`/users/login/${encodeURIComponent(login)}`);
    return user && user.id ? mapEmployee(user) : null;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Crée un compte salarié (utilisateur Dolibarr).
 * @param {Object} input
 * @param {string} input.login                 identifiant (obligatoire)
 * @param {string} [input.password]            mot de passe
 * @param {string} [input.lastName]            nom
 * @param {string} [input.firstName]           prénom
 * @param {""|"man"|"woman"} [input.gender]    genre Dolibarr
 * @param {number} [input.weeklyHours]         heures travaillées / semaine
 * @returns {Promise<number>} id du salarié créé
 */
export async function createEmployeeAccount(input) {
  const payload = {
    login: input.login,
    lastname: input.lastName || "",
    firstname: input.firstName || "",
    employee: 1,
    status: 1,
    statut: 1,
    ref: input.ref,
  };
  if (input.password) payload.pass = input.password;
  if (input.gender) payload.gender = input.gender;
  if (input.job && input.job.trim()) payload.job = input.job.trim();
  if (input.weeklyHours != null && input.weeklyHours !== "")
    payload.weeklyhours = toNumber(input.weeklyHours);

  return api.post("/users", payload);
}

/**
 * Téléverse un fichier dans un sous-dossier du dossier utilisateur.
 * Bas niveau, réutilisé par la photo et ses vignettes.
 * @param {string} subdir            sous-dossier sous documents/users/
 * @param {string} filename
 * @param {string} base64Content     contenu base64 (sans préfixe data:)
 */
async function uploadUserDocument(subdir, filename, base64Content) {
  return api.post("/documents/upload", {
    filename,
    modulepart: "user",
    subdir,
    filecontent: base64Content,
    fileencoding: "base64",
    overwriteifexists: 1,
    createdirifnotexists: 1,
  });
}

/**
 * Téléverse la photo (taille réelle) du salarié dans
 * `documents/users/{id}/photos/{filename}`.
 * @param {number|string} userId
 * @param {string} filename            ex: "1.png"
 * @param {string} base64Content       contenu encodé en base64 (sans préfixe)
 * @returns {Promise<any>}
 */
export async function uploadEmployeePhoto(userId, filename, base64Content) {
  return uploadUserDocument(`${userId}/photos`, filename, base64Content);
}

/**
 * Téléverse une VIGNETTE de la photo dans `…/photos/thumbs/{filename}`.
 *
 * Indispensable pour l'affichage : Dolibarr montre la photo via les
 * vignettes `_small`/`_mini` (voir showphoto). L'API d'upload ne les génère
 * PAS pour un upload par `subdir` (l'objet n'est pas chargé), on les fournit
 * donc nous-mêmes. Sans vignette, Dolibarr affiche l'avatar par défaut.
 *
 * @param {number|string} userId
 * @param {string} filename            ex: "1_small.png"
 * @param {string} base64Content
 * @returns {Promise<any>}
 */
export async function uploadEmployeePhotoThumb(userId, filename, base64Content) {
  return uploadUserDocument(`${userId}/photos/thumbs`, filename, base64Content);
}

/**
 * Supprime un compte salarié (utilisateur Dolibarr).
 * Attention : Ne supprime PAS les fichiers photos sur le disque (voir
 * deleteEmployeePhotos) : Dolibarr ne nettoie pas `documents/users/{id}`.
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export async function deleteEmployee(id) {
  return api.del(`/users/${id}`);
}

/**
 * Supprime les fichiers photo d'un salarié (photo + vignettes _small/_mini),
 * sur le disque, via DELETE /documents. Best-effort : les absences (404)
 * sont ignorées. À appeler AVANT de supprimer le compte.
 *
 * @param {number|string} userId
 * @param {string} photoFilename   ex: "1.png" ("" → rien à faire)
 * @returns {Promise<number>} nombre de fichiers effectivement supprimés
 */
export async function deleteEmployeePhotos(userId, photoFilename) {
  if (!photoFilename) return 0;

  const dot = photoFilename.lastIndexOf(".");
  const base = dot >= 0 ? photoFilename.slice(0, dot) : photoFilename;
  const ext = dot >= 0 ? photoFilename.slice(dot) : "";

  const files = [
    `${userId}/photos/${photoFilename}`,
    `${userId}/photos/thumbs/${base}_small${ext}`,
    `${userId}/photos/thumbs/${base}_mini${ext}`,
  ];

  let deleted = 0;
  for (const original_file of files) {
    try {
      await api.del("/documents", { params: { modulepart: "user", original_file } });
      deleted++;
    } catch (err) {
      if (err.status !== 404) throw err; // un vrai problème ; 404 = déjà absent
    }
  }
  return deleted;
}

/**
 * Définit la photo affichée (avatar) d'un salarié.
 * @param {number|string} userId
 * @param {string} filename   nom de fichier déjà téléversé
 * @returns {Promise<any>}
 */
export async function setEmployeePhoto(userId, filename) {
  return api.put(`/users/${userId}`, { photo: filename });
}

/* ───────────────────────────── Salaires ─────────────────────────── */

/**
 * Crée un salaire (à payer) pour un salarié.
 *
 * Champs obligatoires côté Dolibarr : `fk_user`, `label`, `amount`.
 * Les autres champs (période, date de valeur, mode de règlement) sont
 * optionnels mais recommandés.
 *
 * @param {Object} input
 * @param {number|string} input.fk_user        id du salarié (obligatoire)
 * @param {string}        input.label          libellé (obligatoire)
 * @param {number}        input.amount         montant total dû (obligatoire)
 * @param {string}        [input.datesp]       début de période "YYYY-MM-DD"
 * @param {string}        [input.dateep]       fin de période "YYYY-MM-DD"
 * @param {string}        [input.datep]        date de paiement "YYYY-MM-DD" (optionnel, null si vide)
 * @param {string}        [input.datev]        date de valeur "YYYY-MM-DD" (optionnel, null si vide)
 * @param {number}        [input.fk_typepayment] mode de règlement par défaut
 * @returns {Promise<number>} id du salaire créé
 */
export async function createSalary(input) {
  const payload = {
    fk_user: Number(input.fk_user),
    label: input.label,
    amount: toNumber(input.amount),
    datesp: toApiDate(input.datesp),
    dateep: toApiDate(input.dateep),
  };
  // Date de paiement et date de valeur : optionnelles. On ne les envoie
  // que si elles sont renseignées (sinon Dolibarr les laisse à null —
  // on ne force PAS la date du jour).
  if (input.datep) payload.datep = toApiDate(input.datep);
  if (input.datev) payload.datev = toApiDate(input.datev);
  // Mode de règlement : la classe Salary lit la propriété `type_payment`
  // (et non `fk_typepayment`) au moment du create() → c'est ce nom qu'il
  // faut envoyer pour qu'il soit bien persisté.
  if (input.fk_typepayment) payload.type_payment = Number(input.fk_typepayment);

  // L'API renvoie directement l'id (entier) du salaire créé.
  return api.post("/salaries", payload);
}

/**
 * Liste les salaires, avec filtres optionnels.
 * @param {Object} [criteria]
 * @param {number|string} [criteria.employeeId]  filtrer sur un salarié
 * @param {string} [criteria.label]              libellé contient...
 * @param {number} [criteria.limit=100]
 * @param {number} [criteria.page=0]
 * @returns {Promise<Array>} salaires normalisés (voir mapSalary)
 */
export async function listSalaries(criteria = {}) {
  const { employeeId, label, limit = 100, page = 0 } = criteria;

  const clauses = [];
  if (employeeId) clauses.push(eqClause("t.fk_user", employeeId));
  if (label && label.trim()) clauses.push(likeClause("t.label", label.trim()));

  const params = {
    limit,
    page,
    sortfield: "t.dateep",
    sortorder: "DESC",
  };
  const sqlfilters = joinClauses(clauses, "and");
  if (sqlfilters) params.sqlfilters = sqlfilters;

  try {
    const rows = await api.get("/salaries", params);
    return Array.isArray(rows) ? rows.map(mapSalary) : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Récupère un salaire par son id.
 * @param {number|string} id
 * @returns {Promise<Object>} salaire normalisé
 */
export async function getSalary(id) {
  const salary = await api.get(`/salaries/${id}`);
  return mapSalary(salary);
}

/**
 * Supprime un salaire par son id.
 * Route Dolibarr : DELETE /salaries/salary/{id} (méthode deleteSalary).
 * Attention : Supprimer d'abord ses versements (voir deleteSalaryPayment).
 * @param {number|string} id
 * @returns {Promise<any>}
 */
export async function deleteSalary(id) {
  return api.del(`/salaries/salary/${id}`);
}

/**
 * Projette un salaire Dolibarr brut sur une forme stable pour l'UI.
 * @param {Object} s salaire brut
 */
export function mapSalary(s) {
  return {
    id: s.id,
    ref: s.ref,
    label: s.label || "",
    employeeId: s.fk_user,
    amount: toNumber(s.amount),
    periodStart: s.datesp,
    periodEnd: s.dateep,
    valueDate: s.datev,
    // Mode de règlement prévu (id), exposé par la liste via `type_payment`.
    typePaymentId: s.type_payment,
    // `paye` = 1 quand Dolibarr considère le salaire totalement réglé.
    isPaid: String(s.paye) === "1",
    status: s.status,
  };
}

/* ──────────────────────────── Paiements ─────────────────────────── */

/**
 * Liste les paiements (versements) rattachés à un salaire donné.
 *
 * Attention : L'endpoint Dolibarr `GET /salaries/payments` (getAllPayments) n'accepte
 * NI `sqlfilters` NI filtre par salaire : il renvoie TOUS les paiements.
 * On filtre donc côté client sur `fk_salary`. C'est essentiel pour calculer
 * correctement le solde d'un salaire (voir computeSalaryBalance).
 *
 * @param {number|string} salaryId
 * @returns {Promise<Array>} paiements normalisés du salaire (voir mapPayment)
 */
export async function listSalaryPayments(salaryId) {
  const all = await listAllSalaryPayments({ limit: 1000 });
  return all.filter((p) => String(p.salaryId) === String(salaryId));
}

/**
 * Liste TOUS les paiements de salaires (tous salaires confondus).
 * Utile pour les statistiques globales (ex: dashboard par mois).
 * @param {Object} [opts]
 * @param {number} [opts.limit=1000]
 * @param {number} [opts.page=0]
 * @returns {Promise<Array>} paiements normalisés (voir mapPayment)
 */
export async function listAllSalaryPayments({ limit = 1000, page = 0 } = {}) {
  try {
    const rows = await api.get("/salaries/payments", { limit, page });
    return Array.isArray(rows) ? rows.map(mapPayment) : [];
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

/**
 * Projette un paiement Dolibarr brut sur une forme stable pour l'UI.
 * @param {Object} p paiement brut
 */
export function mapPayment(p) {
  return {
    id: p.id,
    salaryId: p.fk_salary,
    amount: toNumber(p.amount),
    date: p.datep || p.datepaye,
    typeId: p.fk_typepayment,
  };
}

/**
 * Ajoute un versement (paiement partiel ou total) sur un salaire.
 *
 * Particularités de l'API Dolibarr respectées ici :
 *  - `chid`    : id du salaire (redondant avec l'URL mais exigé).
 *  - `amounts` : tableau associatif { idSalaire: montant } — Dolibarr
 *                ventile le paiement par salaire ; on n'en règle qu'un.
 *  - `datepaye`: date du versement "YYYY-MM-DD".
 *  - `accountid` : compte bancaire (module Banque activé).
 *
 * @param {number|string} salaryId
 * @param {Object} payment
 * @param {number} payment.amount                 montant du versement
 * @param {string} payment.date                   "YYYY-MM-DD"
 * @param {number} payment.typeId                  mode de règlement (paiementtype)
 * @param {number} [payment.accountId]             compte bancaire
 * @returns {Promise<number>} id du paiement créé
 */
export async function addSalaryPayment(salaryId, payment) {
  const typeId = Number(payment.typeId);
  const body = {
    chid: Number(salaryId),
    // `paiementtype` est exigé par la validation de l'API, MAIS PaymentSalary
    // ::create() persiste le mode depuis la propriété `fk_typepayment`. On
    // envoie donc les DEUX, sinon le versement est enregistré sans mode
    // (fk_typepayment=0 → la fiche affiche la clé brute "PaymentType").
    paiementtype: typeId,
    fk_typepayment: typeId,
    datepaye: toApiDate(payment.date),
    amounts: { [salaryId]: toNumber(payment.amount) },
    accountid: Number(payment.accountId ?? DEFAULT_BANK_ACCOUNT_ID),
  };
  return api.post(`/salaries/${salaryId}/payments`, body);
}

/**
 * Supprime un versement par son id de PAIEMENT.
 * Route Dolibarr : DELETE /salaries/{paymentId}/payments
 * (attention : ici l'{id} de l'URL est l'id du PAIEMENT, pas du salaire).
 * @param {number|string} paymentId
 * @returns {Promise<any>}
 */
export async function deleteSalaryPayment(paymentId) {
  return api.del(`/salaries/${paymentId}/payments`);
}

/* ─────────────────────── Règles métier (calculs) ─────────────────── */

/**
 * Somme des versements déjà effectués.
 * @param {Array<{amount:number}>} payments
 * @returns {number}
 */
export function sumPayments(payments) {
  return (payments || []).reduce((total, p) => total + toNumber(p.amount), 0);
}

/**
 * Calcule l'état de règlement d'un salaire à partir de ses paiements.
 * C'est LA fonction centrale du paiement en plusieurs fois : tant que
 * `remaining > 0`, on peut ajouter un nouveau versement.
 *
 * @param {Object} salary    salaire normalisé (doit avoir .amount)
 * @param {Array}  payments  paiements normalisés
 * @returns {{ total:number, paid:number, remaining:number,
 *             isFullyPaid:boolean, progress:number }}
 *          progress = ratio payé (0 → 1) utile pour une barre de progression.
 */
export function computeSalaryBalance(salary, payments) {
  const total = toNumber(salary?.amount);
  const paid = sumPayments(payments);
  const remaining = Math.max(0, round2(total - paid));
  return {
    total,
    paid: round2(paid),
    remaining,
    isFullyPaid: remaining <= 0 && total > 0,
    progress: total > 0 ? Math.min(1, paid / total) : 0,
  };
}

/**
 * Arrondi monétaire à 2 décimales (évite les artefacts de flottants).
 * @param {number} n
 */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Retrouve le libellé lisible d'un mode de règlement à partir de son id.
 * @param {number|string} typeId
 * @returns {string}
 */
export function paymentTypeLabel(typeId) {
  const found = PAYMENT_TYPES.find((t) => String(t.id) === String(typeId));
  return found ? found.label : "—";
}

/* ─────────────────── Statut de règlement d'un salaire ────────────── */

/**
 * Les trois statuts possibles d'un salaire, déduits de ses versements.
 * `tone` correspond à une classe de badge (ok / warn / muted).
 */
export const SALARY_STATUSES = {
  paye: { key: "paye", label: "Payé", tone: "ok" },
  partiel: { key: "partiel", label: "Partiellement réglé", tone: "warn" },
  impaye: { key: "impaye", label: "Impayé", tone: "muted" },
};

/**
 * Déduit le statut d'un salaire à partir de son solde calculé.
 * @param {{paid:number, isFullyPaid:boolean}} balance  (voir computeSalaryBalance)
 * @returns {"paye"|"partiel"|"impaye"}
 */
export function salaryStatusOf(balance) {
  if (balance.isFullyPaid) return "paye";
  if (balance.paid > 0) return "partiel";
  return "impaye";
}

/**
 * Liste les salaires enrichis de leur état de règlement et du nom du
 * salarié — données nécessaires à la page "liste des salaires".
 *
 * Stratégie efficace : 3 appels en parallèle (salaires + tous les
 * versements + salariés), puis croisement en mémoire. On évite ainsi un
 * appel "paiements" par salaire.
 *
 * @param {Object} [criteria]  transmis à listSalaries (employeeId, label…)
 * @returns {Promise<Array>} salaires + { employeeName, paid, remaining,
 *                           progress, statusKey }
 */
export async function listSalariesWithBalance(criteria = {}) {
  const [salaries, payments, employees] = await Promise.all([
    listSalaries({ limit: 1000, ...criteria }),
    listAllSalaryPayments({ limit: 5000 }),
    listEmployees({ onlyEmployees: false, status: "", limit: 1000 }),
  ]);

  // Index : nom du salarié + versements regroupés par salaire.
  const nameByEmployee = new Map(employees.map((e) => [String(e.id), e.fullName]));
  const paymentsBySalary = new Map();
  for (const p of payments) {
    const key = String(p.salaryId);
    if (!paymentsBySalary.has(key)) paymentsBySalary.set(key, []);
    paymentsBySalary.get(key).push(p);
  }

  return salaries.map((s) => {
    const balance = computeSalaryBalance(s, paymentsBySalary.get(String(s.id)) || []);
    return {
      ...s,
      employeeName: nameByEmployee.get(String(s.employeeId)) || `#${s.employeeId}`,
      paid: balance.paid,
      remaining: balance.remaining,
      progress: balance.progress,
      statusKey: salaryStatusOf(balance),
    };
  });
}

/**
 * Récupère la photo d'un salarié sous forme de data URL affichable.
 *
 * `GET /documents/download` ne renvoie PAS un binaire mais un JSON
 *   { filename, "content-type", filesize, content (base64), encoding }.
 * On construit donc une data URL `data:<mime>;base64,<content>`.
 * Le paramètre attendu est `original_file` (et non `file`).
 *
 * @param {number|string} userId
 * @param {string} fileName   nom du fichier photo (ex: "1.png")
 * @returns {Promise<string|null>} data URL, ou null si pas de photo / introuvable
 */
export async function getEmployeePhoto(userId, fileName) {
  if (!userId || !fileName) return null;
  try {
    const res = await api.get("/documents/download", {
      modulepart: "user",
      original_file: `${userId}/photos/${fileName}`,
    });
    if (!res || !res.content) return null;
    const mime = res["content-type"] || "image/png";
    return `data:${mime};base64,${res.content}`;
  } catch (err) {
    if (err.status === 404) return null; // fichier absent : pas de photo
    throw err;
  }
}

export async function getEmployeDetailById(id) {
  const [user, salaries, payments] = await Promise.all([
    api.get(`/users/${id}`),
    api.get("/salaries"),
    api.get("/salaries/payments"),
  ]);

  return {
    user,
    salaries,
    payments,
  };
}

export async function salaryGroupByJob() {
  const users = await api.get("/users");
  const sal = await api.get("/salaries");
  const jobByUserId = {};

  users.forEach(user => {
      jobByUserId[user.id] = user.job || "Sans poste";
  });
  const totalByJob = sal.reduce((acc, salary) => {
  const job = jobByUserId[salary.fk_user] || "Sans poste";

    acc[job] = (acc[job] || 0) + Number(salary.amount);

    return acc;
  }, {});
  const result = Object.entries(totalByJob).map(([job, total]) => ({
      job,
      total,
  }));
  return result;
}

/**
 * Nombre de jours entre deux dates, bornes incluses.
 * @param {Date} debut
 * @param {Date} fin
 * @returns {number}
 */
export function getNbrJourEntre(debut, fin) {
  const MS_PAR_JOUR = 1000 * 60 * 60 * 24;
  const a = new Date(debut); a.setHours(0, 0, 0, 0);
  const b = new Date(fin);   b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / MS_PAR_JOUR) + 1;
}

/** Dernier jour (numéro) d'un mois donné. mois : 1-12. */
export function dernierJourDuMois(annee, mois) {
  return new Date(annee, mois, 0).getDate(); // jour 0 du mois suivant = dernier jour
}

/**
 * Calcule les intervalles NON COUVERTS d'un mois donné, à partir de la liste
 * des intervalles déjà couverts par les salaires existants.
 *
 * Le mois va du jour 1 au dernier jour du mois. On fusionne les intervalles
 * couverts (qui peuvent se chevaucher ou se toucher) puis on renvoie les
 * « trous » restants. Comme tout se situe dans un même mois, on raisonne sur
 * le NUMÉRO de jour (1..dernier), ce qui évite tout problème de dates.
 *
 * @param {Array<{debut: Date, fin: Date}>} couples  intervalles déjà couverts
 * @param {number} annee
 * @param {number} mois  1-12
 * @returns {Array<{debut_intervalle: Date, fin_intervalle: Date}>} trous à couvrir
 */
export function getIntervalleNonCompris(couples, annee, mois) {
  const premierJour = 1;
  const dernierJour = dernierJourDuMois(annee, mois);

  // Bornage de chaque intervalle couvert au mois [1, dernierJour].
  const couverts = (couples || [])
    .map((c) => ({
      d: Math.max(c.debut.getDate(), premierJour),
      f: Math.min(c.fin.getDate(), dernierJour),
    }))
    .filter((c) => c.d <= c.f)
    .sort((a, b) => a.d - b.d);

  // Fusion des intervalles qui se chevauchent ou se touchent (jours contigus).
  const fusionnes = [];
  for (const c of couverts) {
    const prec = fusionnes[fusionnes.length - 1];
    if (prec && c.d <= prec.f + 1) {
      prec.f = Math.max(prec.f, c.f);
    } else {
      fusionnes.push({ ...c });
    }
  }

  // Trous entre le début du mois, les intervalles couverts, et la fin du mois.
  const trous = [];
  let curseur = premierJour;
  for (const c of fusionnes) {
    if (c.d > curseur) trous.push({ d: curseur, f: c.d - 1 });
    curseur = Math.max(curseur, c.f + 1);
  }
  if (curseur <= dernierJour) trous.push({ d: curseur, f: dernierJour });

  // Conversion des numéros de jour en vraies dates (mois - 1 : 0-indexé).
  return trous.map((t) => ({
    debut_intervalle: new Date(annee, mois - 1, t.d),
    fin_intervalle: new Date(annee, mois - 1, t.f),
  }));
}

/**
 * Indique si une date tombe un samedi.
 * getDay() : 0 = dimanche … 6 = samedi.
 * @param {Date} date
 * @returns {boolean}
 */
export function isSaturday(date) {
  return new Date(date).getDay() === 6;
}

/**
 * Indique si une date tombe un dimanche.
 * @param {Date} date
 * @returns {boolean}
 */
export function isSunday(date) {
  return new Date(date).getDay() === 0;
}

/**
 * Indique si une date tombe un weekend (samedi ou dimanche).
 * @param {Date} date
 * @returns {boolean}
 */
export function isWeekend(date) {
  return isSaturday(date) || isSunday(date);
}

/**
 * Calcule le salaire dû sur un intervalle [debut, fin] (bornes incluses).
 *
 * On parcourt chaque jour de l'intervalle et on additionne le salaire
 * journalier, selon les règles suivantes :
 *  - Jour FÉRIÉ : majoré du `pourcentage` fourni (ex: +100 % → jour doublé).
 *  - Jour de WEEKEND :
 *      • Si le samedi (resp. dimanche) n'est PAS coché, cela signifie que les
 *        salariés ne travaillent pas ce jour-là → il n'est PAS compté.
 *      • Si le jour est coché (travaillé), il est majoré du `pct_weekend`.
 *      • Si ce jour de weekend travaillé est AUSSI férié, on applique la
 *        majoration MAXIMALE entre férié et weekend (ex: 50 % férié / 80 %
 *        weekend → on retient 80 %).
 *
 * Asynchrone car checkJourFerie interroge l'API des jours fériés (un appel
 * par jour de l'intervalle).
 *
 * @param {Date}    debut              premier jour (inclus)
 * @param {Date}    fin                dernier jour (inclus)
 * @param {number}  salaire_journalier salaire d'une journée normale
 * @param {number}  pourcentage        majoration en % appliquée aux jours fériés
 * @param {boolean} estSamedi          true → les salariés travaillent le samedi
 * @param {boolean} estDimanche        true → les salariés travaillent le dimanche
 * @param {number}  pct_weekend        majoration en % appliquée aux jours de weekend travaillés
 * @returns {Promise<number>} salaire total de l'intervalle (arrondi à 2 décimales)
 */
export async function calculerSalaireIntervalle(
  debut,
  fin,
  salaire_journalier,
  pourcentage,
  estSamedi = false,
  estDimanche = false,
  pct_weekend = 0
) {
  const journalier = toNumber(salaire_journalier);
  const pct = toNumber(pourcentage);
  const pctWeekend = toNumber(pct_weekend);

  const montant_ferie = journalier * (1 + pct / 100);
  const montant_weekend = journalier * (1 + pctWeekend / 100);

  let total = 0;
  const courant = new Date(debut);
  courant.setHours(0, 0, 0, 0);
  const stop = new Date(fin);
  stop.setHours(0, 0, 0, 0);

  while (courant <= stop) {
    const annee = courant.getFullYear();
    const mois = courant.getMonth() + 1; // 1-12 attendu par l'API
    const jour = courant.getDate();

    const samedi = isSaturday(courant);
    const dimanche = isSunday(courant);

    // Jour de weekend NON travaillé (case décochée) → non compté.
    if ((samedi && !estSamedi) || (dimanche && !estDimanche)) {
      courant.setDate(courant.getDate() + 1);
      continue;
    }

    const estFerie = await checkJourFerie(annee, mois, jour);
    // À ce stade, un jour de weekend est forcément travaillé (le cas non
    // travaillé a été écarté ci-dessus).
    const travailleWeekend = samedi || dimanche;

    if (travailleWeekend && estFerie) {
      total += Math.max(montant_ferie, montant_weekend);
    } else if (travailleWeekend) {
      total += montant_weekend;
    } else if (estFerie) {
      total += montant_ferie;
    } else {
      total += journalier;
    }

    courant.setDate(courant.getDate() + 1);
  }

  return round2(total);
}

export async function getPoste() {
  const resp = await api.get("/users")
  const job = resp.map((r) => ({id: r.id, job: r.job}))
  return job;
}

export async function getEmployeByJob(job) {
  const resp = await api.get("/users")
  const filtre = resp.filter(f => f.job === job)
  return filtre
}

export async function getSalaires(mois, annee) {
  const resp = await api.get("/salaries")
  const filtre = resp.filter((f) => new Date(Number(f.datesp)*1000).getMonth() + 1 === mois && new Date(Number(f.datesp) * 1000).getFullYear() === annee )
  return filtre
}

