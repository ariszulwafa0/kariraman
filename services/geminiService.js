// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const pdf = require('pdf-parse'); // Pastikan pdf-parse ada di package.json

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const modelPro = genAI.getGenerativeModel({ model: "gemini-2.0-flash", safetySettings });
const modelVision = genAI.getGenerativeModel({ model: "gemini-2.0-flash", safetySettings });

const jsonPromptStructure = `
Berikan jawaban HANYA dalam format JSON yang ketat (tanpa markdown \`\`\`json).
SEMUA value di dalam JSON harus berupa string teks murni.
JANGAN gunakan markdown (**...** atau *...*) di dalam string JSON.
JANGAN menggunakan kata ganti orang pertama ("saya", "kami", "Aris") di dalam respons.
{
  "skor_keseluruhan": "Terverifikasi - Lanjutkan dengan Hati-hati" | "Waspada - Verifikasi Lanjut Diperlukan" | "Sangat Berisiko - Kemungkinan Penipuan" | "Tidak Relevan",
  "nama_perusahaan_terdeteksi": "...",
  "poin_positif": [],
  "poin_risiko_dan_kejanggalan": [],
  "observasi_tambahan": [],
  "verifikasi_silang": { "website_resmi_seharusnya": "...", "email_resmi_seharusnya": "..." },
  "saran_verifikasi": "...",
  "data_terdeteksi": { "nomor_telepon": [], "email": [], "url": [], "nomor_rekening": [] }
}`;

function cleanJson(text) {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return text.substring(firstBrace, lastBrace + 1);
    }
    return text.trim();
}

async function generateAnalysis(prompt, model = modelPro, imageParts = null) {
    try {
        const content = imageParts ? [prompt, ...imageParts] : [prompt];
        const result = await model.generateContent(content);
        const response = await result.response;
        const jsonText = cleanJson(response.text());
        try {
            return JSON.parse(jsonText);
        } catch (parseError) {
            console.log("[Plan B] Gagal parsing JSON, memeriksa isi teks balasan...");
            if (jsonText.toLowerCase().includes('tidak relevan')) {
                console.log("[Plan B] Terdeteksi 'Tidak Relevan', membuat JSON manual.");
                return {
                    "skor_keseluruhan": "Tidak Relevan",
                    "saran_verifikasi": "Data yang Anda kirim tidak terdeteksi sebagai lowongan kerja."
                };
            }
            throw parseError; // Lempar error asli jika bukan 'Tidak Relevan'
        }
    } catch (error) {
        console.error("Error saat menghubungi Gemini atau memproses JSON:", error);
        console.error("Prompt yang Gagal:", prompt);
        return null; // Kembalikan null jika ada error API
    }
}

