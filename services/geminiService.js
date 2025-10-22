// services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const modelPro = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });
const modelVision = genAI.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });

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
    let cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return cleanText.substring(firstBrace, lastBrace + 1);
    }
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        return cleanText.substring(firstBracket, lastBracket + 1);
    }
    return cleanText;
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
                    "saran_verifikasi": "Data yang Anda kirim tidak terdeteksi sebagai lowongan kerja. Mohon kirimkan informasi loker yang lebih jelas."
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

async function analyzeText(text) {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `
    Anda adalah **Budi, seorang HRD berpengalaman dari Indonesia.**
    **KONTEKS PENTING: Tanggal hari ini adalah ${today}.**
    **IKUTI ALUR LOGIKA INI SECARA KETAT:**
    **LANGKAH 0: PRA-ANALISIS RELEVANSI.**
    * **JIKA SAMA SEKALI TIDAK RELEVAN**, kembalikan HANYA JSON berikut, **JANGAN UBAH TULISAN DI DALAM 'saran_verifikasi'**:
      \`\`\`json
      {
        "skor_keseluruhan": "Tidak Relevan",
        "saran_verifikasi": "Teks yang Anda kirim tidak terdeteksi sebagai lowongan kerja. Silakan kirim informasi loker yang lebih jelas."
      }
      \`\`\`
    * **JIKA RELEVAN**, lanjutkan ke Langkah 1.
    **LANGKAH 1: Cek Red Flag Mutlak.**
    * Apakah ada permintaan **TRANSFER UANG**? Jika ADA, langsung skor "Sangat Berisiko".
    **LANGKAH 2: Cek Fondasi Kepercayaan.**
    * Validasi **Nama PT** dan **Alamat Fisik**. Jika keduanya valid, tetapkan **"Fondasi Kepercayaan Tinggi"**.
    **LANGKAH 3: Analisis Berdasarkan Fondasi Kepercayaan.**
    * **JIKA "Fondasi Kepercayaan Tinggi" TERPENUHI:**
        * Anggap "Nomor WA pribadi", "Jadwal mendadak", "Syarat materai/dokumen" sebagai **NORMAL** dan masukkan ke \`observasi_tambahan\`.
        * **DILARANG KERAS** memasukkannya ke \`poin_risiko_dan_kejanggalan\`.
        * Satu-satunya yang bisa jadi \`poin_risiko\` adalah permintaan data super sensitif seperti **SCREENSHOT MOBILE BANKING**.
        * Skor **TIDAK BOLEH** "Sangat Berisiko".
        * **DILARANG** berhalusinasi.
    **Tugas Anda:**
    1. Analisis teks loker ini: "${text}" menggunakan persona dan alur logika di atas.
    2. Ekstrak semua data kontak mentah (nomor telepon, email, URL, nomor rekening) ke dalam objek \`data_terdeteksi\`.
    3. Isi format JSON berikut.
    ${jsonPromptStructure}`;
    return await generateAnalysis(prompt);
}

async function analyzeLink(url) {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `Anda adalah Budi, HRD dari Indonesia. **Tanggal hari ini adalah ${today}.** Lakukan PRA-ANALISIS RELEVANSI. Jika relevan, analisis URL ini: "${url}" menggunakan pemahaman konteks lokal. Jangan lupa ekstrak URL ke 'data_terdeteksi'. ${jsonPromptStructure}`;
    return await generateAnalysis(prompt);
}

async function analyzeEmail(email) {
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `Anda adalah Budi, HRD dari Indonesia. **Tanggal hari ini adalah ${today}.** Lakukan PRA-ANALISIS RELEVANSI. Jika relevan, analisis email ini: "${email}" menggunakan pemahaman konteks lokal. Jangan lupa ekstrak email ke 'data_terdeteksi'. ${jsonPromptStructure}`;
    return await generateAnalysis(prompt);
}

async function analyzeCompany(companyName) {
    const prompt = `
    Bertindak sebagai analis bisnis. Berikan ringkasan singkat tentang perusahaan Indonesia bernama "${companyName}".
    Fokus pada: 1. Nama, 2. Industri, 3. Website, 4. Alamat Kantor Pusat.
    Jika fiktif, sebutkan.
    Berikan jawaban HANYA dalam format JSON (tanpa markdown):
    {
      "nama_perusahaan": "${companyName}", "ditemukan": boolean, "industri": "...", "website_resmi": "...", "alamat_kantor": "...", "info_tambahan": "..."
    }`;
    try {
        const result = await modelPro.generateContent(prompt);
        return JSON.parse(cleanJson(result.response.text()));
    } catch (e) { 
        console.error("Error di analyzeCompany:", e);
        return null; 
    }
}

// Fungsi yang tidak digunakan di API ini tapi tetap disertakan untuk kelengkapan
async function analyzePhoto(imageBuffer) { return { skor_keseluruhan: "Tidak Relevan", saran_verifikasi: "Analisis gambar tidak didukung di API ini." }; }
async function reviewCV(cvText) { return { error: "Fitur tidak tersedia di API ini." }; }
async function reviewSuratLamaran(lamaranText) { return { error: "Fitur tidak tersedia di API ini." }; }
async function analyzePdfText(textFromPdf) { return await analyzeText(textFromPdf); }

module.exports = {
    analyzeText,
    analyzeLink,
    analyzeEmail,
    analyzeCompany,
    analyzePhoto,
    reviewCV,
    reviewSuratLamaran,
    analyzePdfText
};
