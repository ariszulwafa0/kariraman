// /api/cek-loker-foto.js
const gemini = require('../services/geminiService');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: 'Input "imageBase64" tidak boleh kosong.' });
        }
        
        // Ubah Base64 kembali menjadi buffer
        const buffer = Buffer.from(imageBase64, 'base64');
        
        // Kirim buffer ke fungsi analisis foto
        const result = await gemini.analyzePhoto(buffer);

        if (result) { res.status(200).json(result); } 
        else { res.status(500).json({ error: 'Gagal mendapatkan analisis dari AI.' }); }
    } catch (error) {
        console.error('API Error in cek-loker-foto:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.' });
    }
}