// --- ALUR LOGIKA UTAMA (VERSI BARU - TANPA PERSONA) ---
const ALUR_LOGIKA_UTAMA = `
Anda adalah **Sistem Analis Keamanan AI** yang sangat teliti dan objektif. Anda SANGAT paham taktik penipuan loker di Indonesia.

**ATURAN KONTEKS LOKAL (YANG DIANGGAP WAJAR JIKA BUKTI LAIN KUAT):**
1.  **WA Pribadi HRD:** Wajar jika HRD menghubungi via nomor pribadi.
2.  **Istilah "On Boarding":** Bisa berarti "undangan tes/interview".
3.  **Jadwal Mendadak:** Undangan 2-3 hari ke depan adalah NORMAL.
4.  **Syarat Administrasi:** Permintaan materai dan fotokopi dokumen adalah BIASA.

**ALUR LOGIKA ANALISIS (WAJIB DIIKUTI SECARA BERURUTAN):**

**LANGKAH 1: Cek Red Flag Mutlak (SKOR = SANGAT BERISIKO)**
Cari tanda-tanda ini terlebih dahulu. Jika salah satu ditemukan, langsung tetapkan skor "Sangat Berisiko - Kemungkinan Penipuan".
* **PERMINTAAN TRANSFER UANG:** Deteksi segala bentuk permintaan untuk mentransfer uang (biaya admin, travel, training, seragam, dll).
* **DATA BANK SENSITIF:** Deteksi permintaan data super sensitif seperti "Foto Copy buku rekening tabungan", "SS Livin", "Screenshot M-Banking", "PIN", atau "OTP".

**LANGKAH 2: Cek Fondasi Kepercayaan (Email).**
Jika TIDAK ADA Red Flag Mutlak, validasi email:
* Apakah ada **email dengan domain perusahaan yang sah** (contoh: @saranasukses.com, @astra.co.id)?
    * **YA:** "Fondasi Kepercayaan" = **TERPENUHI**. Masukkan ini sebagai \`poin_positif\` utama. Lanjutkan ke Langkah 3.
    * **TIDAK:** (Misal: hanya @gmail.com, @yahoo.com, atau kontak hanya via WA). Maka "Fondasi Kepercayaan" = **TIDAK TERPENUHI**. Masukkan "Penggunaan email gratis" atau "Kontak hanya via WA" sebagai \`poin_risiko_dan_kejanggalan\` utama. Lanjutkan ke Langkah 4.

**LANGKAH 3: Analisis Jika Fondasi Kepercayaan TERPENUHI (Ada Email Resmi).**
* Skor **HARUS** "Terverifikasi - Lanjutkan dengan Hati-hati".
* Hal-hal dari "Aturan Konteks Lokal" (WA Pribadi, jadwal mendadak) sekarang dianggap **NORMAL** dan hanya masuk ke \`observasi_tambahan\`.
* **JANGAN** masukkan poin-poin normal tersebut ke \`poin_risiko_dan_kejanggalan\`.
* Satu-satunya yang bisa menurunkan skor ke "Waspada" adalah jika ada kejanggalan ekstrem lainnya (misal: alamat tidak ada sama sekali).

**LANGKAH 4: Analisis Jika Fondasi Kepercayaan TIDAK TERPENUHI (Email Gratis/WA).**
* Skor **TIDAK BOLEH** "Terverifikasi". Skor harus "Waspada" atau "Sangat Berisiko".
* Validasi alamat fisik:
    * Jika **Alamat Fisik VALID** (kawasan industri, gedung perkantoran), masukkan sebagai \`poin_positif\`, tapi **SKOR TETAP "Waspada"** karena emailnya tidak resmi.
    * Jika **Alamat Fisik MENCURIGAKAN** (Ruko tidak jelas, perumahan) atau **FIKTIF**, masukkan ini sebagai \`poin_risiko_dan_kejanggalan\` tambahan dan pertimbangkan skor "Sangat Berisiko".
* Masukkan "Penggunaan email gratis" sebagai \`poin_risiko_dan_kejanggalan\` utama.
`;

// --- INSTRUKSI ANALISIS GAMBAR (TETAP ADA) ---
const ANALISIS_GAMBAR_TAMBAHAN = `
**TUGAS ANALISIS VISUAL (KHUSUS GAMBAR):**
Selain menganalisis teks di gambar, lakukan **analisis kualitas visual gambar itu sendiri** sebagai bukti tambahan.

* **Red Flag Kualitas Gambar:**
    1.  **Buram/Pecah:** Apakah gambarnya berkualitas rendah atau buram?
    2.  **Logo Tempelan:** Apakah logo perusahaan terlihat *stretching* (gepeng) atau memiliki resolusi yang berbeda drastis dengan teks?
    3.  **Stempel "RESMI" Generik:** Apakah ada stempel "RESMI" atau "VALID"?
    4.  **Typo di Gambar:** Apakah ada kesalahan ketik (typo) di dalam gambar?

* **Instruksi:** Jika Anda menemukan Red Flag Kualitas Gambar ini, **WAJIB** masukkan temuan tersebut ke dalam \`poin_risiko_dan_kejanggalan\`.
`;

