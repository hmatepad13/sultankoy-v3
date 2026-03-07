import type { FormEvent } from "react";

interface LoginScreenProps {
  username: string;
  password: string;
  temaRengi: string;
  hatirlaSecili: boolean;
  hataMesaji?: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (remember: boolean) => Promise<void>;
}

export function LoginScreen({
  username,
  password,
  temaRengi,
  hatirlaSecili,
  hataMesaji,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await onSubmit(Boolean(formData.get("remember")));
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#e2e8f0",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: "30px",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "360px",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
          border: "1px solid #cbd5e1",
        }}
      >
        <h2 style={{ margin: "0 0 8px", color: "#0f172a", textAlign: "center" }}>Sultanköy V3</h2>
        <p style={{ margin: "0 0 24px", color: "#64748b", textAlign: "center", fontSize: "14px" }}>
          Yönetim Paneline Giriş Yapın
        </p>
        {hataMesaji && (
          <div
            style={{
              marginBottom: "16px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: "13px",
              lineHeight: 1.4,
            }}
          >
            {hataMesaji}
          </div>
        )}
        <input
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="Kullanıcı Adı"
          style={{
            width: "100%",
            marginBottom: "16px",
            padding: "8px",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxSizing: "border-box",
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder="Şifre"
          style={{
            width: "100%",
            marginBottom: "16px",
            padding: "8px",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            boxSizing: "border-box",
          }}
        />
        <label
          style={{
            display: "flex",
            gap: "8px",
            fontSize: "13px",
            color: "#64748b",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          <input type="checkbox" name="remember" defaultChecked={hatirlaSecili} /> Beni Hatırla
        </label>
        <button
          type="submit"
          style={{
            width: "100%",
            padding: "12px",
            background: temaRengi,
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Giriş Yap
        </button>
      </form>
    </div>
  );
}
