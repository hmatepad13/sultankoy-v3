import { aktifDonemDisiTarihUyariMetni } from "../utils/date";

type DonemDisiTarihUyarisiProps = {
  tarih?: string | null;
  aktifDonem: string;
};

export function DonemDisiTarihUyarisi({ tarih, aktifDonem }: DonemDisiTarihUyarisiProps) {
  const mesaj = aktifDonemDisiTarihUyariMetni(tarih, aktifDonem);

  if (!mesaj) return null;

  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: "8px",
        border: "1px solid #fcd34d",
        background: "#fef3c7",
        color: "#92400e",
        fontSize: "11px",
        fontWeight: 700,
        lineHeight: 1.35,
      }}
    >
      {mesaj}
    </div>
  );
}
