// /api/cek-perusahaan.js
const gemini = require('../services/geminiService');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const { companyName } = req.body;
        if (!companyName) {
            return res.status(400).json({ error: 'Input "companyName" tidak boleh kosong.' });
        }
        const result = await gemini.analyzeCompany(companyName);
        if (result) {
            res.status(200).json(result);
        } else {
            res.status(500).json({ error: 'Gagal mendapatkan analisis dari AI.' });
        }
    } catch (error) {
        console.error('API Error in cek-perusahaan:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.' });
    }
}
