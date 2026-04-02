import { supabase } from "./supabase";

type TelemetryLevel = "error" | "warn" | "info";

type TelemetryContext = {
  userId?: string | null;
  userEmail?: string | null;
  username?: string | null;
  activeTab?: string | null;
  aktifDonem?: string | null;
  enabled?: boolean;
};

type TelemetryLogInput = {
  level?: TelemetryLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  fingerprint?: string;
  allowWhenDisabled?: boolean;
};

type TelemetryLogRow = {
  level: TelemetryLevel;
  source: string;
  message: string;
  details: Record<string, unknown>;
  page_url: string;
  user_agent: string;
  username: string;
  user_email: string;
  user_id: string;
  session_id: string;
  app_version: string;
};

const TELEMETRY_QUEUE_LIMIT = 30;
const TELEMETRY_BATCH_SIZE = 5;
const DEDUPE_WINDOW_MS = 30_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const FETCH_TIMEOUT_MS = 12_000;
const APP_VERSION = String(import.meta.env.VITE_APP_VERSION || import.meta.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 40);

const sessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const telemetryContext: TelemetryContext = {
  enabled: true,
};

const queue: TelemetryLogRow[] = [];
const dedupeMap = new Map<string, number>();
const sentAtTimestamps: number[] = [];

let installed = false;
let flushPromise: Promise<void> | null = null;
let internalWriteDepth = 0;

const temizleEskiKayitlari = (simdi: number) => {
  for (const [anahtar, zaman] of dedupeMap.entries()) {
    if (simdi - zaman > DEDUPE_WINDOW_MS) dedupeMap.delete(anahtar);
  }

  while (sentAtTimestamps.length > 0 && simdi - sentAtTimestamps[0] > RATE_WINDOW_MS) {
    sentAtTimestamps.shift();
  }
};

const guvenliStringify = (deger: unknown) => {
  try {
    const metin = JSON.stringify(deger);
    return metin.length > 2_000 ? `${metin.slice(0, 2_000)}...` : metin;
  } catch {
    return String(deger);
  }
};

const hataMesajiniGetir = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return guvenliStringify(error);
};

const hataDetayiniGetir = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      stack: error.stack || "",
    };
  }

  return {
    raw: guvenliStringify(error),
  };
};

const normalizeMessage = (metin: string) =>
  metin
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\d{4,}\b/g, "#");

const ignoreMessage = (metin: string, kaynak = "") => {
  const alt = `${kaynak} ${metin}`.toLowerCase();
  return (
    alt.includes("chrome-extension://") ||
    alt.includes("extensions::") ||
    alt.includes("resizeobserver loop") ||
    alt.includes("script error") ||
    alt.includes("favicon.ico")
  );
};

