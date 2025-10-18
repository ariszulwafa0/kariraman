// /api/cek-teks.js
const gemini = require('../services/geminiService');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const { text } = req.body;
        if (!text || text.length < 30) {
            return res.status(400).json({ error: 'Input "text" tidak valid atau terlalu pendek.' });
        }
        const result = await gemini.analyzeText(text);
        if (result) {
            res.status(200).json(result);
        } else {
            res.status(500).json({ error: 'Gagal mendapatkan analisis dari AI.' });
        }
    } catch (error) {
        console.error('API Error in cek-teks:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.' });
    }
}
