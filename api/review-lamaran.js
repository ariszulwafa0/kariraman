// /api/review-lamaran.js
const gemini = require('../services/geminiService');
const pdf = require('pdf-parse');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    try {
        const { type, data } = req.body; // type: 'text' atau 'pdf'
        if (!type || !data) {
            return res.status(400).json({ error: 'Input "type" dan "data" tidak boleh kosong.' });
        }

        let lamaranText = "";

        if (type === 'text') {
            lamaranText = data;
        } 
        else if (type === 'pdf') {
            // Ubah Base64 kembali menjadi buffer
            const buffer = Buffer.from(data, 'base64');
            // Ekstrak teks dari PDF
            const pdfData = await pdf(buffer);
            lamaranText = pdfData.text;
        } 
        else {
            return res.status(400).json({ error: 'Tipe file tidak didukung. Harap kirim "text" atau "pdf".' });
        }

        if (lamaranText.length < 50) {
            return res.status(400).json({ error: 'Teks surat lamaran tidak terdeteksi atau terlalu pendek.' });
        }

        // Panggil fungsi reviewSuratLamaran yang berbasis teks
        const resultText = await gemini.reviewSuratLamaran(lamaranText);

        if (resultText) {
            res.setHeader('Content-Type', 'text/plain');
            res.status(200).send(resultText); // Kirim sebagai teks biasa
        } else {
            res.status(500).json({ error: 'Gagal mendapatkan review dari AI.' });
        }
    } catch (error) {
        console.error('API Error in review-lamaran:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.', details: error.message });
    }
}
