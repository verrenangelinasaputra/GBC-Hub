/**
 * Google Gemini (Generative Language API) — JSON insights for Owner dashboard.
 * Set GEMINI_API_KEY and optional GEMINI_MODEL in .env (jangan commit key).
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let quotaCooldownUntil = 0;

function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Satu ID model: tanpa prefix models/, tanpa koma/gabungan. */
function normalizeModelId(raw) {
  let s = String(raw || "").trim();
  if (!s) return DEFAULT_GEMINI_MODEL;
  if (s.includes(",")) s = s.split(",")[0].trim();
  s = s.replace(/^models\//i, "");
  if (!/^gemini-[a-z0-9.-]+$/i.test(s)) {
    console.warn(`[gemini] GEMINI_MODEL tidak valid: "${String(raw).slice(0, 80)}" → pakai ${DEFAULT_GEMINI_MODEL}`);
    return DEFAULT_GEMINI_MODEL;
  }
  return s;
}

/** Beberapa model dari GEMINI_MODEL (pisah koma) + GEMINI_MODEL_FALLBACK. */
function parseModelListFromEnv() {
  const primaryRaw = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const fromPrimary = String(primaryRaw)
    .split(",")
    .map(s => normalizeModelId(s.trim()))
    .filter(Boolean);
  const fromFallbackEnv = (process.env.GEMINI_MODEL_FALLBACK || "")
    .split(",")
    .map(s => normalizeModelId(s.trim()))
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const m of [...fromPrimary, ...fromFallbackEnv]) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out.length ? out : [DEFAULT_GEMINI_MODEL];
}

function geminiModel() {
  return parseModelListFromEnv()[0];
}

function geminiFallbackModels() {
  const listed = parseModelListFromEnv();
  const useFallback = String(process.env.GEMINI_USE_FALLBACK || "false").toLowerCase() === "true";
  const multiInPrimary = String(process.env.GEMINI_MODEL || "").includes(",");

  if (multiInPrimary || useFallback || listed.length > 1) {
    if (multiInPrimary && !useFallback) {
      console.log(
        "[gemini] GEMINI_MODEL berisi beberapa model (koma) — mencoba berurutan: " + listed.join(" → ")
      );
    }
    return listed;
  }
  return [listed[0]];
}

function parseRetryAfterMs(message) {
  const msg = String(message || "");
  const sec = msg.match(/retry in ([\d.]+)\s*s/i);
  if (sec) return Math.ceil(Number(sec[1]) * 1000) + 500;
  const min = msg.match(/retry in ([\d.]+)\s*m/i);
  if (min) return Math.ceil(Number(min[1]) * 60 * 1000) + 500;
  return Number(process.env.GEMINI_RETRY_DELAY_MS || 3000);
}

function isModelUnavailableMessage(message) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("no longer available") ||
    msg.includes("not found") ||
    msg.includes("not supported") ||
    msg.includes("invalid model") ||
    msg.includes("unexpected model name format")
  );
}

function isQuotaExceededMessage(message) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("free_tier") ||
    msg.includes("free tier") ||
    msg.includes("limit: 0") ||
    msg.includes("exceeded your current quota")
  );
}

function isRetryableGeminiError(status, message) {
  if (isModelUnavailableMessage(message)) return false;
  if (isQuotaExceededMessage(message)) return true;
  const msg = String(message || "").toLowerCase();
  if (status === 429 || status === 503 || status === 500) return true;
  return msg.includes("high demand") || msg.includes("overloaded") || msg.includes("resource exhausted");
}

function apiKeyKind(apiKey) {
  const k = String(apiKey || "").trim();
  if (k.startsWith("AQ.")) return "auth";
  if (k.startsWith("AIza")) return "standard";
  return "unknown";
}

function friendlyGeminiError(message, apiKey) {
  const msg = String(message || "");
  if (/free_tier|free tier|limit:\s*0|limit\s+0/i.test(msg)) {
    const kind = apiKeyKind(apiKey);
    if (kind === "auth") {
      return (
        "Key Gemini (format AQ.) tidak mendapat kuota free tier di project Google Cloud terkait (limit 0). " +
        "Solusi: buka Google Cloud Console → Billing untuk project key tersebut, atau buat key/API di AI Studio dengan kuota aktif. " +
        "Setelah itu restart npm start dan Generate insight sekali."
      );
    }
    return "Kuota free tier Gemini untuk key ini 0 atau habis. Cek AI Studio / billing project, tunggu 1–2 menit, lalu coba sekali lagi.";
  }
  if (isQuotaExceededMessage(msg)) {
    return "Kuota/rate limit Gemini (biasanya ~5 request/menit di free tier). Tunggu 1–2 menit, klik Generate insight sekali saja — hasil sukses di-cache ~30 menit.";
  }
  if (/high demand|overloaded|unavailable|resource exhausted/i.test(msg)) {
    return (
      "Gemini sibuk atau kapasitas model penuh. Tunggu 60–90 detik, jangan klik berulang. " +
      "Opsional di .env: GEMINI_USE_FALLBACK=true dan GEMINI_MODEL_FALLBACK=gemini-2.5-flash-lite,gemini-2.5-flash lalu restart server."
    );
  }
  if (/unexpected model name format/i.test(msg)) {
    return (
      "Format GEMINI_MODEL salah: hanya satu nama model per baris, atau beberapa dipisah koma tanpa teks lain. " +
      "Contoh: GEMINI_MODEL=gemini-3.8-flash dan GEMINI_MODEL_FALLBACK=gemini-2.5-flash-lite,gemini-2.5-flash — restart server."
    );
  }
  if (/no longer available|not found|not supported|invalid model/i.test(msg)) {
    return `Model tidak tersedia untuk key ini. Coba GEMINI_MODEL=gemini-2.5-flash atau gemini-2.5-flash-lite. Detail: ${msg.slice(0, 200)}`;
  }
  if (/access_token_type_unsupported|unauthenticated/i.test(msg)) {
    return "Key Gemini ditolak (format/key rusak). Salin ulang key lengkap dari AI Studio (AQ. atau AIza…), tanpa spasi, lalu restart server.";
  }
  if (/api key|permission|403|401/i.test(msg)) {
    return "API key Gemini ditolak. Buat key baru di aistudio.google.com/app/apikey, update .env, restart npm start.";
  }
  return msg.length > 280 ? `${msg.slice(0, 280)}…` : msg;
}

