import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

interface ActionPayload {
  action?: string;
  email?: string;
  password?: string;
  displayName?: string;
  userId?: string;
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalize = (value?: string | null) => String(value || "").trim().toLowerCase();

const buildUsername = (email?: string | null) => normalize(email);

const buildDisplayName = (email?: string | null, displayName?: string | null) => {
  const trimmed = String(displayName || "").trim();
  if (trimmed) return trimmed;
  const normalized = normalize(email);
  return normalized.includes("@") ? normalized.split("@")[0] : normalized;
};

const loadAllowedAdmins = () =>
  (Deno.env.get("ADMIN_USERS") || "admin@sistem.local")
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, message: "Sadece POST istekleri desteklenir." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, message: "Supabase ortam değişkenleri eksik." });
  }

  if (!authHeader) {
    return json({ ok: false, message: "Yetkilendirme başlığı eksik." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return json({ ok: false, message: "Yetkilendirme başlığı geçersiz." });
  }

  const {
    data: { user: callerUser },
    error: callerError,
  } = await adminClient.auth.getUser(accessToken);

  if (callerError || !callerUser) {
    return json({ ok: false, message: "Oturum doğrulanamadı." });
  }

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerUser.id)
    .maybeSingle();

  const isAdmin =
    callerProfile?.role === "admin" || loadAllowedAdmins().includes(normalize(callerUser.email));

  if (!isAdmin) {
    return json({ ok: false, message: "Bu işlem sadece admin kullanıcıya açıktır." });
  }

  let payload: ActionPayload;
  try {
    payload = (await req.json()) as ActionPayload;
  } catch {
    return json({ ok: false, message: "İstek gövdesi okunamadı." });
  }

  if (payload.action === "list-users") {
    const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      return json({ ok: false, message: error.message || "Kullanıcı listesi alınamadı." });
    }

    const users = data?.users || [];
    const ids = users.map((item) => item.id);
    const { data: profileRows } = ids.length
      ? await adminClient
          .from("profiles")
          .select("id,username,ad,role")
          .in("id", ids)
      : { data: [] as Array<{ id: string; username?: string; ad?: string; role?: string }> };

    const profileMap = new Map(
      (profileRows || []).map((item) => [item.id, item]),
    );

    const responseUsers = users
      .map((item) => {
        const profile = profileMap.get(item.id);
        return {
          id: item.id,
          email: item.email || "",
          username: profile?.username || buildUsername(item.email),
          displayName: profile?.ad || buildDisplayName(item.email),
          role: profile?.role || (loadAllowedAdmins().includes(normalize(item.email)) ? "admin" : "calisan"),
          createdAt: item.created_at || null,
          lastSignInAt: item.last_sign_in_at || null,
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email, "tr"));

    return json({ ok: true, users: responseUsers });
  }

  if (payload.action === "create-user") {
    const email = normalize(payload.email);
    const password = String(payload.password || "").trim();
    const displayName = String(payload.displayName || "").trim();

    if (!email || !password) {
      return json({ ok: false, message: "E-posta ve şifre zorunludur." });
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: buildDisplayName(email, displayName) },
    });

    if (error || !data.user) {
      return json({ ok: false, message: error?.message || "Kullanıcı oluşturulamadı." });
    }

    await adminClient.from("profiles").upsert(
      {
        id: data.user.id,
        username: buildUsername(email),
        ad: buildDisplayName(email, displayName),
        role: loadAllowedAdmins().includes(email) ? "admin" : "calisan",
      },
      { onConflict: "id" },
    );

    return json({ ok: true, message: `${email} kullanıcısı oluşturuldu.` });
  }

  if (payload.action === "set-password") {
    const userId = String(payload.userId || "").trim();
    const password = String(payload.password || "").trim();

    if (!userId || !password) {
      return json({ ok: false, message: "Kullanıcı ve yeni şifre zorunludur." });
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) {
      return json({ ok: false, message: error.message || "Şifre güncellenemedi." });
    }

    return json({ ok: true, message: "Kullanıcı şifresi güncellendi." });
  }

  return json({ ok: false, message: "Geçersiz işlem tipi." });
});
