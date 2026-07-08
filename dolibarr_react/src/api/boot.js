import axios from "axios";

const API_URL = "http://localhost:8082/api/jours-feries";

export async function getAllJourFeries() {
    try {
        const response = await axios.get(`${API_URL}`)
        return Array.isArray(response.data) ? response.data : [];
    } catch (err) {
        throw err
    }
}

export async function getJourFerieById(id) {
    try {
        const response = await axios.get(`${API_URL}/${id}`)
        return response.data;
    } catch (err) {
        throw err
    }
}

export async function createJourFerie(data) {
    try {
        const response = await axios.post(`${API_URL}`, data)
        return response.data;
    } catch (err) {
        throw err
    }
}

export async function updateJourFerie(id, data) {
    try {
        const response = await axios.put(`${API_URL}/${id}`, data)
        return response.data;
    } catch (err) {
        throw err
    }
} 

export async function deleteJourFerie(id) {
    try {
        const response = await axios.delete(`${API_URL}/${id}`)
        return response.data;
    } catch (err) {
        throw err
    }
}

export async function deleteAllJourFeries() {
    try {
        const response = await axios.delete(`${API_URL}`)
        // Le back renvoie { deleted: n }
        return response.data?.deleted ?? 0;
    } catch (err) {
        throw err
    }
}

export async function checkJourFerie(annee, mois, jour) {
    try {
        const response = await axios.get(`${API_URL}/${annee}/${mois}/${jour}`)
        return response.data;
    } catch (err) {
        throw err
    }
}