// ========== FUNGSI YANG DIPERBARUI ==========
async function analyzeCompany(companyName) {
    const prompt = `Bertindak sebagai analis bisnis. Berikan ringkasan singkat tentang perusahaan Indonesia bernama "${companyName}". Fokus pada: 1. Nama, 2. Industri, 3. Website, 4. Alamat Kantor Pusat. Jika fiktif, sebutkan. Berikan jawaban HANYA dalam format JSON (tanpa markdown): {"nama_perusahaan": "${companyName}", "ditemukan": boolean, "industri": "...", "website_resmi": "...", "alamat_kantor": "...", "info_tambahan": "..."}`;
    
    try {
        const result = await modelPro.generateContent(prompt);
        const jsonText = cleanJson(result.response.text()); // Dapatkan teksnya dulu

        try {
            // Coba parse JSON seperti biasa
            return JSON.parse(jsonText); 
        } catch (parseError) {
            // --- Plan B ---
            // Jika Gagal Parse, Gemini mungkin menjawab 'tidak ditemukan'
            console.error("Error parsing JSON di analyzeCompany. Teks balasan:", jsonText);
            // Buat respons manual bahwa perusahaan tidak ditemukan
            return {
                "nama_perusahaan": companyName,
                "ditemukan": false,
                "industri": "Tidak diketahui",
                "website_resmi": "Tidak ditemukan",
                "alamat_kantor": "Tidak ditemukan",
                "info_tambahan": "Sistem tidak dapat menemukan informasi valid untuk perusahaan ini. Harap verifikasi nama secara manual."
            };
        }
    } catch (e) { 
        // Ini error API call (bukan parse error)
        console.error("Error API call di analyzeCompany:", e); 
        return null; // Kembalikan null jika ada error koneksi API
    }
}
// ========== AKHIR PERUBAHAN ==========

// --- FUNGSI HELPER BARU UNTUK VERIFIKASI SILANG ---
/**
 * Mengekstrak nama perusahaan dari teks dan memanggil analyzeCompany
 * untuk mendapatkan data pembanding.
 * @param {string} text Teks loker/undangan.
 * @returns {string} String prompt tambahan untuk disisipkan.
 */
async function getCompanyVerificationPrompt(text) {
    let companyInfoPrompt = ""; // Default string kosong
    try {
        const extractPrompt = `Tugas: Deteksi nama perusahaan yang paling mungkin dari teks iklan loker berikut. Balas HANYA dengan nama perusahaan. Jika tidak ada, balas 'TIDAK ADA'. Teks: "${text}"`;
        const extractResult = await modelPro.generateContent(extractPrompt);
        let companyName = (await extractResult.response.text()).trim();
        
        if (companyName !== 'TIDAK ADA' && companyName.length > 3) {
            console.log(`[Verifikasi Silang] Mendeteksi perusahaan: ${companyName}. Mencari info...`);
            // Memanggil fungsi analyzeCompany
            const companyInfo = await analyzeCompany(companyName); 
            
            // Periksa jika companyInfo ada DAN ditemukan
            if (companyInfo && companyInfo.ditemukan) {
                console.log(`[Verifikasi Silang] Info ditemukan: ${companyInfo.website_resmi}, ${companyInfo.alamat_kantor}`);
                // Membuat prompt tambahan untuk AI
                companyInfoPrompt = `
    **DATA VERIFIKASI EKSTERNAL (Hasil Pencarian Internal AI):**
    Anda telah mencari data untuk "${companyName}" dan menemukan:
    * Website Resmi Seharusnya: "${companyInfo.website_resmi || 'Tidak ditemukan'}"
    * Alamat Kantor Seharusnya: "${companyInfo.alamat_kantor || 'Tidak ditemukan'}"
    
    **TUGAS KETAT TAMBAHAN (WAJIB):**
    Bandingkan DATA VERIFIKASI EKSTERNAL di atas dengan data di dalam loker.
    1.  Jika email di loker (misal: @gmail.com atau @pt-loker.com) TIDAK SAMA dengan domain website resmi, ini adalah **POIN RISIKO BESAR**.
    2.  Jika alamat di loker TIDAK SAMA atau JAUH BERBEDA dengan alamat kantor resmi, ini adalah **POIN RISIKO BESAR**.
    3.  Wajib masukkan temuan ini ke \`poin_risiko_dan_kejanggalan\` dan \`verifikasi_silang\`.
                `;
            } else {
                 console.log(`[Verifikasi Silang] Info untuk "${companyName}" tidak ditemukan.`);
            }
        }
    } catch (e) {
        console.error("Gagal melakukan verifikasi silang perusahaan:", e);
        // Tetap lanjutkan analisis meskipun verifikasi silang gagal
    }
    return companyInfoPrompt;
}


