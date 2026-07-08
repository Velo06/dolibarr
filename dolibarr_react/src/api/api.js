import axios from "axios";

/**
 * Configuration de l'API Dolibarr 23.
 *
 * Les valeurs sont lues depuis les variables d'environnement Vite.
 * Créez un fichier `.env` (ou `.env.local`) à la racine du projet :
 *
 *   VITE_DOLIBARR_API_URL=https://mon-dolibarr.tld/api/index.php
 *   VITE_DOLIBARR_API_KEY=votre_cle_api
 */
// `import.meta.env` est fourni par Vite dans le navigateur ; on se protège
// du cas où il serait absent (ex: exécution hors Vite, tests Node).
const ENV = import.meta.env || {};

const BASE_URL =
  ENV.VITE_DOLIBARR_API_URL ||
  "http://localhost/dolibarr/api/index.php";

const API_KEY = ENV.VITE_DOLIBARR_API_KEY || "";

/**
 * Instance axios pré-configurée pour Dolibarr.
 * Dolibarr s'authentifie via l'en-tête `DOLAPIKEY`.
 */
const http = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    DOLAPIKEY: API_KEY,
  },
  timeout: 30000,
});

/**
 * Appel généralisé aux API Dolibarr.
 *
 * @param {Object}  options
 * @param {string}  options.endpoint        Chemin de la ressource, ex: "/thirdparties", "/invoices/12".
 * @param {string} [options.method="GET"]   Méthode HTTP : GET | POST | PUT | DELETE.
 * @param {Object} [options.data=null]      Corps de la requête (POST / PUT).
 * @param {Object} [options.params=null]    Paramètres de query string (filtres, pagination, tri...).
 * @param {Object} [options.headers={}]     En-têtes supplémentaires éventuels.
 * @param {Object} [options.config={}]      Options axios additionnelles (signal, timeout...).
 * @returns {Promise<any>}                  Données de la réponse (`response.data`).
 * @throws  {Error}                         Erreur normalisée avec `.status` et `.details`.
 */
export async function callApi({
  endpoint,
  method = "GET",
  data = null,
  params = null,
  headers = {},
  config = {},
}) {
  if (!endpoint) {
    throw new Error("callApi: le paramètre `endpoint` est requis.");
  }

  try {
    const response = await http.request({
      url: endpoint,
      method: method.toUpperCase(),
      data,
      params,
      headers,
      ...config,
    });

    return response.data;
  } catch (error) {
    // Normalisation de l'erreur pour faciliter le traitement côté appelant.
    const status = error.response?.status ?? null;
    const details =
      error.response?.data?.error?.message ??
      error.response?.data?.error ??
      error.response?.data ??
      error.message;

    const normalized = new Error(
      `Erreur API Dolibarr [${method.toUpperCase()} ${endpoint}]` +
        (status ? ` (HTTP ${status})` : "") +
        `: ${typeof details === "string" ? details : JSON.stringify(details)}`
    );
    normalized.status = status;
    normalized.details = details;
    normalized.original = error;

    throw normalized;
  }
}

/**
 * Raccourcis pratiques par méthode HTTP.
 * Exemples :
 *   await api.get("/thirdparties", { limit: 10, sortfield: "t.rowid" });
 *   await api.post("/invoices", { socid: 1, lines: [...] });
 *   await api.put("/invoices/12", { note_public: "MAJ" });
 *   await api.del("/invoices/12");
 */
export const api = {
  get: (endpoint, params, config) =>
    callApi({ endpoint, method: "GET", params, config }),

  post: (endpoint, data, config) =>
    callApi({ endpoint, method: "POST", data, config }),

  put: (endpoint, data, config) =>
    callApi({ endpoint, method: "PUT", data, config }),

  del: (endpoint, config) =>
    callApi({ endpoint, method: "DELETE", config }),
};

export { http };
export default callApi;
