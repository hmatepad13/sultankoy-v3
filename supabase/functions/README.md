`user-admin` Edge Function'ı admin kullanıcı işlemlerini güvenli backend üzerinden yapar.

Deploy:

```powershell
supabase functions deploy user-admin --no-verify-jwt
```

İsteğe bağlı admin e-posta listesi:

```powershell
supabase secrets set ADMIN_USERS=admin@sistem.local
```

Notlar:
- Function içinde `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` otomatik kullanılır.
- `user-admin` fonksiyonu JWT'yi kendi içinde `Authorization` header'ından doğruladığı için `--no-verify-jwt` ile deploy edilmelidir.
- Frontend sadece `supabase.functions.invoke("user-admin")` çağırır; `service_role` tarayıcıya çıkmaz.