// --- FUNGSI MODIFIKASI: analyzeText ---
async function analyzeText(text) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // PANGGIL HELPER VERIFIKASI
    const companyInfoPrompt = await getCompanyVerificationPrompt(text);

    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    
    ${companyInfoPrompt} // <-- DATA VERIFIKASI DISISIPKAN DI SINI

    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**

    **IKUTI ALUR LOGIKA INI SECARA KETAT:**
    **LANGKAH 0: PRA-ANALISIS RELEVANSI.**
    * **JIKA SAMA SEKALI TIDAK RELEVAN**, kembalikan HANYA JSON 'Tidak Relevan'.
    * **JIKA RELEVAN**, lanjutkan ke Langkah 1 (dan Tugas Tambahan jika ada).

    **Tugas Anda:**
    1.  Analisis teks loker umum ini: "${text}" menggunakan alur logika di atas.
    2.  Ekstrak data kontak ke dalam objek \`data_terdeteksi\`.
    3.  Isi format JSON berikut.
    ${jsonPromptStructure}`;
    return await generateAnalysis(prompt, modelPro);
}

// --- FUNGSI MODIFIKASI: analyzePhoto ---
async function analyzePhoto(imageBuffer) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const imagePart = { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } };
    
    // LANGKAH 1: Lakukan OCR cepat untuk mendapatkan teks
    let ocrText = "";
    try {
        const ocrPrompt = "Baca dan kembalikan SEMUA teks yang ada di gambar ini. Balas HANYA dengan teks yang diekstrak.";
        const ocrResult = await modelVision.generateContent([ocrPrompt, imagePart]);
        ocrText = (await ocrResult.response.text()).trim();
        if(ocrText.length === 0) {
             console.log("[Verifikasi Silang] OCR tidak menemukan teks di gambar.");
        }
    } catch (e) {
        console.error("Gagal melakukan OCR untuk verifikasi silang:", e);
    }
    
    // LANGKAH 2: Panggil helper verifikasi JIKA teks ditemukan
    let companyInfoPrompt = "";
    if (ocrText.length > 0) {
        companyInfoPrompt = await getCompanyVerificationPrompt(ocrText);
    }
    
    // LANGKAH 3: Buat Prompt Utama
    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    ${ANALISIS_GAMBAR_TAMBAHAN} 
    ${companyInfoPrompt} // <-- DATA VERIFIKASI DISISIPKAN DI SINI
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**

    **Tugas Anda:**
    1.  Baca semua teks yang ada di dalam gambar ini (OCR).
    2.  Analisis teks tersebut sebagai IKLAN LOKER UMUM menggunakan **ALUR LOGIKA KETAT** di atas.
    3.  Lakukan juga **TUGAS ANALISIS VISUAL** pada gambar itu sendiri.
    4.  **LANGKAH 0:** Jika gambar bukan loker (meme, anime, dll), kembalikan JSON 'Tidak Relevan'.
    5.  Ekstrak data kontak dari teks di gambar.
    6.  Isi format JSON berikut.
    ${jsonPromptStructure}`;
    
    return await generateAnalysis(prompt, modelVision, [imagePart]);
}

// --- FUNGSI MODIFIKASI: analyzeInvitation ---
async function analyzeInvitation(data, isImage = false) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let companyInfoPrompt = "";
    let imagePart = null;
    
    if (isImage) {
        imagePart = { inlineData: { data: data.toString("base64"), mimeType: "image/jpeg" } };
        // Lakukan OCR cepat
        let ocrText = "";
        try {
            const ocrPrompt = "Baca dan kembalikan SEMUA teks yang ada di gambar ini. Balas HANYA dengan teks yang diekstrak.";
            const ocrResult = await modelVision.generateContent([ocrPrompt, imagePart]);
            ocrText = (await ocrResult.response.text()).trim();
        } catch (e) {
            console.error("Gagal melakukan OCR untuk verifikasi silang (undangan):", e);
        }
        
        if (ocrText.length > 0) {
            companyInfoPrompt = await getCompanyVerificationPrompt(ocrText);
        }
    } else {
        // 'data' adalah teks
        companyInfoPrompt = await getCompanyVerificationPrompt(data); 
    }

    // Buat Prompt Utama
    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    ${isImage ? ANALISIS_GAMBAR_TAMBAHAN : ''}
    ${companyInfoPrompt} // <-- DATA VERIFIKASI DISISIPKAN DI SINI
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**

    **TUGAS SPESIFIK: Menganalisis PANGGILAN INTERVIEW/TES.**
    Anda menerima sebuah teks/gambar yang merupakan **surat panggilan**. Terapkan semua Alur Logika, namun dengan **ketelitian ekstra** pada:
    1.  Personalisasi: Apakah panggilan ini menyebutkan nama kandidat? Panggilan generik "Bapak/Ibu" lebih mencurigakan.
    2.  Konteks Lamaran: Apakah ada referensi ke posisi yang dilamar?
    3.  Kontak Person: Apakah ada nama HRD yang bisa dihubungi dan kontaknya profesional?

    **Tugas Anda:**
    ${isImage ? '1. Baca semua teks di gambar ini (OCR).' : '1. Analisis teks panggilan berikut:'}
    ${isImage ? '' : `"${data}"`}
    ${isImage ? '2. Lakukan juga TUGAS ANALISIS VISUAL pada gambar panggilan ini.' : ''}
    3.  Analisis teks tersebut menggunakan Alur Logika dan Tugas Spesifik di atas.
    4.  Ekstrak semua data kontak.
    5.  Isi format JSON berikut.
    ${jsonPromptStructure}`;

    if (isImage) {
        return await generateAnalysis(prompt, modelVision, [imagePart]);
    } else {
        return await generateAnalysis(prompt, modelPro);
    }
}

