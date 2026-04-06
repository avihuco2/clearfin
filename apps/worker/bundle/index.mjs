// src/index.ts
import http from "node:http";
import cron from "node-cron";

// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
if (!process.env["SUPABASE_URL"]) throw new Error("Missing env: SUPABASE_URL");
if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");
var supabase = createClient(
  process.env["SUPABASE_URL"],
  process.env["SUPABASE_SERVICE_ROLE_KEY"],
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// src/jobs/scrape.ts
import { createScraper } from "israeli-bank-scrapers";

// ../../packages/crypto/src/index.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
var ALGORITHM = "aes-256-gcm";
var TAG_LENGTH = 16;
function decrypt(ciphertext, iv, tag, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (64 hex chars)");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"), {
    authTagLength: TAG_LENGTH
  });
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}

// src/lib/redis.ts
import { Redis } from "@upstash/redis";
if (!process.env["UPSTASH_REDIS_REST_URL"]) throw new Error("Missing env: UPSTASH_REDIS_REST_URL");
if (!process.env["UPSTASH_REDIS_REST_TOKEN"]) throw new Error("Missing env: UPSTASH_REDIS_REST_TOKEN");
var redis = new Redis({
  url: process.env["UPSTASH_REDIS_REST_URL"],
  token: process.env["UPSTASH_REDIS_REST_TOKEN"]
});

