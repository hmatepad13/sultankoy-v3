`user-admin` Edge Function'ı admin kullanıcı işlemlerini güvenli backend üzerinden yapar.

Deploy:

```powershell
supabase functions deploy user-admin
```

İsteğe bağlı admin e-posta listesi:

```powershell
supabase secrets set ADMIN_USERS=admin@sistem.local
```

Notlar:
- Function içinde `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` otomatik kullanılır.
- Frontend sadece `supabase.functions.invoke("user-admin")` çağırır; `service_role` tarayıcıya çıkmaz.
