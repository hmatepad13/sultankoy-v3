import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// --- TİP TANIMLAMALARI ---
interface Ciftlik { id: string; isim: string; }
interface Bayi { id: string; isim: string; }
interface Urun { id: string; isim: string; fiyat?: number | string; }
interface SutGiris { id?: string; tarih: string; ciftlik: string; kg: number | string; fiyat: number | string; toplam_tl?: number; aciklama: string; }
interface SatisGiris { id?: string; fis_no?: string; tarih: string; bayi: string; urun: string; adet: number | string; fiyat: number | string; toplam_kg?: number; bos_kova?: number | string; tutar?: number; aciklama: string; birim?: number; }
interface SatisFis { id?: string; fis_no: string; tarih: string; bayi: string; toplam_tutar: number; tahsilat: number; kalan_bakiye: number; odeme_turu: string; aciklama: string; }

// --- SUPABASE BAĞLANTISI ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON_KEY || ""
);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("satis");

  // VERİ LİSTELERİ
  const [tedarikciler, setTedarikciler] = useState<Ciftlik[]>([]);
  const [bayiler, setBayiler] = useState<Bayi[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [sutList, setSutList] = useState<SutGiris[]>([]);
  const [satisFisList, setSatisFisList] = useState<SatisFis[]>([]); 
  const [satisList, setSatisList] = useState<SatisGiris[]>([]); 

  // AYARLAR
  const temaRengi = "#2563eb"; 
  const [fontSize, setFontSize] = useState<number>(13); 
  const [detayNot, setDetayNot] = useState<any>(null);

  const [yeniTedarikci, setYeniTedarikci] = useState<string>("");
  const [yeniBayi, setYeniBayi] = useState<string>("");
  const [yeniUrun, setYeniUrun] = useState<string>("");
  const [yeniUrunFiyat, setYeniUrunFiyat] = useState<string>("");

  const [acikTedarikci, setAcikTedarikci] = useState<boolean>(false);
  const [acikBayi, setAcikBayi] = useState<boolean>(false);
  const [acikUrun, setAcikUrun] = useState<boolean>(false);

  const bugun = new Date().toISOString().split("T")[0];

  // --- SÜT STATE'LERİ ---
  const [isSutModalOpen, setIsSutModalOpen] = useState<boolean>(false);
  const [editingSutId, setEditingSutId] = useState<any>(null);
  const [sutForm, setSutForm] = useState<SutGiris>({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" });
  const [sutFiltre, setSutFiltre] = useState<{ ciftlikler: string[], baslangic: string, bitis: string }>({ ciftlikler: [], baslangic: "", bitis: "" });
  const [sutSort, setSutSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- SATIŞ STATE'LERİ ---
  const [isFisModalOpen, setIsFisModalOpen] = useState<boolean>(false);
  const [editingFisId, setEditingFisId] = useState<string | null>(null);
  const [editingFisNo, setEditingFisNo] = useState<string | null>(null);
  const [fisUst, setFisUst] = useState({ tarih: bugun, bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "" });
  const [fisDetay, setFisDetay] = useState<Record<string, { adet: string, fiyat: string }>>({});
  const [sonFisData, setSonFisData] = useState<any>(null);

  const [fisFiltre, setFisFiltre] = useState<{ bayiler: string[], baslangic: string, bitis: string }>({ bayiler: [], baslangic: "", bitis: "" });
  const [fisSort, setFisSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- ANALİZ STATE'LERİ ---
  const [analizFiltre, setAnalizFiltre] = useState<{bayiler: string[], urunler: string[], baslangic: string, bitis: string}>({ bayiler: [], urunler: [], baslangic: "", bitis: "" });
  const [analizSort, setAnalizSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- EXCEL TİPİ FİLTRE MODALI ---
  const [activeFilterModal, setActiveFilterModal] = useState<'sut_ciftlik' | 'fis_bayi' | 'analiz_bayi' | 'analiz_urun' | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUsername(savedUser);

    supabase.auth.getSession().then(({ data: { session: s } }: any) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, s: any) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) verileriGetir("hepsi"); }, [session]);

  async function verileriGetir(hedef: "hepsi" | "satis" | "sut" | "ayar" = "hepsi") {
    try {
      if (hedef === "hepsi" || hedef === "ayar") {
        const [{ data: c }, { data: b }, { data: u }] = await Promise.all([
          supabase.from("ciftlikler").select("*").order("isim"),
          supabase.from("bayiler").select("*").order("isim"),
          supabase.from("urunler").select("*").order("isim")
        ]);
        if (c) setTedarikciler(c);
        if (b) setBayiler(b);
        if (u) {
          setUrunler(u);
          setFisDetay(prev => {
            const yeniDetay: any = { ...prev };
            u.forEach(urun => { if (!yeniDetay[urun.id]) yeniDetay[urun.id] = { adet: "", fiyat: urun.fiyat || "" }; });
            return yeniDetay;
          });
        }
      }
      if (hedef === "hepsi" || hedef === "satis") {
        const [{ data: f }, { data: st }] = await Promise.all([
          supabase.from("satis_fisleri").select("*").order("tarih", { ascending: false }),
          supabase.from("satis_giris").select("*").order("tarih", { ascending: false })
        ]);
        if (f) setSatisFisList(f);
        if (st) setSatisList(st);
      }
      if (hedef === "hepsi" || hedef === "sut") {
        const { data: s } = await supabase.from("sut_giris").select("*").order("tarih", { ascending: false });
        if (s) setSutList(s);
      }
    } catch (error) { console.error(error); }
  }

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(Number(num) || 0));

  const renderNot = (not: any) => {
    if (!not) return "";
    return not.length <= 15 ? not : <span onClick={() => setDetayNot(not)} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8", color: "#3b82f6" }}>{not.substring(0, 15)}...</span>;
  };

  async function ayarIslem(tablo: string, isim: any, islemTip: string, id: any, resetFn?: any) {
    if (islemTip === "ekle") {
      if (!isim.trim()) return;
      let insertData: any = { isim };
      if (tablo === "urunler" && yeniUrunFiyat) insertData.fiyat = Number(yeniUrunFiyat);
      const { error } = await supabase.from(tablo).insert(insertData);
      if (error) return alert(`Hata: ${error.message}`);
      if(resetFn) resetFn("");
      if(tablo === "urunler") setYeniUrunFiyat(""); 
    } else if (islemTip === "sil") {
      await supabase.from(tablo).delete().eq("id", id);
    }
    verileriGetir("ayar"); 
  }

  const sortData = (data: any[], sortConfig: any) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      let valA = a[sortConfig.key], valB = b[sortConfig.key];
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const handleCheckboxToggle = (listName: 'ciftlikler' | 'bayiler' | 'urunler', setStateFn: any, val: string) => {
    setStateFn((prev: any) => {
      const arr = prev[listName];
      if (arr.includes(val)) return { ...prev, [listName]: arr.filter((x: string) => x !== val) };
      return { ...prev, [listName]: [...arr, val] };
    });
  };

  const Th = ({ label, sortKey, currentSort, setSort, align="left", filterType = null, children = null, isAnaliz = false }: any) => (
    <th style={{ textAlign: align }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSort({ key: sortKey, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{label}</span>
            {filterType && (
              <span onClick={(e) => { e.stopPropagation(); setActiveFilterModal(filterType); }} style={{ fontSize: '10px', padding: '2px', background: isAnaliz ? '#7c3aed' : '#e2e8f0', borderRadius: '4px' }}>
                🔽
              </span>
            )}
          </div>
          <span style={{fontSize:'9px'}}>{currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : ''}</span>
        </div>
        {children}
      </div>
    </th>
  );

  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg || !sutForm.fiyat) return alert("Eksik bilgi!");
    const p = { ...sutForm, kg: Number(sutForm.kg), fiyat: Number(sutForm.fiyat), toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat) };
    const { error } = editingSutId ? await supabase.from("sut_giris").update(p).eq("id", editingSutId) : await supabase.from("sut_giris").insert(p);
    if (error) return alert("Hata!");
    setIsSutModalOpen(false); verileriGetir("sut"); 
  }

  const handleBayiSecimi = (secilenBayi: string) => {
    setFisUst({ ...fisUst, bayi: secilenBayi });
    if (!secilenBayi) return;
    const yeniDetay = { ...fisDetay };
    urunler.forEach(u => {
      const bayiSatislari = satisList.filter(s => s.bayi === secilenBayi && s.urun === u.isim);
      if (bayiSatislari.length > 0) {
        const sonSatis = bayiSatislari.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        yeniDetay[u.id] = { adet: fisDetay[u.id]?.adet || "", fiyat: String(sonSatis.fiyat) };
      }
    });
    setFisDetay(yeniDetay);
  };

  const aktifBayi = fisUst.bayi;
  const eskiBorc = useMemo(() => {
      if (!aktifBayi) return 0;
      return satisFisList.filter(f => f.bayi === aktifBayi && f.id !== editingFisId).reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
  }, [aktifBayi, satisFisList, editingFisId]);

  const fisCanliToplam = useMemo(() => urunler.reduce((toplam, u) => toplam + (Number(fisDetay[u.id]?.adet) || 0) * (Number(fisDetay[u.id]?.fiyat) || 0), 0), [urunler, fisDetay]);
  const toplamGenelBorc = eskiBorc + (fisCanliToplam - Number(fisUst.tahsilat || 0));

  async function handleTopluFisKaydet() {
    if (!fisUst.bayi) return alert("Bayi seçin!");
    const eklenecekUrunler = urunler.filter(u => Number(fisDetay[u.id]?.adet) > 0);
    const ortakFisNo = editingFisNo || `F-${Date.now().toString().slice(-6)}`;
    const tahsilat = Number(fisUst.tahsilat) || 0;
    const kalanBakiye = fisCanliToplam - tahsilat;
    const fisMaster = { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, toplam_tutar: fisCanliToplam, tahsilat: tahsilat, kalan_bakiye: kalanBakiye, odeme_turu: fisUst.odeme_turu, aciklama: fisUst.aciklama };

    if (editingFisId) {
      await supabase.from("satis_fisleri").update(fisMaster).eq("id", editingFisId);
      await supabase.from("satis_giris").delete().eq("fis_no", ortakFisNo);
    } else {
      await supabase.from("satis_fisleri").insert(fisMaster);
    }

    const insertArray = eklenecekUrunler.map((u) => ({
      fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: Number(fisDetay[u.id].adet), fiyat: Number(fisDetay[u.id].fiyat), tutar: Number(fisDetay[u.id].adet) * Number(fisDetay[u.id].fiyat)
    }));
    await supabase.from("satis_giris").insert(insertArray);
    setIsFisModalOpen(false); verileriGetir("satis");
  }

  const handleFisDuzenle = (fis: SatisFis) => {
    setEditingFisId(fis.id!); setEditingFisNo(fis.fis_no);
    setFisUst({ tarih: fis.tarih, bayi: fis.bayi, aciklama: fis.aciklama, odeme_turu: fis.odeme_turu, tahsilat: String(fis.tahsilat) });
    const ilgiliUrunler = satisList.filter(s => s.fis_no === fis.fis_no);
    const dolanDetay: any = {};
    urunler.forEach(u => {
      const buUrun = ilgiliUrunler.find(s => s.urun === u.isim);
      dolanDetay[u.id] = { adet: buUrun ? String(buUrun.adet) : "", fiyat: buUrun ? String(buUrun.fiyat) : String(u.fiyat || "") };
    });
    setFisDetay(dolanDetay); setIsFisModalOpen(true);
  };

  const fFisList = sortData(satisFisList.filter(f => (fisFiltre.bayiler.length === 0 || fisFiltre.bayiler.includes(f.bayi))), fisSort);
  const fSutList = sortData(sutList.filter(s => (sutFiltre.ciftlikler.length === 0 || sutFiltre.ciftlikler.includes(s.ciftlik))), sutSort);
  const fAnalizList = sortData(satisList.filter(s => (analizFiltre.bayiler.length === 0 || analizFiltre.bayiler.includes(s.bayi))), analizSort);

  return (
    <div className="app-container" style={{ fontSize: `${fontSize}px` }}>
      <header className="header-style">
        <b style={{ color: temaRengi }}>SULTANKÖY v2</b>
        <button onClick={() => supabase.auth.signOut()} className="out-btn">ÇIKIŞ YAP</button>
      </header>

      <main className="main-content">
        {activeTab === "satis" && (
           <div className="tab-fade-in">
             <button onClick={() => setIsFisModalOpen(true)} className="p-btn blue-btn" style={{width:'100%', marginBottom:'10px'}}>➕ YENİ SATIŞ FİŞİ</button>
             <div className="table-wrapper">
               <table className="tbl">
                 <thead><tr><Th label="TARİH" sortKey="tarih" currentSort={fisSort} setSort={setFisSort} /><Th label="BAYİ" sortKey="bayi" currentSort={fisSort} setSort={setFisSort} filterType="fis_bayi" /><Th label="TUTAR" sortKey="toplam_tutar" currentSort={fisSort} setSort={setFisSort} align="right" /><th>İŞL</th></tr></thead>
                 <tbody>{fFisList.map(f => <tr key={f.id}><td>{f.tarih.split("-").reverse().join(".")}</td><td><b>{f.bayi}</b></td><td style={{textAlign:'right'}}>{fSayi(f.toplam_tutar)}</td><td><button onClick={() => handleFisDuzenle(f)}>✏️</button></td></tr>)}</tbody>
               </table>
             </div>
           </div>
        )}
        {/* Diğer sekmeler buraya eklenebilir... */}
      </main>

      <footer className="fixed-nav">
        {[{ id: "ozet", i: "📊" }, { id: "sut", i: "🥛" }, { id: "satis", i: "💰" }, { id: "analiz", i: "📈" }, { id: "ayarlar", i: "⚙️" }].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`n-item ${activeTab === item.id ? 'active' : ''}`}>
            <span>{item.i}</span><span style={{fontSize:'10px'}}>{item.id.toUpperCase()}</span>
          </button>
        ))}
      </footer>

      <style>{`
        body { margin: 0; background: #f8fafc; font-family: sans-serif; }
        .app-container { max-width: 600px; margin: 0 auto; min-height: 100vh; position: relative; }
        .header-style { display: flex; justify-content: space-between; padding: 12px; background: #fff; border-bottom: 1px solid #e2e8f0; }
        .table-wrapper { width: 100%; overflow-x: auto; background: #fff; border-radius: 8px; }
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { background: #f1f5f9; padding: 8px; font-size: 11px; text-align: left; }
        .tbl td { padding: 8px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
        .fixed-nav { position: fixed; bottom: 0; width: 100%; max-width: 600px; height: 65px; background: #fff; display: flex; border-top: 1px solid #e2e8f0; }
        .n-item { flex: 1; border: none; background: none; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
        .n-item.active { color: #2563eb; border-top: 2px solid #2563eb; }
        .blue-btn { background: #2563eb; color: #fff; padding: 10px; border: none; border-radius: 6px; font-weight: bold; }
      `}</style>
    </div>
  );
}
