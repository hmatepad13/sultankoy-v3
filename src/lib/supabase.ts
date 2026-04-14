import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const INTERNET_CONNECTION_EVENT = "sultankoy:internet-connection-error";
export const INTERNET_CONNECTION_MESSAGE = "İnternet bağlantınız koptu, veriler güncellenemiyor";

export const internetBaglantisiHatasiMi = (error?: unknown) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;

  const mesaj = error instanceof Error ? error.message : String(error);
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(mesaj);
};

const internetUyarisiGonder = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(INTERNET_CONNECTION_EVENT, {
      detail: { message: INTERNET_CONNECTION_MESSAGE },
    }),
  );
};

const supabaseFetch: typeof fetch = async (input, init) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    internetUyarisiGonder();
  }

  try {
    return await fetch(input, init);
  } catch (error) {
    if (internetBaglantisiHatasiMi(error)) {
      internetUyarisiGonder();
    }
    throw error;
  }
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: supabaseFetch,
  },
});