// --- FUNGSI REVIEW (Teks/PDF Saja) ---
async function reviewCV(cvText) {
    const prompt = `
    Anda adalah **Sistem Analis HRD AI.** Tugas Anda adalah memberikan ulasan (review) CV yang detail, suportif, dan terstruktur dengan rapi.
    **ATURAN FORMATTING:** Gunakan *bold* (**teks**), *italic* (*teks*), dan • list (* poin). JANGAN GUNAKAN "---".
    **ATURAN BAHASA:** JANGAN menggunakan sapaan personal ("Halo [Nama]") atau kata ganti orang pertama ("saya"). Langsung berikan ulasan.
    **Aspek ulasan:** Ringkasan/Profil, Pengalaman Kerja, Pendidikan & Skill, Format & Tata Bahasa.
    Berikut adalah teks CV (yang mungkin diekstrak dari PDF):
    ---
    ${cvText}
    ---
    `;
    try {
        const result = await modelPro.generateContent(prompt);
        return result.response.text();
    } catch (error) { console.error("Error di reviewCV:", error); return null; }
}

async function reviewSuratLamaran(lamaranText) {
    const prompt = `
    Anda adalah **Sistem Analis HRD AI.**
    Tugas Anda adalah me-review surat lamaran kerja berikut.
    Gunakan format markdown (*bold* (**teks**), *italic* (*teks*), dan • list (* poin)). JANGAN GUNAKAN '---'.
    **ATURAN BAHASA:** JANGAN menggunakan sapaan personal atau kata ganti orang pertama ("saya"). Langsung berikan ulasan.
    Fokus ulasan pada: Struktur, Bahasa, dan Konten.
    Berikut adalah teks surat lamaran (yang mungkin diekstrak dari PDF):\n---\n${lamaranText}\n---`;
    try {
        const result = await modelPro.generateContent(prompt);
        return result.response.text();
    } catch (error) { console.error("Error di reviewSuratLamaran:", error); return null; }
}

// --- FUNGSI LAINNYA ---
async function analyzeLink(url) { return await analyzeText(`Ini adalah link untuk dianalisis: ${url}`); }
async function analyzeEmail(email) { return await analyzeText(`Ini adalah email untuk dianalisis: ${email}`); }
async function analyzePdfText(textFromPdf) { return await analyzeText(textFromPdf); }

// --- MODULE EXPORTS (Sudah diperbarui) ---
module.exports = {
    analyzeText,
    analyzeLink,
    analyzeEmail,
    analyzePhoto,
    analyzePdfText,
    analyzeCompany,
    reviewCV,
    reviewSuratLamaran,
    analyzeInvitation
    // reviewCVImage dan reviewLamaranImage sudah dihapus
};
