const { superAdminCombinedRecap } = require("./sheets");
const { generateGeminiJson, geminiModel, geminiConfigured } = require("./gemini");

const CACHE_TTL_MS = Number(process.env.GEMINI_INSIGHT_CACHE_MS || 30 * 60 * 1000);
const cache = new Map();

function cacheKey(filters) {
  return `${filters.dateFrom || ""}|${filters.dateTo || ""}`;
}

function recapSnapshotForAi(recap, filters) {
  return {
    filter: {
      dateFrom: filters.dateFrom || null,
      dateTo: filters.dateTo || null
    },
    totals: {
      kasBesar: recap.kasBesar,
      kasKecil: recap.kasKecil,
      combined: recap.total,
      transactionCount: recap.count,
      averagePerTransaction: recap.average
    },
    monthlyTrend: recap.trend,
    splitByCashType: recap.byJenis,
    topCategories: (recap.byCategory || []).slice(0, 10),
    topEntities: (recap.byEntity || []).slice(0, 10),
    topPic: (recap.byPic || []).slice(0, 8),
    topFundingSources: (recap.bySumberDana || []).slice(0, 10),
    recentTransactions: (recap.recent || []).slice(0, 15).map(r => ({
      jenis: r.jenis,
      tanggal: r.tanggal,
      entitas: r.entitas,
      category: r.category,
      namaTransaksi: r.namaTransaksi,
      amount: r.amount,
      pic: r.pic,
      sumberDana: r.sumberDana
    }))
  };
}

const SYSTEM_PROMPT = `Kamu adalah CFO advisor untuk GBC (multi-entitas, Kas Besar/Bank + Kas Kecil).
Bahasa: Indonesia, profesional, ringkas, actionable.
Hanya gunakan data yang diberikan; jika data tipis, jelaskan keterbatasannya dan beri rekomendasi proses (bukan angka fiktif).
Output HARUS JSON valid sesuai schema user.`;

function buildUserPrompt(snapshot) {
  return `Analisis data pengeluaran berikut dan berikan insight level bisnis.

DATA (JSON):
${JSON.stringify(snapshot)}

Schema JSON output (wajib):
{
  "executiveSummary": "string, 2-4 kalimat ringkas untuk owner",
  "highlights": ["string", ... max 5 bullet positif/netral],
  "rootCauses": [
    { "title": "string", "detail": "string", "evidence": "string merujuk data" }
  ],
  "nextPlan": [
    { "title": "string", "horizon": "7 hari|30 hari|90 hari", "action": "string konkret" }
  ],
  "solutions": [
    { "title": "string", "expectedImpact": "string", "priority": "tinggi|sedang|rendah" }
  ],
  "watchlist": ["string risiko/anomali yang perlu dimonitor, max 5"]
}

rootCauses max 4, nextPlan max 5, solutions max 5.`;
}

async function generateOwnerInsights(filters = {}) {
  if (!geminiConfigured()) {
    const err = new Error("GEMINI_API_KEY belum di-set di .env.");
    err.status = 503;
    throw err;
  }

  const key = cacheKey(filters);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return { ...hit.payload, cached: true };
  }

  const recap = await superAdminCombinedRecap(filters);
  const snapshot = recapSnapshotForAi(recap, filters);
  const { json: insights, modelUsed } = await generateGeminiJson(buildUserPrompt(snapshot), SYSTEM_PROMPT);

  const payload = {
    insights,
    recapMeta: {
      count: recap.count,
      total: recap.total,
      kasBesar: recap.kasBesar,
      kasKecil: recap.kasKecil
    },
    generatedAt: new Date().toISOString(),
    model: modelUsed || geminiModel(),
    cached: false
  };

  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}

module.exports = {
  geminiConfigured,
  generateOwnerInsights
};
