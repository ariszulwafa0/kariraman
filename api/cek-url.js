// /api/cek-url.js
const gemini = require('../services/geminiService');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'Input "url" tidak boleh kosong.' });
        }
        const result = await gemini.analyzeLink(url);
        if (result) {
            res.status(200).json(result);
        } else {
            res.status(500).json({ error: 'Gagal mendapatkan analisis dari AI.' });
        }
    } catch (error) {
        console.error('API Error in cek-url:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.' });
    }
}
