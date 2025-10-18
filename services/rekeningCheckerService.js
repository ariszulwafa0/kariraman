// services/rekeningCheckerService.js
const axios = require('axios');
const cheerio = require('cheerio');

// =========================================================================
//                  DAFTAR BANK CODES YANG DIPERBARUI
// =========================================================================
const BANK_CODES = {
    // Bank Umum Besar
    'bca': '014',
    'mandiri': '008',
    'bni': '009',
    'bri': '002',
    'bsi': '451',
    'cimb': '022',
    'permata': '013',
    'danamon': '011',
    'panin': '019',
    'ocbc': '028',
    'ocbc nisp': '028',
    'mega': '426',
    'uob': '023',
    'sinarmas': '153',
    'btn': '200',

    // Bank Digital & Lainnya
    'btpn': '213',
    'jenius': '213', // BTPN
    'jago': '542',
    'bank jago': '542',
    'seabank': '535',
    'blu': '501', // BCA Digital
    'blubca': '501',
    'neobank': '490', // Bank Neo Commerce
    'aladin': '947', // Bank Aladin Syariah
    
    // Bank Daerah Populer
    'bjb': '110',
    'bank bjb': '110',
    'jateng': '113',
    'bank jateng': '113',
    'jatim': '114',
    'bank jatim': '114',
    'dki': '111',
    'bank dki': '111',
    'sumut': '117',
    'bank sumut': '117'
};
// =========================================================================

/**
 * Melakukan scraping ke cekrekening.id
 * @param {string} bank - Nama bank (e.g., 'bca', 'mandiri')
 * @param {string} account - Nomor rekening
 * @returns {Promise<object>} Objek hasil pengecekan
 */
async function checkRekening(bank, account) {
    const bankCode = BANK_CODES[bank.toLowerCase()];
    if (!bankCode) {
        return {
            success: false,
            error: `Nama bank '${bank}' tidak didukung. Coba bank umum lainnya.`
        };
    }

    try {
        // Ambil halaman utama untuk mendapatkan token CSRF
        const initialResponse = await axios.get('https://cekrekening.id/home', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(initialResponse.data);
        const token = $('meta[name="csrf-token"]').attr('content');

        if (!token) {
            throw new Error('Gagal mendapatkan token CSRF.');
        }

        // Kirim data ke endpoint pengecekan
        const checkResponse = await axios.post('https://cekrekening.id/check', 
            new URLSearchParams({
                '_token': token,
                'bank_id': bankCode,
                'bank_account': account
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://cekrekening.id/home'
            }
        });

        const resultData = checkResponse.data;

        // Cek jika ada error dari server mereka
        if (resultData.error) {
             return {
                success: false,
                bank,
                account,
                summary: resultData.message || "Nomor rekening tidak ditemukan atau terjadi kesalahan.",
             };
        }

        // Jika berhasil dan ada laporan
        if (resultData.status === 'success' && resultData.data.total > 0) {
            return {
                success: true,
                bank: resultData.data.bank,
                account,
                isReported: true,
                reportCount: resultData.data.total,
                summary: `Rekening ini PERNAH DILAPORKAN terkait penipuan sebanyak ${resultData.data.total} kali.`
            };
        }

        // Jika berhasil dan tidak ada laporan
        return {
            success: true,
            bank: resultData.data.bank,
            account,
            isReported: false,
            reportCount: 0,
            summary: "Rekening ini BELUM PERNAH dilaporkan terkait penipuan."
        };

    } catch (error) {
        console.error("Error saat scraping cekrekening.id:", error);
        return {
            success: false,
            error: "Gagal terhubung ke layanan cekrekening.id."
        };
    }
}

module.exports = { checkRekening };
