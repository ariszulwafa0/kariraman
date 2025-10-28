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
Berikan jawaban HANYA dalam format JSON yang ketat (tanpa markdown \`\`\`json):
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
            throw parseError;
        }
    } catch (error) {
        console.error("Error saat menghubungi Gemini atau memproses JSON:", error);
        console.error("Prompt yang Gagal:", prompt);
        return null;
    }
}

const ALUR_LOGIKA_UTAMA = `
Anda adalah **Aris, seorang HRD berpengalaman dari Indonesia.** Anda SANGAT paham seluk-beluk dan kebiasaan proses rekrutmen lokal.

**ATURAN KONTEKS LOKAL INDONESIA (WAJIB DIPAHAMI):**
1.  **WA Pribadi HRD:** Wajar jika HRD menghubungi via nomor pribadi.
2.  **Istilah "On Boarding":** Bisa berarti "undangan tes/interview".
3.  **Jadwal Mendadak:** Undangan 2-3 hari ke depan adalah NORMAL.
4.  **Syarat Administrasi:** Permintaan materai dan fotokopi dokumen adalah BIASA.

**ALUR LOGIKA BARU (WAJIB DIIKUTI):**
**LANGKAH 1: Cek Red Flag Mutlak.**
* Apakah ada permintaan **TRANSFER UANG**? Jika ADA, langsung skor "Sangat Berisiko".
**LANGKAH 2: Cek Fondasi Kepercayaan.**
* Jika TIDAK ADA permintaan uang, validasi **Email Perusahaan**, **Nama PT**, dan **Alamat Fisik**.
* **ATURAN EMAS:** Jika ada **email dengan domain perusahaan yang sah**, maka **"Fondasi Kepercayaan" LANGSUNG TERPENUHI**.
* Jika tidak ada email, "Fondasi Kepercayaan" terpenuhi jika Nama PT dan Alamat Fisik-nya valid.
**LANGKAH 3: Analisis Berdasarkan Fondasi Kepercayaan.**
* **JIKA "Fondasi Kepercayaan" TERPENUHI:**
    * Anggap "Nomor WA pribadi", "Jadwal mendadak", "Syarat materai/dokumen" sebagai **NORMAL** dan masukkan ke \`observasi_tambahan\`.
    * **DILARANG KERAS** memasukkannya ke \`poin_risiko_dan_kejanggalan\`.
    * Satu-satunya yang bisa jadi \`poin_risiko\` adalah permintaan **SCREENSHOT MOBILE BANKING**.
    * Skor **TIDAK BOLEH** "Waspada" atau "Sangat Berisiko".
    * **DILARANG** berhalusinasi.
`;

async function analyzeText(text) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**
    **Tugas:** Analisis teks loker umum ini: "${text}".
    **LANGKAH 0:** Jika tidak relevan, kembalikan JSON 'Tidak Relevan'.
    (Sisa instruksi...)
    ${jsonPromptStructure}`;
    return await generateAnalysis(prompt);
}

async function analyzePhoto(imageBuffer) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const imagePart = { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } };
    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**
    **Tugas Anda:**
    1.  Baca semua teks di gambar (OCR).
    2.  Analisis teks tersebut sebagai IKLAN LOKER UMUM menggunakan **ALUR LOGIKA KETAT** di atas.
    3.  **LANGKAH 0:** Jika gambar bukan loker, kembalikan JSON 'Tidak Relevan'.
    4.  Ekstrak data kontak dari gambar.
    ${jsonPromptStructure}`;
    return await generateAnalysis(prompt, modelVision, [imagePart]);
}

async function analyzeInvitation(data, isImage = false) {
    const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `
    ${ALUR_LOGIKA_UTAMA}
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**
    **TUGAS SPESIFIK: Menganalisis PANGGILAN INTERVIEW/TES.**
    Terapkan Alur Logika dengan ketelitian ekstra pada: Personalisasi, Konteks Lamaran, Kontak Person.
    **Tugas Anda:**
    ${isImage ? '1. Baca semua teks di gambar ini (OCR).' : '1. Analisis teks panggilan berikut:'}
    ${isImage ? '' : `"${data}"`}
    2.  Analisis teks tersebut.
    3.  Ekstrak data kontak.
    ${jsonPromptStructure}`;

    if (isImage) {
        const imagePart = { inlineData: { data: data.toString("base64"), mimeType: "image/jpeg" } };
        return await generateAnalysis(prompt, modelVision, [imagePart]);
    } else {
        return await generateAnalysis(prompt);
    }
}

