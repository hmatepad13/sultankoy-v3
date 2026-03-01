import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- TİP TANIMLAMALARI (TYPESCRIPT INTERFACES) ---
interface Ciftlik { id: string; isim: string; }
interface Bayi { id: string; isim: string; }
interface Urun { id: string; isim: string; fiyat?: number | string; }
interface SutGiris { id?: string; tarih: string; ciftlik: string; kg: number | string; fiyat: number | string; toplam_tl?: number; aciklama: string; }
interface SatisGiris { id?: string; tarih: string; bayi: string; urun: string; adet: number | string; fiyat: number | string; toplam_kg?: number; bos_kova: number | string; tutar?: number; aciklama: string; birim?: number; }

// --- SUPABASE BAĞLANTISI ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
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
  const [satisList, setSatisList] = useState<SatisGiris[]>([]);

  // AYARLAR VE DÜZENLEME
  const temaRengi = "#2563eb"; 
  const [fontSize, setFontSize] = useState<number>(13); 
  const [editingId, setEditingId] = useState<any>(null);
  const [yeniTedarikci, setYeniTedarikci] = useState<string>("");
  const [yeniBayi, setYeniBayi] = useState<string>("");
  
  // Ürün ve Fiyat Ekleme State'leri
  const [yeniUrun, setYeniUrun] = useState<string>("");
  const [yeniUrunFiyat, setYeniUrunFiyat] = useState<string>("");

  const [acikTedarikci, setAcikTedarikci] = useState<boolean>(false);
  const [acikBayi, setAcikBayi] = useState<boolean>(false);
  const [acikUrun, setAcikUrun] = useState<boolean>(false);

  const [detayNot, setDetayNot] = useState<any>(null);

  // FORM, FİLTRE VE SIRALAMA STATE'LERİ
  const bugun = new Date().toISOString().split("T")[0];
  const [sutForm, setSutForm] = useState<SutGiris>({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" });
  const [sutFiltre, setSutFiltre] = useState<any>({ ciftlik: "", baslangic: "", bitis: "" });
  const [sutSort, setSutSort] = useState<any>({ key: 'tarih', direction: 'asc' });

  // SATIŞ FORMU
  const [satisForm, setSatisForm] = useState<SatisGiris>({ tarih: bugun, bayi: "", urun: "", adet: "", fiyat: "", bos_kova: "", aciklama: "" });
  const [satisFiltre, setSatisFiltre] = useState<any>({ bayi: "", urun: "", baslangic: "", bitis: "" });
  const [satisSort, setSatisSort] = useState<any>({ key: 'tarih', direction: 'asc' });

  // EKRAN YAKINLAŞTIRMA ENGELLEYİCİ VE OTURUM KONTROLÜ
  useEffect(() => {
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');

    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) verileriGetir(); }, [session]);

  async function verileriGetir() {
    const [{ data: c }, { data: b }, { data: u }, { data: s }, { data: st }] = await Promise.all([
      supabase.from("ciftlikler").select("*").order("isim"),
      supabase.from("bayiler").select("*").order("isim"),
      supabase.from("urunler").select("*").order("isim"),
      supabase.from("sut_giris").select("*").order("tarih", { ascending: false }), 
      supabase.from("satis_giris").select("*").order("tarih", { ascending: false })
    ]);
    if (c) setTedarikciler(c);
    if (b) setBayiler(b);
    if (u) setUrunler(u);
    if (s) setSutList(s);
    if (st) setSatisList(st);
  }

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR').format(num || 0);

  const renderNot = (not: any) => {
    if (!not) return "";
    return not.length <= 15 ? not : <span onClick={() => setDetayNot(not)} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8", color: "#3b82f6" }}>{not.substring(0, 15)}...</span>;
  };

  async function ayarIslem(tablo: string, isim: any, islemTip: string, id: any, resetFn?: any) {
    if (islemTip === "ekle") {
      if (!isim.trim()) return;
      
      let insertData: any = { isim };
      
      if (tablo === "urunler" && yeniUrunFiyat) {
        insertData.fiyat = Number(yeniUrunFiyat);
      }

      const { error } = await supabase.from(tablo).insert(insertData);
      if (error) return alert(`Hata: ${error.message}`);
      
      if(resetFn) resetFn("");
      if(tablo === "urunler") setYeniUrunFiyat(""); 
      
    } else if (islemTip === "sil") {
      await supabase.from(tablo).delete().eq("id", id);
    }
    verileriGetir();
  }

  const sortData = (data: any[], sortConfig: any) => {
    if (!sortConfig.key) return data;
    return [...data].sort((a, b) => {
      let valA = a[sortConfig.key], valB = b[sortConfig.key];
      if (!isNaN(valA) && !isNaN(valB)) { valA = Number(valA); valB = Number(valB); }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // --- SÜT İŞLEMLERİ ---
  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg) return alert("Eksik alan!");
    const p = { ...sutForm, kg: Number(sutForm.kg), fiyat: Number(sutForm.fiyat), toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat) };
    const { error } = editingId ? await supabase.from("sut_giris").update(p).eq("id", editingId) : await supabase.from("sut_giris").insert(p);
    if (error) return alert("Hata: " + error.message);
    setSutForm({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" }); setEditingId(null); verileriGetir();
  }

  let fSutList = sortData(sutList.filter((s: any) => 
    (!sutFiltre.ciftlik || s.ciftlik === sutFiltre.ciftlik) &&
    (!sutFiltre.baslangic || s.tarih >= sutFiltre.baslangic) &&
    (!sutFiltre.bitis || s.tarih <= sutFiltre.bitis)
  ), sutSort);
  const tSutKg = fSutList.reduce((a: number, b: any) => a + Number(b.kg), 0);
  const tSutTl = fSutList.reduce((a: number, b: any) => a + Number(b.toplam_tl), 0);

  // --- SATIŞ İŞLEMLERİ ---
  async function handleSatisKaydet() {
    if (!satisForm.bayi || !satisForm.urun || !satisForm.adet || !satisForm.fiyat) return alert("Lütfen zorunlu alanları doldurun!");
    
    const kgEslesme = satisForm.urun.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
    const otomatikBirim = kgEslesme ? Number(kgEslesme[1]) : 1;

    const adet = Number(satisForm.adet) || 0;
    const fiyat = Number(satisForm.fiyat) || 0;

    const p = { 
      ...satisForm, 
      birim: otomatikBirim,
      adet: adet, 
      fiyat: fiyat, 
      bos_kova: Number(satisForm.bos_kova) || 0, 
      toplam_kg: otomatikBirim * adet, 
      tutar: adet * fiyat 
    };

    const { error } = editingId ? await supabase.from("satis_giris").update(p).eq("id", editingId) : await supabase.from("satis_giris").insert(p);
    if (error) return alert("Hata: " + error.message);
    
    setSatisForm({ tarih: bugun, bayi: "", urun: "", adet: "", fiyat: "", bos_kova: "", aciklama: "" }); 
    setEditingId(null); 
    verileriGetir();
  }

  let fSatisList = sortData(satisList.filter((s: any) => 
    (!satisFiltre.bayi || s.bayi === satisFiltre.bayi) && (!satisFiltre.urun || s.urun === satisFiltre.urun) &&
    (!satisFiltre.baslangic || s.tarih >= satisFiltre.baslangic) && (!satisFiltre.bitis || s.tarih <= satisFiltre.bitis)
  ), satisSort);
  const tSatisKg = fSatisList.reduce((a: number, b: any) => a + Number(b.toplam_kg), 0);
  const tSatisTutar = fSatisList.reduce((a: number, b: any) => a + Number(b.tutar), 0);


  // ==========================================
  // ARAYÜZ PARÇALARI (RENDER FUNCTIONS)
  // ==========================================

  const renderOzet = () => (
    <div className="tab-fade-in">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "15px" }}>
        <div className="card" style={{ borderLeft: `5px solid ${temaRengi}` }}><small>Süt Alımı</small><h2 style={{ margin: "5px 0", color: temaRengi }}>{fSayi(sutList.reduce((a, b) => a + Number(b.kg), 0))} KG</h2></div>
        <div className="card" style={{ borderLeft: "5px solid #059669" }}><small>Satış Tutarı</small><h2 style={{ margin: "5px 0", color: "#059669" }}>{fSayi(satisList.reduce((a, b) => a + Number(b.tutar), 0))} ₺</h2></div>
      </div>
      <div className="card">
        <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Son Satış İşlemleri</h4>
        {satisList.slice(0, 5).map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span>{s.tarih.split("-").reverse().join(".")} <b>{s.bayi}</b> - {s.urun}</span><b style={{color: '#059669'}}>+{fSayi(s.tutar)} ₺</b>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSut = () => (
    <div className="tab-fade-in">
      <div className="card"><div className="responsive-form">
        <input type="date" value={sutForm.tarih} onChange={e => setSutForm({ ...sutForm, tarih: e.target.value })} className="m-inp" />
        <select value={sutForm.ciftlik} onChange={e => setSutForm({ ...sutForm, ciftlik: e.target.value })} className="m-inp"><option value="">Çiftlik Seç...</option>{tedarikciler.map(t => <option key={t.id} value={t.isim}>{t.isim}</option>)}</select>
        <input placeholder="KG" type="number" value={sutForm.kg} onChange={e => setSutForm({ ...sutForm, kg: e.target.value })} className="m-inp num-inp" />
        <input placeholder="Fiyat" type="number" step="0.01" value={sutForm.fiyat} onChange={e => setSutForm({ ...sutForm, fiyat: e.target.value })} className="m-inp num-inp" />
        <input placeholder="Not..." value={sutForm.aciklama} onChange={e => setSutForm({ ...sutForm, aciklama: e.target.value })} className="m-inp grow-inp" />
        <button onClick={handleSutKaydet} className="p-btn btn-anim" style={{ background: temaRengi }}>{editingId ? "GÜNCELLE" : "KAYDET"}</button>
      </div></div>

      <div className="table-wrapper"><table className="tbl">
        <thead><tr>
          <th onClick={() => setSutSort({ key: 'tarih', direction: sutSort.direction==='asc'?'desc':'asc' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
              <span>TARİH</span>
              <input type="date" className="date-icon-only" title="Başlangıç" onClick={e => e.stopPropagation()} value={sutFiltre.baslangic} onChange={e => setSutFiltre({ ...sutFiltre, baslangic: e.target.value })} />
              <input type="date" className="date-icon-only" title="Bitiş" onClick={e => e.stopPropagation()} value={sutFiltre.bitis} onChange={e => setSutFiltre({ ...sutFiltre, bitis: e.target.value })} />
            </div>
          </th>
          <th onClick={() => setSutSort({ key: 'ciftlik', direction: sutSort.direction==='asc'?'desc':'asc' })}>
            <select className="excel-select" onClick={e => e.stopPropagation()} value={sutFiltre.ciftlik} onChange={e => setSutFiltre({ ...sutFiltre, ciftlik: e.target.value })}><option value="">ÇİFTLİK</option>{tedarikciler.map(t => <option key={t.id}>{t.isim}</option>)}</select>
          </th>
          <th onClick={() => setSutSort({ key:'kg', direction: sutSort.direction==='asc'?'desc':'asc' })}>KG</th>
          <th onClick={() => setSutSort({ key:'fiyat', direction: sutSort.direction==='asc'?'desc':'asc' })}>FİYAT</th>
          <th onClick={() => setSutSort({ key:'toplam_tl', direction: sutSort.direction==='asc'?'desc':'asc' })}>TOPLAM</th>
          <th style={{textAlign: "right", cursor: "default"}}>
            {(sutFiltre.ciftlik || sutFiltre.baslangic || sutFiltre.bitis) ? <button onClick={() => setSutFiltre({ciftlik:"", baslangic:"", bitis:""})} title="Filtreyi Temizle" style={{background:"none",border:"none",cursor:"pointer"}}>❌</button> : "NOT"}
          </th>
        </tr></thead>
        <tbody>{fSutList.map(s => (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td><td style={{ fontWeight: "bold" }}>{s.ciftlik}</td><td>{fSayi(s.kg)}</td><td>{s.fiyat}</td><td style={{ color: temaRengi, fontWeight: "bold" }}>{fSayi(s.toplam_tl)}</td>
            <td style={{ textAlign: "right" }}>
              {renderNot(s.aciklama)}
              <button onClick={() => { setEditingId(s.id); setSutForm(s as any); window.scrollTo({top: 0}); }} className="ed-btn btn-anim">✏️</button>
              <button onClick={async () => { if(confirm("Sil?")){ await supabase.from("sut_giris").delete().eq("id", s.id); verileriGetir(); } }} className="dl-btn btn-anim">✕</button>
            </td>
          </tr>))}
        </tbody>
      </table></div>
      <div className="fixed-totals">
        <div className="b-kutu" style={{ borderLeft: `4px solid ${temaRengi}` }}><span>TOPLAM KG</span><b>{fSayi(tSutKg)}</b></div>
        <div className="b-kutu" style={{ borderLeft: `4px solid ${temaRengi}` }}><span>TOPLAM TL</span><b style={{ color: temaRengi }}>{fSayi(tSutTl)} ₺</b></div>
      </div>
    </div>
  );

  const renderSatis = () => (
    <div className="tab-fade-in">
      <div className="card">
        <div className="responsive-form" style={{marginBottom: "8px"}}>
          <input type="date" value={satisForm.tarih} onChange={e => setSatisForm({ ...satisForm, tarih: e.target.value })} className="m-inp" />
          
          <select 
            value={satisForm.bayi} 
            onChange={e => {
              const secilenBayi = e.target.value;
              let yeniFiyat = satisForm.fiyat;
              if (secilenBayi && satisForm.urun) {
                const sonSatis = satisList.find(s => s.bayi === secilenBayi && s.urun === satisForm.urun);
                if (sonSatis) {
                  yeniFiyat = sonSatis.fiyat;
                } else {
                  const urunDetay = urunler.find(u => u.isim === satisForm.urun);
                  yeniFiyat = (urunDetay && urunDetay.fiyat) ? urunDetay.fiyat : ""; 
                }
              }
              setSatisForm({ ...satisForm, bayi: secilenBayi, fiyat: yeniFiyat });
            }} 
            className="m-inp"
          >
            <option value="">Bayi Seç...</option>
            {bayiler.map(b => <option key={b.id}>{b.isim}</option>)}
          </select>
          
          <select 
            value={satisForm.urun} 
            onChange={e => {
              const secilenUrun = e.target.value;
              let yeniFiyat: any = "";
              if (satisForm.bayi && secilenUrun) {
                const sonSatis = satisList.find(s => s.bayi === satisForm.bayi && s.urun === secilenUrun);
                if (sonSatis) {
                  yeniFiyat = sonSatis.fiyat;
                } else {
                  const urunDetay = urunler.find(u => u.isim === secilenUrun);
                  yeniFiyat = (urunDetay && urunDetay.fiyat) ? urunDetay.fiyat : ""; 
                }
              } else if (!satisForm.bayi && secilenUrun) {
                const urunDetay = urunler.find(u => u.isim === secilenUrun);
                yeniFiyat = (urunDetay && urunDetay.fiyat) ? urunDetay.fiyat : "";
              }
              setSatisForm({ ...satisForm, urun: secilenUrun, fiyat: yeniFiyat });
            }} 
            className="m-inp"
          >
            <option value="">Ürün Seç...</option>
            {urunler.map(u => <option key={u.id}>{u.isim}</option>)}
          </select>
        </div>

        <div className="responsive-form">
          <input placeholder="Adet/Kg" type="number" value={satisForm.adet} onChange={e => setSatisForm({ ...satisForm, adet: e.target.value })} className="m-inp num-inp" />
          <input placeholder="Fiyat" type="number" step="0.01" value={satisForm.fiyat} onChange={e => setSatisForm({ ...satisForm, fiyat: e.target.value })} className="m-inp num-inp" />
          <input placeholder="Kova" type="number" value={satisForm.bos_kova} onChange={e => setSatisForm({ ...satisForm, bos_kova: e.target.value })} className="m-inp num-inp" />
          <input placeholder="Açıklama / Not..." value={satisForm.aciklama} onChange={e => setSatisForm({ ...satisForm, aciklama: e.target.value })} className="m-inp grow-inp" />
          <button onClick={handleSatisKaydet} className="p-btn btn-anim" style={{ background: "#059669" }}>{editingId ? "GÜNCELLE" : "SATIŞI KAYDET"}</button>
        </div>
      </div>

      <div className="table-wrapper"><table className="tbl tbl-satis">
        <thead><tr>
          <th onClick={() => setSatisSort({ key: 'tarih', direction: satisSort.direction==='asc'?'desc':'asc' })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
              <span>TARİH</span>
              <input type="date" className="date-icon-only" title="Başlangıç" onClick={e => e.stopPropagation()} value={satisFiltre.baslangic} onChange={e => setSatisFiltre({ ...satisFiltre, baslangic: e.target.value })} />
              <input type="date" className="date-icon-only" title="Bitiş" onClick={e => e.stopPropagation()} value={satisFiltre.bitis} onChange={e => setSatisFiltre({ ...satisFiltre, bitis: e.target.value })} />
            </div>
          </th>
          <th onClick={() => setSatisSort({ key: 'bayi', direction: satisSort.direction==='asc'?'desc':'asc' })}>
            <select className="excel-select" style={{color:"white"}} onClick={e => e.stopPropagation()} value={satisFiltre.bayi} onChange={e => setSatisFiltre({ ...satisFiltre, bayi: e.target.value })}><option value="">BAYİ</option>{bayiler.map(b => <option style={{color:"black"}} key={b.id}>{b.isim}</option>)}</select>
          </th>
          <th onClick={() => setSatisSort({ key: 'urun', direction: satisSort.direction==='asc'?'desc':'asc' })}>
            <select className="excel-select" style={{color:"white"}} onClick={e => e.stopPropagation()} value={satisFiltre.urun} onChange={e => setSatisFiltre({ ...satisFiltre, urun: e.target.value })}><option value="">ÜRÜN</option>{urunler.map(u => <option style={{color:"black"}} key={u.id}>{u.isim}</option>)}</select>
          </th>
          <th onClick={() => setSatisSort({ key:'adet', direction: satisSort.direction==='asc'?'desc':'asc' })}>ADET</th>
          <th onClick={() => setSatisSort({ key:'fiyat', direction: satisSort.direction==='asc'?'desc':'asc' })}>FİYAT</th>
          <th onClick={() => setSatisSort({ key:'toplam_kg', direction: satisSort.direction==='asc'?'desc':'asc' })}>T. KG</th>
          <th onClick={() => setSatisSort({ key:'bos_kova', direction: satisSort.direction==='asc'?'desc':'asc' })}>BOŞ KOVA</th>
          <th onClick={() => setSatisSort({ key:'tutar', direction: satisSort.direction==='asc'?'desc':'asc' })}>TUTAR</th>
          <th style={{textAlign: "right", cursor: "default"}}>
            {(satisFiltre.bayi || satisFiltre.urun || satisFiltre.baslangic || satisFiltre.bitis) ? <button onClick={() => setSatisFiltre({bayi:"", urun:"", baslangic:"", bitis:""})} title="Filtreyi Temizle" style={{background:"none",border:"none",cursor:"pointer",color:"white"}}>❌</button> : "NOT"}
          </th>
        </tr></thead>
        <tbody>{fSatisList.map(s => (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td><td style={{ fontWeight: "bold" }}>{s.bayi}</td>
            <td>{s.urun}</td><td>{s.adet}</td><td>{s.fiyat}</td><td style={{ fontWeight: "bold" }}>{fSayi(s.toplam_kg)}</td>
            <td>{s.bos_kova || ""}</td><td style={{ color: "#059669", fontWeight: "bold" }}>{fSayi(s.tutar)}</td>
            <td style={{ textAlign: "right" }}>
              {renderNot(s.aciklama)}
              <button onClick={() => { setEditingId(s.id); setSatisForm(s as any); window.scrollTo({top: 0}); }} className="ed-btn btn-anim">✏️</button>
              <button onClick={async () => { if(confirm("Sil?")){ await supabase.from("satis_giris").delete().eq("id", s.id); verileriGetir(); } }} className="dl-btn btn-anim">✕</button>
            </td>
          </tr>))}
        </tbody>
      </table></div>
      <div className="fixed-totals">
        <div className="b-kutu" style={{ borderLeft: "4px solid #059669" }}><span>TOPLAM KG</span><b>{fSayi(tSatisKg)}</b></div>
        <div className="b-kutu" style={{ borderLeft: "4px solid #059669" }}><span>TOPLAM TUTAR</span><b style={{ color: "#059669" }}>{fSayi(tSatisTutar)} ₺</b></div>
      </div>
    </div>
  );

  const renderAyarlar = () => (
    <div className="tab-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {[
        { t: "ciftlikler", title: "🥛 Süt Tedarikçileri", open: acikTedarikci, setOpen: setAcikTedarikci, val: yeniTedarikci, setVal: setYeniTedarikci, data: tedarikciler, btnColor: temaRengi, isUrun: false },
        { t: "bayiler", title: "🏢 Satış Bayileri / Müşteriler", open: acikBayi, setOpen: setAcikBayi, val: yeniBayi, setVal: setYeniBayi, data: bayiler, btnColor: "#059669", isUrun: false },
        { t: "urunler", title: "📦 Ürün Listesi (Fiyat eklenebilir)", open: acikUrun, setOpen: setAcikUrun, val: yeniUrun, setVal: setYeniUrun, data: urunler, btnColor: "#f59e0b", isUrun: true }
      ].map(sec => (
        <div key={sec.t} className="card">
          <div onClick={() => sec.setOpen(!sec.open)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
            <h4 style={{ margin: 0 }}>{sec.title}</h4><span style={{ fontSize: "11px", color: "#64748b" }}>{sec.open ? "▲ GİZLE" : "▼ AÇ"}</span>
          </div>
          {sec.open && (
            <div style={{ marginTop: "15px", borderTop: "1px solid #e2e8f0", paddingTop: "15px" }}>
              <div className="responsive-form" style={{marginBottom: "10px"}}>
                <input placeholder="Yeni ekle..." value={sec.val} onChange={e => sec.setVal(e.target.value)} className="m-inp grow-inp" />
                {sec.isUrun && (
                  <input placeholder="Fiyat (₺)" type="number" value={yeniUrunFiyat} onChange={e => setYeniUrunFiyat(e.target.value)} className="m-inp num-inp" />
                )}
                <button onClick={() => ayarIslem(sec.t, sec.val, "ekle", null, sec.setVal)} className="p-btn btn-anim" style={{ background: sec.btnColor, flex: "0 0 100px" }}>EKLE</button>
              </div>
              <div className="responsive-form" style={{marginTop: "5px"}}>
                <select 
                  className="m-inp" 
                  value="" 
                  onChange={(e) => {
                    const sId = e.target.value;
                    if(!sId) return;
                    const targetItem = sec.data.find(d => String(d.id) === String(sId));
                    if(confirm(`"${targetItem?.isim}" kaydını tamamen silmek istediğinize emin misiniz?`)) {
                      ayarIslem(sec.t, null, "sil", sId);
                    }
                  }}
                  style={{ width: "100%", cursor: "pointer", backgroundColor: "#f8fafc", color: "#64748b" }}
                >
                  <option value="">Kayıtlı Listeyi Gör / Silmek İçin Seçin...</option>
                  {sec.data.map(d => <option key={d.id} value={d.id} style={{color: "#1e293b"}}>{d.isim} {sec.isUrun && (d as Urun).fiyat ? `(${(d as Urun).fiyat} ₺)` : ""}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="card">
        <h4 style={{ margin: "0 0 10px" }}>Yazı Boyutu ({fontSize}px)</h4>
        <input type="range" min="10" max="18" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
      </div>
    </div>
  );

  // ==========================================
  // GİRİŞ EKRANI (AUTH)
  // ==========================================

  if (!session) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "20px", boxSizing: "border-box" }}>
        <form onSubmit={async (e) => { 
          e.preventDefault(); 
          const target = e.currentTarget as any;
          if (target.elements.remember.checked) localStorage.setItem('user', username); else localStorage.removeItem('user');
          await supabase.auth.signInWithPassword({ email: username.includes("@") ? username : `${username}@sistem.local`, password }); 
        }} style={{ background: "#fff", padding: "30px", borderRadius: "12px", width: "100%", maxWidth: "360px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a", textAlign: "center" }}>Sultanköy v2</h2>
          <p style={{ margin: "0 0 24px", color: "#64748b", textAlign: "center", fontSize:"14px" }}>Yönetim Paneline Giriş Yapın</p>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Kullanıcı Adı" style={{ width: "100%", marginBottom: "16px", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifre" style={{ width: "100%", marginBottom: "16px", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <label style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b", cursor: "pointer", marginBottom: "20px" }}><input type="checkbox" id="remember" defaultChecked={!!localStorage.getItem('user')} /> Beni Hatırla</label>
          <button type="submit" style={{ width: "100%", padding: "12px", background: temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>Giriş Yap</button>
        </form>
        <style>{`#root { display: block !important; padding: 0 !important; }`}</style>
      </div>
    );
  }
  
  // ==========================================
  // ANA UYGULAMA (MAIN RENDER)
  // ==========================================

  return (
    <div className="app-container" style={{ fontSize: `${fontSize}px` }}>
      <header className="header-style">
        <b style={{ color: temaRengi, fontSize: "16px" }}>SULTANKÖY v2</b>
        <button onClick={() => supabase.auth.signOut()} className="out-btn btn-anim">ÇIKIŞ YAP</button>
      </header>

      <main className="main-content">
        {activeTab === "ozet" && renderOzet()}
        {activeTab === "sut" && renderSut()}
        {activeTab === "satis" && renderSatis()}
        {activeTab === "ayarlar" && renderAyarlar()}

        {/* NOT MODAL */}
        {detayNot && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }} onClick={() => setDetayNot(null)}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "16px", width: "100%", maxWidth: "350px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 15px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>Açıklama / Not</h3>
              <p style={{ margin: "0 0 25px", color: "#475569", lineHeight: "1.6", wordWrap: "break-word" }}>{detayNot}</p>
              <button onClick={() => setDetayNot(null)} style={{ width: "100%", padding: "12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>KAPAT</button>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed-nav">
        {[{ id: "ozet", i: "📊" }, { id: "sut", i: "🥛" }, { id: "satis", i: "💰" }, { id: "ayarlar", i: "⚙️" }].map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); setEditingId(null); }} className={`n-item btn-anim ${activeTab === item.id ? 'active' : ''}`} style={activeTab === item.id ? { color: temaRengi, borderTopColor: temaRengi } : {}}>
            <span style={{ fontSize: "20px" }}>{item.i}</span><span style={{ fontSize: "10px", fontWeight: "bold" }}>{item.id.toUpperCase()}</span>
          </button>
        ))}
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        :root { color-scheme: light !important; }
        html, body { max-width: 100vw; overflow-x: hidden; margin: 0 !important; padding: 0 !important; background: #f8fafc !important; font-family: -apple-system, system-ui, sans-serif; color: #1e293b !important; }
        #root { display: block !important; padding: 0 !important; margin: 0 auto !important; max-width: none !important; text-align: left !important; }
        input::placeholder { color: #94a3b8 !important; opacity: 1; }
        .app-container { max-width: 1000px; margin: 0 auto; width: 100%; min-height: 100vh; background: #f8fafc; box-shadow: 0 0 20px rgba(0,0,0,0.02); position: relative; overflow-x: hidden; }
        .header-style { display: flex; justify-content: space-between; padding: 12px; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 50; }
        .main-content { padding: 10px; padding-bottom: 220px; }
        .tab-fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        .responsive-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
        .m-inp { flex: 1 1 120px; padding: 10px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #fff; color: #1e293b !important; transition: border-color 0.2s; }
        .m-inp:focus { border-color: #2563eb; }
        .num-inp { flex: 0 0 65px !important; min-width: 65px; padding: 8px 4px !important; text-align: center; }
        .grow-inp { flex: 1 1 120px !important; }
        .p-btn { flex: 0 0 auto !important; padding: 0 20px; height: 40px; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; white-space: nowrap; }
        
        .card { background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 15px; transition: box-shadow 0.2s, transform 0.2s; }
        
        .table-wrapper { width: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; }
        .tbl { width: 100%; border-collapse: collapse; }
        
        .tbl th { 
          text-align: left; 
          color: #475569; 
          background: #f1f5f9; 
          border-bottom: 1px solid #e2e8f0; 
          cursor: pointer; 
          user-select: none;
          transition: background 0.2s;
        }
        .tbl th:hover { background: #e2e8f0; }
        .tbl-satis th { background: #5b9bd5 !important; color: white !important; }
        .tbl-satis th:hover { background: #4a8ac4 !important; }
        
        .tbl th, .tbl td { 
          padding: 4px 6px !important; 
          white-space: nowrap !important; 
          width: 1% !important; 
          font-size: 11.5px;
          border-bottom: 1px solid #f1f5f9;
        }
        
        .tbl th:nth-last-child(2), .tbl td:nth-last-child(2) { 
          width: 100% !important; 
          white-space: normal !important; 
        }

        .fixed-totals { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); width: calc(100% - 20px); max-width: 980px; display: flex; gap: 10px; z-index: 90; }
        .b-kutu { flex: 1; background: #fff; padding: 12px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); display: flex; flex-direction: column; border: 1px solid #e2e8f0; }
        .fixed-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 1000px; height: 70px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; z-index: 100; }
        .n-item { flex: 1; border: none; background: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-top: 3px solid transparent; transition: color 0.2s, border-color 0.2s; }
        .n-item.active { background: #f8fafc; }
        .btn-anim { transition: transform 0.1s; } .btn-anim:active { transform: scale(0.95); }
        .out-btn { background: #fff; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .ed-btn { background: none; border: none; color: #2563eb; font-size: 14px; cursor: pointer; padding: 2px; }
        .dl-btn { background: none; border: none; color: #dc2626; font-size: 14px; font-weight: bold; cursor: pointer; padding: 2px; }
        
        .excel-select { background: transparent; border: none; color: inherit; font-weight: bold; font-size: 11.5px; outline: none; padding: 0; margin: 0; font-family: inherit; }
        .excel-select option { color: #1e293b; background: #fff; font-weight: normal; }
        
        .date-icon-only { width: 14px !important; height: 14px !important; padding: 0; border: none; background: transparent; cursor: pointer; color: transparent; position: relative; outline: none; }
        .date-icon-only::-webkit-datetime-edit { display: none; }
        .date-icon-only::-webkit-calendar-picker-indicator { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: pointer; opacity: 0.5; padding: 0; margin: 0; transition: opacity 0.2s; }
        .date-icon-only:hover::-webkit-calendar-picker-indicator { opacity: 1; }
      `}</style>
    </div>
  );
}