const pageUrl = () => {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}${window.location.search}`.slice(0, 500);
};

const userAgent = () => {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent || "").slice(0, 500);
};

const fetchRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url || "";
};

const fetchRequestMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method) return init.method;
  if (typeof Request !== "undefined" && input instanceof Request) return input.method;
  return "GET";
};

const fetchRequestBody = (init?: RequestInit) => {
  if (!init || typeof init.body === "undefined" || init.body === null) return "";
  if (typeof init.body === "string") return init.body.slice(0, 500);
  return Object.prototype.toString.call(init.body);
};

const supabaseRequestMi = (url: string) => url.includes(".supabase.co/") || url.includes("/rest/v1/") || url.includes("/functions/v1/");

const clientLogsRequestMi = (url: string) => url.includes("/rest/v1/client_logs");

const logSatiriHazirla = (girdi: TelemetryLogInput): TelemetryLogRow | null => {
  if (!telemetryContext.enabled && !girdi.allowWhenDisabled) return null;
  if (!telemetryContext.userId || !telemetryContext.userEmail) return null;

  const message = String(girdi.message || "").trim().slice(0, 1000);
  const source = String(girdi.source || "").trim().slice(0, 120);
  if (!message || !source || ignoreMessage(message, source)) return null;

  const details = {
    activeTab: telemetryContext.activeTab || "",
    aktifDonem: telemetryContext.aktifDonem || "",
    ...girdi.details,
  };

  return {
    level: girdi.level || "error",
    source,
    message,
    details,
    page_url: pageUrl(),
    user_agent: userAgent(),
    username: String(telemetryContext.username || "").slice(0, 120),
    user_email: String(telemetryContext.userEmail || "").slice(0, 200),
    user_id: String(telemetryContext.userId),
    session_id: sessionId,
    app_version: APP_VERSION,
  };
};

const parmakIziOlustur = (satir: TelemetryLogRow, ozelAnahtar?: string) =>
  [
    ozelAnahtar || "",
    satir.level,
    satir.source,
    normalizeMessage(satir.message),
    normalizeMessage(String(satir.details?.url || satir.details?.target || "")),
  ].join("|");

const logSirayaEkle = (satir: TelemetryLogRow, parmakIzi: string) => {
  const simdi = Date.now();
  temizleEskiKayitlari(simdi);

  if (sentAtTimestamps.length >= RATE_LIMIT) return;
  if (dedupeMap.has(parmakIzi)) return;

  dedupeMap.set(parmakIzi, simdi);
  queue.push(satir);
  if (queue.length > TELEMETRY_QUEUE_LIMIT) {
    queue.splice(0, queue.length - TELEMETRY_QUEUE_LIMIT);
  }
};

const flushQueue = async () => {
  if (flushPromise || queue.length === 0 || !telemetryContext.userId || !telemetryContext.userEmail) return;

  flushPromise = (async () => {
    while (queue.length > 0) {
      const simdi = Date.now();
      temizleEskiKayitlari(simdi);
      if (sentAtTimestamps.length >= RATE_LIMIT) break;

      const batch = queue.splice(0, TELEMETRY_BATCH_SIZE);
      batch.forEach(() => sentAtTimestamps.push(Date.now()));

      internalWriteDepth += 1;
      try {
        const insertPromise = supabase.from("client_logs").insert(batch);
        const timeoutPromise = new Promise<{ error: Error }>((resolve) => {
          window.setTimeout(() => resolve({ error: new Error("telemetry timeout") }), FETCH_TIMEOUT_MS);
        });
        const sonuc = await Promise.race([insertPromise, timeoutPromise]);
        if ("error" in sonuc && sonuc.error) {
          break;
        }
      } catch {
        break;
      } finally {
        internalWriteDepth = Math.max(0, internalWriteDepth - 1);
      }
    }
  })().finally(() => {
    flushPromise = null;
  });

  await flushPromise;
};

export const setClientTelemetryContext = (kontekst: TelemetryContext) => {
  Object.assign(telemetryContext, kontekst);
  void flushQueue();
};

export const logClientEvent = (girdi: TelemetryLogInput) => {
  const satir = logSatiriHazirla(girdi);
  if (!satir) return;

  const parmakIzi = parmakIziOlustur(satir, girdi.fingerprint);
  logSirayaEkle(satir, parmakIzi);
  void flushQueue();
};

export const logClientError = (
  source: string,
  error: unknown,
  details?: Record<string, unknown>,
  fingerprint?: string,
) => {
  const message = hataMesajiniGetir(error);
  logClientEvent({
    level: "error",
    source,
    message,
    details: {
      ...details,
      ...hataDetayiniGetir(error),
    },
    fingerprint,
  });
};

export const installClientTelemetry = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const kaynak = String(event.filename || "");
    const message = String(event.message || "Script error");
    if (ignoreMessage(message, kaynak)) return;

    logClientError(
      "window.error",
      event.error || new Error(message),
      {
        filename: kaynak.slice(0, 500),
        lineno: event.lineno,
        colno: event.colno,
      },
      `${kaynak}:${event.lineno}:${event.colno}:${normalizeMessage(message)}`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = hataMesajiniGetir(reason);
    if (ignoreMessage(message, "unhandledrejection")) return;

    logClientError(
      "window.unhandledrejection",
      reason,
      {},
      `promise:${normalizeMessage(message)}`,
    );
  });

  const orijinalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = fetchRequestUrl(input);
    const method = fetchRequestMethod(input, init);

    try {
      const response = await orijinalFetch(input, init);
      return response;
    } catch (error) {
      if (internalWriteDepth === 0 && supabaseRequestMi(url) && !clientLogsRequestMi(url)) {
        logClientError(
          "fetch.reject",
          error,
          {
            method,
            url: url.slice(0, 500),
            body: fetchRequestBody(init),
          },
          `fetch:${method}:${normalizeMessage(url)}`,
        );
      }
      throw error;
    }
  };
};
