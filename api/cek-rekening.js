// /api/cek-rekening.js
const { checkRekening } = require('../services/rekeningCheckerService');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { bank, account } = req.body;

        if (!bank || !account) {
            return res.status(400).json({ error: 'Input "bank" dan "account" tidak boleh kosong.' });
        }

        const result = await checkRekening(bank, account);
        
        if(result.success) {
            res.status(200).json(result);
        } else {
            // Jika ada error dari service, kirim sebagai bad request atau server error
            res.status(result.error.includes("tidak didukung") ? 400 : 500).json(result);
        }

    } catch (error) {
        console.error('API Error in cek-rekening:', error);
        res.status(500).json({ error: 'Terjadi kesalahan internal di server.' });
    }
}