// src/jobs/scrape.ts
async function logCredentialAccess(userId, bankAccountId, jobId, triggeredBy) {
  try {
    const { error } = await supabase.from("credential_access_logs").insert({
      user_id: userId,
      bank_account_id: bankAccountId,
      action: "decrypted",
      triggered_by: triggeredBy,
      scrape_job_id: jobId
    });
    if (error) console.error("[audit] failed to write log:", error.message);
  } catch (err) {
    console.error("[audit] unexpected error:", err);
  }
}
var OTP_POLL_INTERVAL_MS = 5e3;
var OTP_TIMEOUT_MS = 12e4;
async function waitForOtp(bankAccountId) {
  await supabase.from("bank_accounts").update({ scrape_status: "awaiting_otp" }).eq("id", bankAccountId);
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error("OTP_TIMEOUT"));
    }, OTP_TIMEOUT_MS);
    let poll;
    poll = setInterval(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => {
        const otpKey = `otp:${bankAccountId}`;
        const otp = await redis.get(otpKey);
        if (otp !== null) {
          clearTimeout(deadline);
          clearInterval(poll);
          await redis.del(otpKey);
          resolve(otp);
        }
      },
      OTP_POLL_INTERVAL_MS
    );
  });
}
function toIsraeliDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("sv", { timeZone: "Asia/Jerusalem" });
}
function resolveStartDate(lastScrapedAt, hasTransactions) {
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1e3);
  if (!lastScrapedAt || !hasTransactions) {
    return threeMonthsAgo;
  }
  const lastSync = new Date(new Date(lastScrapedAt).getTime() - 24 * 60 * 60 * 1e3);
  return lastSync > threeMonthsAgo ? lastSync : threeMonthsAgo;
}
async function processScrapeJob(job) {
  const { userId, bankAccountId } = job.data;
  const { data: account, error: fetchError } = await supabase.from("bank_accounts").select(
    "company_id, encrypted_credentials, credentials_iv, credentials_tag, last_scraped_at"
  ).eq("id", bankAccountId).eq("user_id", userId).single();
  if (fetchError || !account) {
    throw new Error(
      `bank_account not found: id=${bankAccountId} user=${userId}`
    );
  }
  if (!process.env["CREDENTIALS_ENCRYPTION_KEY"]) {
    throw new Error("Missing env: CREDENTIALS_ENCRYPTION_KEY");
  }
  const storedCreds = decrypt(
    account.encrypted_credentials,
    account.credentials_iv,
    account.credentials_tag,
    process.env["CREDENTIALS_ENCRYPTION_KEY"]
  );
  void logCredentialAccess(userId, bankAccountId, String(job.id), job.data.triggeredBy);
  const credentials = {
    ...storedCreds,
    otpCodeRetriever: async () => waitForOtp(bankAccountId)
  };
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  await Promise.all([
    supabase.from("scrape_jobs").update({ status: "running", started_at: startedAt }).eq("id", job.id),
    supabase.from("bank_accounts").update({ scrape_status: "running" }).eq("id", bankAccountId)
  ]);
  const { count: txnCount } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("bank_account_id", bankAccountId);
  const hasTransactions = (txnCount ?? 0) > 0;
  const startDate = resolveStartDate(account.last_scraped_at, hasTransactions);
  console.log(`[scrape] job=${job.id} startDate=${startDate.toISOString().slice(0, 10)} hasTransactions=${hasTransactions}`);
  const scraper = createScraper({
    companyId: account.company_id,
    startDate,
    showBrowser: false,
    verbose: true,
    // Required for Chromium running inside Docker/EC2 containers:
    // --no-sandbox: container runs as non-root without kernel namespaces
    // --disable-dev-shm-usage: /dev/shm is tiny in containers, use /tmp instead
    // --disable-gpu: no GPU in headless server environment
    timeout: 9e4,
    executablePath: process.env["PUPPETEER_EXECUTABLE_PATH"] ?? "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--mute-audio"
    ]
  });
  scraper.onProgress((companyId, { type }) => {
    console.log(`[scrape] job=${job.id} company=${companyId} event=${type}`);
  });
  let result;
  try {
    result = await scraper.scrape(credentials);
  } catch (scraperErr) {
    const message = scraperErr instanceof Error ? scraperErr.message : "UNKNOWN_SCRAPER_ERROR";
    await markError(bankAccountId, String(job.id), message);
    throw scraperErr;
  }
  if (!result.success) {
    const errorDetail = result.errorMessage ? `${result.errorType ?? "GENERIC"}: ${result.errorMessage}` : result.errorType ?? "SCRAPE_FAILED";
    console.error(`[scrape] job=${job.id} errorType=${result.errorType} errorMessage=${result.errorMessage ?? "none"}`);
    await markError(bankAccountId, String(job.id), errorDetail);
    throw new Error(errorDetail);
  }
  let transactionsAdded = 0;
  const accounts = result.accounts ?? [];
  console.log(`[scrape] job=${job.id} accounts=${accounts.length} totalTxns=${accounts.reduce((s, a) => s + a.txns.length, 0)}`);
  for (const acc of accounts) {
    console.log(`[scrape] job=${job.id} account=${acc.accountNumber ?? "unknown"} txns=${acc.txns.length}`);
    if (acc.balance !== void 0) {
      await supabase.from("bank_accounts").update({
        account_number: acc.accountNumber ?? null,
        balance: acc.balance,
        balance_updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }).eq("id", bankAccountId);
    }
    if (acc.txns.length === 0) continue;
    const rows = acc.txns.map((txn) => {
      const chargedAmount = txn.chargedAmount || txn.originalAmount || 0;
      const originalAmount = txn.originalAmount || txn.chargedAmount || 0;
      const rawId = txn.identifier?.toString() ?? null;
      const externalId = rawId ?? `synthetic:${toIsraeliDate(txn.date)}:${txn.description}:${chargedAmount}`;
      return {
        user_id: userId,
        bank_account_id: bankAccountId,
        external_id: externalId,
        date: toIsraeliDate(txn.date),
        processed_date: txn.processedDate ? toIsraeliDate(txn.processedDate) : null,
        description: txn.description,
        memo: txn.memo ?? null,
        original_amount: originalAmount,
        original_currency: txn.originalCurrency,
        charged_amount: chargedAmount,
        charged_currency: txn.chargedCurrency ?? "ILS",
        type: txn.type,
        status: txn.status,
        installment_number: txn.installments?.number ?? null,
        installment_total: txn.installments?.total ?? null,
        sub_account: acc.accountNumber ?? null
      };
    }).filter((row) => row.charged_amount !== 0);
    const { count, error: upsertError } = await supabase.from("transactions").upsert(rows, {
      onConflict: "bank_account_id,external_id",
      ignoreDuplicates: true,
      count: "exact"
    });
    if (upsertError) {
      console.error(`[scrape] upsert error bankAccountId=${bankAccountId}:`, upsertError.message, upsertError.code, upsertError.details);
    }
    console.log(`[scrape] job=${job.id} upsert count=${count} error=${upsertError?.message ?? "none"}`);
    transactionsAdded += count ?? 0;
  }
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  await Promise.all([
    supabase.from("bank_accounts").update({
      scrape_status: "idle",
      scrape_error: null,
      last_scraped_at: finishedAt
    }).eq("id", bankAccountId),
    supabase.from("scrape_jobs").update({
      status: "done",
      transactions_added: transactionsAdded,
      finished_at: finishedAt
    }).eq("id", job.id)
  ]);
  console.log(
    `[scrape] job=${job.id} bankAccountId=${bankAccountId} transactionsAdded=${transactionsAdded}`
  );
  return { transactionsAdded };
}
async function markError(bankAccountId, jobId, message) {
  await Promise.all([
    supabase.from("bank_accounts").update({ scrape_status: "error", scrape_error: message }).eq("id", bankAccountId),
    supabase.from("scrape_jobs").update({
      status: "error",
      error_message: message,
      finished_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", jobId)
  ]);
}

// src/index.ts
var concurrency = parseInt(process.env["WORKER_CONCURRENCY"] ?? "3", 10);
var POLL_INTERVAL_MS = 8e3;
var PORT = parseInt(process.env["PORT"] ?? "10000", 10);
var server = http.createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", activeJobs, uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, () => {
  console.log(`[health] listening on port ${PORT}`);
});
var activeJobs = 0;
async function pollAndProcess() {
  if (activeJobs >= concurrency) return;
  const slots = concurrency - activeJobs;
  const { data: jobs, error } = await supabase.from("scrape_jobs").select("id, user_id, bank_account_id, triggered_by").eq("status", "queued").order("created_at", { ascending: true }).limit(slots);
  if (error) {
    console.error("[poller] failed to fetch queued jobs:", error.message);
    return;
  }
  if (!jobs?.length) return;
  for (const row of jobs) {
    const { data: claimed } = await supabase.from("scrape_jobs").update({ status: "running", started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", row.id).eq("status", "queued").select("id").single();
    if (!claimed) continue;
    activeJobs++;
    console.log(`[poller] claimed job=${row.id} bankAccountId=${row.bank_account_id}`);
    const jobData = {
      userId: row.user_id,
      bankAccountId: row.bank_account_id,
      triggeredBy: row.triggered_by ?? "manual"
    };
    processScrapeJob({ id: row.id, data: jobData }).then((result) => {
      console.log(`[poller] job=${row.id} done transactionsAdded=${result.transactionsAdded}`);
    }).catch((err) => {
      console.error(`[poller] job=${row.id} failed:`, err instanceof Error ? err.message : err);
    }).finally(() => {
      activeJobs--;
    });
  }
}
var pollInterval = setInterval(() => {
  void pollAndProcess();
}, POLL_INTERVAL_MS);
console.log(`[worker] started \u2014 polling DB every ${POLL_INTERVAL_MS / 1e3}s, concurrency=${concurrency}`);
void pollAndProcess();
var WEB_URL = process.env["WEB_URL"];
var CRON_SECRET = process.env["CRON_SECRET"];
if (WEB_URL && CRON_SECRET) {
  cron.schedule("0 */6 * * *", async () => {
    console.log("[cron] triggering scheduled scrape");
    try {
      const res = await fetch(`${WEB_URL}/api/cron/scrape`, {
        method: "GET",
        headers: { Authorization: `Bearer ${CRON_SECRET}` }
      });
      if (res.ok) {
        const body = await res.json();
        console.log(`[cron] enqueued ${body.enqueued ?? 0} scrape jobs`);
      } else {
        console.error(`[cron] endpoint returned ${res.status}`);
      }
    } catch (err) {
      console.error(`[cron] fetch failed:`, err instanceof Error ? err.message : err);
    }
  });
  console.log("[cron] scheduled scrape every 6 hours");
} else {
  console.warn("[cron] WEB_URL or CRON_SECRET not set \u2014 scheduled scraping disabled");
}
async function shutdown(signal) {
  console.log(`[worker] ${signal} \u2014 shutting down`);
  clearInterval(pollInterval);
  server.close();
  const deadline = Date.now() + 3e4;
  while (activeJobs > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("[worker] shutdown complete");
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