async function callGeminiOnce(apiKey, model, userPrompt, systemInstruction) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: systemInstruction
      ? { parts: [{ text: systemInstruction }] }
      : undefined,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048),
      responseMimeType: "application/json"
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const err = new Error("Respons Gemini tidak valid.");
    err.status = 502;
    err.retryable = false;
    throw err;
  }

  if (!res.ok) {
    const msg = data?.error?.message || `Gemini HTTP ${res.status}`;
    console.warn(`[gemini] ${model} HTTP ${res.status}: ${String(msg).slice(0, 240)}`);
    const err = new Error(msg);
    err.status = res.status === 403 || res.status === 401 ? 503 : res.status === 429 ? 429 : 502;
    err.retryable = isRetryableGeminiError(res.status, msg);
    err.quota = isQuotaExceededMessage(msg);
    err.retryAfterMs = parseRetryAfterMs(msg);
    throw err;
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("") || "";
  if (!text) {
    const err = new Error("Gemini tidak mengembalikan teks (mungkin diblokir safety filter).");
    err.status = 502;
    err.retryable = false;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    const err = new Error("Gemini mengembalikan JSON yang tidak bisa diparse.");
    err.status = 502;
    err.retryable = false;
    throw err;
  }
}

async function generateGeminiJson(userPrompt, systemInstruction) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("Gemini belum dikonfigurasi. Set GEMINI_API_KEY di .env lalu restart server.");
    err.status = 503;
    throw err;
  }

  if (Date.now() < quotaCooldownUntil) {
    const waitSec = Math.ceil((quotaCooldownUntil - Date.now()) / 1000);
    const err = new Error(
      `Kuota Gemini baru saja limit. Tunggu ~${waitSec} detik sebelum Generate insight lagi.`
    );
    err.status = 429;
    throw err;
  }

  const models = geminiFallbackModels();
  const maxAttemptsPerModel = Number(process.env.GEMINI_RETRY_PER_MODEL || 1);
  let lastError;

  for (const model of models) {
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      try {
        const json = await callGeminiOnce(apiKey, model, userPrompt, systemInstruction);
        quotaCooldownUntil = 0;
        return { json, modelUsed: model };
      } catch (e) {
        lastError = e;
        if (e.status === 401 || e.status === 403) {
          const err = new Error(friendlyGeminiError(e.message, apiKey));
          err.status = 503;
          throw err;
        }
        if (e.quota || isQuotaExceededMessage(e.message)) {
          const waitMs = e.retryAfterMs || 60000;
          quotaCooldownUntil = Date.now() + Math.min(waitMs, 120000);
          if (attempt < maxAttemptsPerModel - 1) {
            await sleep(waitMs);
            continue;
          }
          const err = new Error(friendlyGeminiError(e.message, apiKey));
          err.status = 429;
          throw err;
        }
        if (isModelUnavailableMessage(e.message)) {
          break;
        }
        const retryable = e.retryable !== false && isRetryableGeminiError(e.status, e.message);
        if (retryable && attempt < maxAttemptsPerModel - 1) {
          await sleep(e.retryAfterMs || Number(process.env.GEMINI_RETRY_DELAY_MS || 3000));
          continue;
        }
        break;
      }
    }
  }

  const err = new Error(
    friendlyGeminiError(lastError?.message || "Gemini gagal setelah semua percobaan.", apiKey)
  );
  err.status = lastError?.status === 429 ? 429 : 503;
  throw err;
}

function logGeminiStartupHint() {
  if (!geminiConfigured()) return;
  const key = process.env.GEMINI_API_KEY.trim();
  const kind = apiKeyKind(key);
  const fallback = geminiFallbackModels();
  console.log(
    `Gemini: chain=${fallback.join(" → ")}, key=${kind === "auth" ? "AQ (auth)" : kind === "standard" ? "AIza" : "unknown"}`
  );
  if (kind === "auth") {
    console.log(
      "Gemini: key AQ membutuhkan kuota di project GCP terkait; jika insight gagal terus, cek billing / buat key baru di AI Studio."
    );
  }
}

module.exports = {
  geminiConfigured,
  geminiModel,
  geminiFallbackModels,
  generateGeminiJson,
  logGeminiStartupHint
};
