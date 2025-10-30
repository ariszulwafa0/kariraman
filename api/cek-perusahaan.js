// Impor service Anda. Sesuaikan path jika folder 'services' Anda ada di luar folder 'api'.
// Asumsi path: /api/cek-perusahaan.js dan /services/geminiService.js
const { analyzeCompany } = require('../services/geminiService');

// Tambahkan ini jika Anda rasa perlu waktu (meskipun cek perusahaan harusnya cepat)
export const maxDuration = 60; 

export default async function handler(req, res) {
    // 1. Pastikan hanya metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Metode tidak diizinkan' });
    }

    // 2. Ambil data dari body
    const { companyName } = req.body;

    if (!companyName) {
        return res.status(400).json({ error: 'Nama perusahaan tidak boleh kosong' });
    }

    try {
        // 3. Panggil fungsi logika dari geminiService
        const result = await analyzeCompany(companyName);
        
        if (result) {
            // 4. Kembalikan hasil sukses
            return res.status(200).json(result);
        } else {
            throw new Error('Hasil analisis kosong dari Gemini');
        }
    } catch (error) {
        // 5. Tangani jika terjadi error
        console.error('Error di API /api/cek-perusahaan:', error);
        return res.status(500).json({ 
            error: 'Gagal menganalisis perusahaan', 
            details: error.message 
        });
    }
}