async function reviewCV(cvText) {
    const prompt = `
    Anda adalah **Aris, seorang HRD profesional dan berpengalaman di Indonesia.** Tugas Anda adalah memberikan ulasan (review) CV yang detail, suportif, dan terstruktur dengan rapi.
    **IKUTI ATURAN FORMATTING WHATSAPP INI DENGAN SANGAT KETAT:**
    1.  **Bold:** Gunakan *satu tanda bintang* di awal dan akhir untuk teks tebal.
    2.  **List:** Gunakan simbol • (bullet) untuk sub-poin.
    3.  **Larangan:** **JANGAN PERNAH** menggunakan "---".
    Aspek yang perlu diulas: Ringkasan/Profil, Pengalaman Kerja, Pendidikan & Skill, Format & Tata Bahasa.
    Berikut adalah teks CV yang perlu diulas:
    ---
    ${cvText}
    ---
    `;
    try {
        const result = await modelPro.generateContent(prompt);
        return result.response.text();
    } catch (error) { console.error("Error di reviewCV:", error); return null; }
}

async function reviewCVImage(imageBuffer) {
    const prompt = `
    Anda adalah Aris, seorang HRD profesional.
    Tugas Anda adalah:
    1.  Baca (OCR) semua teks yang ada di dalam gambar CV ini.
    2.  Setelah Anda membacanya, berikan ulasan (review) CV yang detail, suportif, dan terstruktur dengan rapi.
    3.  Ikuti ATURAN FORMATTING WHATSAPP KETAT: Gunakan *tebal*, • list, JANGAN '---'.
    4.  Fokus ulasan pada: Ringkasan/Profil, Pengalaman Kerja, Pendidikan & Skill, Format & Tata Bahasa.
    `;
    const imagePart = { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } };
    try {
        const result = await modelVision.generateContent([prompt, imagePart]);
        return result.response.text();
    } catch (error) {
        console.error("Error di reviewCVImage:", error);
        return null;
    }
}

async function reviewSuratLamaran(lamaranText) {
    const prompt = `
    Anda adalah Aris, seorang HRD profesional dari Indonesia.
    Tugas Anda adalah me-review surat lamaran kerja berikut.
    Gunakan format markdown WhatsApp (*tebal*) dan bullet point (•). JANGAN GUNAKAN '---'.
    Fokus ulasan pada: Struktur, Bahasa, dan Konten.
    Berikut adalah teks surat lamaran yang perlu diulas:\n---\n${lamaranText}\n---`;
    try {
        const result = await modelPro.generateContent(prompt);
        return result.response.text();
    } catch (error) { console.error("Error di reviewSuratLamaran:", error); return null; }
}

async function reviewLamaranImage(imageBuffer) {
    const prompt = `
    Anda adalah Aris, seorang HRD profesional.
    Tugas Anda adalah:
    1.  Baca (OCR) semua teks yang ada di dalam gambar surat lamaran ini.
    2.  Setelah Anda membacanya, berikan ulasan (review) yang fokus pada: Struktur, Bahasa, dan Konten.
    3.  Ikuti ATURAN FORMATTING WHATSAPP KETAT: Gunakan *tebal*, • list, JANGAN '---'.
    `;
    const imagePart = { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } };
    try {
        const result = await modelVision.generateContent([prompt, imagePart]);
        return result.response.text();
    } catch (error) {
        console.error("Error di reviewLamaranImage:", error);
        return null;
    }
}

async function analyzeLink(url) { return await analyzeText(`Ini adalah link untuk dianalisis: ${url}`); }
async function analyzeEmail(email) { return await analyzeText(`Ini adalah email untuk dianalisis: ${email}`); }
async function analyzePdfText(textFromPdf) { return await analyzeText(textFromPdf); }
async function analyzeCompany(companyName) {
    const prompt = `Bertindak sebagai analis bisnis. Berikan ringkasan singkat tentang perusahaan Indonesia bernama "${companyName}". Fokus pada: 1. Nama, 2. Industri, 3. Website, 4. Alamat Kantor Pusat. Jika fiktif, sebutkan. Berikan jawaban HANYA dalam format JSON (tanpa markdown): {"nama_perusahaan": "${companyName}", "ditemukan": boolean, "industri": "...", "website_resmi": "...", "alamat_kantor": "...", "info_tambahan": "..."}`;
    try {
        const result = await modelPro.generateContent(prompt);
        return JSON.parse(cleanJson(result.response.text()));
    } catch (e) { console.error("Error di analyzeCompany:", e); return null; }
}

module.exports = {
    analyzeText,
    analyzeLink,
    analyzeEmail,
    analyzePhoto,
    analyzePdfText,
    analyzeCompany,
    reviewCV,
    reviewSuratLamaran,
    analyzeInvitation,
    reviewCVImage,
    reviewLamaranImage
};
