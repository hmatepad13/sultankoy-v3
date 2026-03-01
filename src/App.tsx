import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// SUPABASE BAĞLANTISI
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("satis");

  // VERİ LİSTELERİ
  const [tedarikciler, setTedarikciler] = useState<any[]>([]);
  const [bayiler, setBayiler] = useState<any[]>([]);
  const [urunler, setUrunler] = useState<any[]>([]);
  const [sutList, setSutList] = useState<any[]>([]);
  const [satisList, setSatisList] = useState<any[]>([]);

  // AYARLAR VE DÜZENLEME
  const temaRengi = "#2563eb"; 
  const [fontSize, setFontSize] = useState(13); 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [yeniTedarikci, setYeniTedarikci] = useState("");
  const [yeniBayi, setYeniBayi] = useState("");
  const [yeniUrun, setYeniUrun] = useState("");

  const [acikTedarikci, setAcikTedarikci] = useState(false);
  const [acikBayi, setAcikBayi] = useState(false);
  const [acikUrun, setAcikUrun] = useState(false);

  // NOT AÇILIR PENCERESİ (POPUP) STATE'İ
  const [detayNot, setDetayNot] = useState<string | null>(null);

  // SÜT FORM VE FİLTRE
  const [sutForm, setSutForm] = useState({ tarih: new Date().toISOString().split("T")[0], ciftlik: "", kg: "", fiyat: "", aciklama: "" });
  const [sutFiltre, setSutFiltre] = useState({ ciftlik: "", baslangic: "", bitis: "" });

  // SATIŞ FORM VE FİLTRE
  const [satisForm, setSatisForm] = useState({ 
    tarih: new Date().toISOString().split("T")[0], 
    bayi: "", urun: "", birim: "", adet: "", fiyat: "", bos_kova: "", aciklama: "" 
  });
  const [satisFiltre, setSatisFiltre] = useState({ bayi: "", baslangic: "", bitis: "" });

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
    const { data: c } = await supabase.from("ciftlikler").select("*").order("isim");
    if (c) setTedarikciler(c);
    const { data: b } = await supabase.from("bayiler").select("*").order("isim");
    if (b) setBayiler(b);
    const { data: u } = await supabase.from("urunler").select("*").order("isim");
    if (u) setUrunler(u);
    const { data: s } = await supabase.from("sut_giris").select("*").order("tarih", { ascending: false });
    if (s) setSutList(s);
    const { data: st } = await supabase.from("satis_giris").select("*").order("tarih", { ascending: false });
    if (st) setSatisList(st);
  }

  const fSayi = (num: number) => new Intl.NumberFormat('tr-TR').format(num || 0);

  // KISA NOT GÖSTERİCİ
  const renderNot = (not: string) => {
    if (!not) return "";
    if (not.length <= 15) return not;
    return (
      <span onClick={() => setDetayNot(not)} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8", color: "#3b82f6" }}>
        {not.substring(0, 15)}...
      </span>
    );
  };

  // AYARLAR
  async function ayarEkle(tablo: string, isim: string, resetFn: Function) {
    if (!isim.trim()) return;
    const { error } = await supabase.from(tablo).insert({ isim });
    if (error) alert(`Hata: ${error.message}`);
    else { resetFn(""); verileriGetir(); }
  }

  async function ayarSil(tablo: string, id: string) {
    if (confirm("Silmek istediğinize emin misiniz?")) {
      await supabase.from(tablo).delete().eq("id", id);
      verileriGetir();
    }
  }

  // --- SÜT İŞLEMLERİ ---
  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg) return alert("Eksik alan!");
    const p = { ...sutForm, kg: Number(sutForm.kg), fiyat: Number(sutForm.fiyat), toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat), aciklama: sutForm.aciklama };
    
    let error;
    if (editingId) {
      const { error: updErr } = await supabase.from("sut_giris").update(p).eq("id", editingId);
      error = updErr;
    } else {
      const { error: insErr } = await supabase.from("sut_giris").insert(p);
      error = insErr;
    }

    if (error) { alert("Süt Kayıt Hatası: " + error.message); return; }

    setSutForm({ ...sutForm, kg: "", fiyat: "", aciklama: "" }); setEditingId(null); verileriGetir();
  }

  const fSutList = sutList.filter(s => {
    const ciftlikUyuyor = sutFiltre.ciftlik === "" || s.ciftlik === sutFiltre.ciftlik;
    const baslangicUyuyor = sutFiltre.baslangic === "" || s.tarih >= sutFiltre.baslangic;
    const bitisUyuyor = sutFiltre.bitis === "" || s.tarih <= sutFiltre.bitis;
    return ciftlikUyuyor && baslangicUyuyor && bitisUyuyor;
  });
  const tSutKg = fSutList.reduce((a, b) => a + Number(b.kg), 0);
  const tSutTl = fSutList.reduce((a, b) => a + Number(b.toplam_tl), 0);

  // --- SATIŞ İŞLEMLERİ ---
  async function handleSatisKaydet() {
    if (!satisForm.bayi || !satisForm.urun || !satisForm.adet || !satisForm.fiyat) return alert("Lütfen Bayi, Ürün, Adet ve Fiyat alanlarını doldurun!");
    
    const birim = Number(satisForm.birim) || 0;
    const adet = Number(satisForm.adet) || 0;
    const fiyat = Number(satisForm.fiyat) || 0;
    const bos_kova = Number(satisForm.bos_kova) || 0;
    const toplam_kg = birim * adet;
    const tutar = adet * fiyat;

    const payload = { 
      tarih: satisForm.tarih, bayi: satisForm.bayi, urun: satisForm.urun,
      birim, adet, fiyat, toplam_kg, bos_kova, tutar, aciklama: satisForm.aciklama 
    };

    let error;
    if (editingId) {
      const { error: updErr } = await supabase.from("satis_giris").update(payload).eq("id", editingId);
      error = updErr;
    } else {
      const { error: insErr } = await supabase.from("satis_giris").insert(payload);
      error = insErr;
    }

    if (error) { alert("Satış Kayıt Hatası: " + error.message); return; }
    
    setSatisForm({ ...satisForm, urun: "", birim: "", adet: "", fiyat: "", bos_kova: "", aciklama: "" }); 
    setEditingId(null); verileriGetir();
  }

  const fSatisList = satisList.filter(s => {
    const bayiUyuyor = satisFiltre.bayi === "" || s.bayi === satisFiltre.bayi;
    const baslangicUyuyor = satisFiltre.baslangic === "" || s.tarih >= satisFiltre.baslangic;
    const bitisUyuyor = satisFiltre.bitis === "" || s.tarih <= satisFiltre.bitis;
    return bayiUyuyor && baslangicUyuyor && bitisUyuyor;
  });
  const tSatisKg = fSatisList.reduce((a, b) => a + Number(b.toplam_kg), 0);
  const tSatisTutar = fSatisList.reduce((a, b) => a + Number(b.tutar), 0);

  // ================= TEMİZ GİRİŞ EKRANI =================
  // ================= TEMİZ GİRİŞ EKRANI + BENİ HATIRLA =================
  if (!session) {
    // Sayfa yüklendiğinde hatırlanan kullanıcı adını çek
    const savedUser = localStorage.getItem('rememberedUser') || '';
    
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "20px", boxSizing: "border-box" }}>
        <form onSubmit={async (e) => { 
          e.preventDefault(); 
          // Eğer "Beni Hatırla" seçiliyse yerel hafızaya kaydet
          const rememberMe = (e.currentTarget.elements.namedItem('remember') as HTMLInputElement).checked;
          if (rememberMe) {
            localStorage.setItem('rememberedUser', username);
          } else {
            localStorage.removeItem('rememberedUser');
          }
          
          const email = username.includes("@") ? username : `${username}@sistem.local`; 
          await supabase.auth.signInWithPassword({ email, password }); 
        }} 
              style={{ background: "#ffffff", padding: "30px", borderRadius: "12px", width: "100%", maxWidth: "360px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          
          <h2 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "20px", fontWeight: "600", textAlign: "center", fontFamily: "sans-serif" }}>Sultanköy Süt Ürünleri</h2>
          <p style={{ margin: "0 0 24px 0", color: "#64748b", fontSize: "14px", textAlign: "center", fontFamily: "sans-serif" }}>Yönetim Paneline Giriş Yapın</p>
          
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "#334155" }}>Kullanıcı Adı</label>
            <input 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Kullanıcı adınız"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px", outline: "none" }} 
            />
          </div>
          
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", fontWeight: "500", color: "#334155" }}>Şifre</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="••••••••"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "14px", outline: "none" }} 
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", marginBottom: "20px", gap: "8px", cursor: "pointer" }}>
            <input type="checkbox" id="remember" name="remember" style={{ cursor: "pointer" }} defaultChecked={!!savedUser} />
            <label htmlFor="remember" style={{ fontSize: "13px", color: "#64748b", cursor: "pointer", userSelect: "none" }}>Beni Hatırla</label>
          </div>
          
          <button 
            type="submit" 
            style={{ width: "100%", padding: "12px", background: "#2563eb", color: "#ffffff", border: "none", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "14px" }}>
            Giriş Yap
          </button>
        </form>
        <style>{`#root { display: block !important; padding: 0 !important; }`}</style>
      </div>
    );
  }
  
  // BURADAN SONRASI ANA SAYFA (DEĞİŞTİRME)
  return (
    <div className="app-container" style={{ fontSize: `${fontSize}px` }}>
      
      <header className="header-style">
        <b style={{ color: temaRengi, fontSize: "16px" }}>SULTANKÖY v2</b>
        <button onClick={() => supabase.auth.signOut()} className="out-btn btn-anim">ÇIKIŞ YAP</button>
      </header>

      <main className="main-content">
        
        {/* ================= SÜT SEKMESİ ================= */}
        {activeTab === "sut" && (
          <div className="tab-fade-in">
            <div className="filter-row">
              <select value={sutFiltre.ciftlik} onChange={e => setSutFiltre({ ...sutFiltre, ciftlik: e.target.value })} className="f-inp">
                <option value="">Tedarikçi Filtre</option>
                {tedarikciler.map(t => <option key={t.id} value={t.isim}>{t.isim}</option>)}
              </select>
              <div className="date-filter-group">
                <input type="date" title="Başlangıç Tarihi" value={sutFiltre.baslangic} onChange={e => setSutFiltre({ ...sutFiltre, baslangic: e.target.value })} className="f-inp" style={{minWidth: "110px"}} />
                <span style={{alignSelf: 'center', fontWeight: 'bold', color: '#64748b'}}>-</span>
                <input type="date" title="Bitiş Tarihi" value={sutFiltre.bitis} onChange={e => setSutFiltre({ ...sutFiltre, bitis: e.target.value })} className="f-inp" style={{minWidth: "110px"}} />
              </div>
              {(sutFiltre.ciftlik || sutFiltre.baslangic || sutFiltre.bitis) && (
                 <button onClick={() => setSutFiltre({ciftlik: "", baslangic: "", bitis: ""})} className="x-btn-tag btn-anim">TEMİZLE</button>
              )}
            </div>
            
            <div className="card hover-card">
              <div className="responsive-form">
                <input type="date" value={sutForm.tarih} onChange={e => setSutForm({ ...sutForm, tarih: e.target.value })} className="m-inp" />
                <select value={sutForm.ciftlik} onChange={e => setSutForm({ ...sutForm, ciftlik: e.target.value })} className="m-inp">
                  <option value="">Seç...</option>
                  {tedarikciler.map(t => <option key={t.id} value={t.isim}>{t.isim}</option>)}
                </select>
                <input placeholder="KG" type="number" value={sutForm.kg} onChange={e => setSutForm({ ...sutForm, kg: e.target.value })} className="m-inp num-inp" />
                <input placeholder="₺ Fiyat" type="number" step="0.01" value={sutForm.fiyat} onChange={e => setSutForm({ ...sutForm, fiyat: e.target.value })} className="m-inp num-inp" />
                <input placeholder="Açıklama / Not..." value={sutForm.aciklama} onChange={e => setSutForm({ ...sutForm, aciklama: e.target.value })} className="m-inp grow-inp" />
                <button onClick={handleSutKaydet} className="p-btn btn-anim" style={{ background: temaRengi }}>{editingId ? "GÜNCELLE" : "KAYDET"}</button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="tbl">
                <thead><tr><th>TARİH</th><th>ÇİFTLİK</th><th>KG</th><th>FİYAT</th><th>TOPLAM</th><th>NOT</th><th style={{ textAlign: "right" }}>İŞLEM</th></tr></thead>
                <tbody>{fSutList.map(s => (
                  <tr key={s.id}>
                    <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                    <td style={{ fontWeight: "bold" }}>{s.ciftlik}</td>
                    <td>{fSayi(s.kg)}</td>
                    <td>{s.fiyat}</td>
                    <td style={{ color: temaRengi, fontWeight: "bold" }}>{fSayi(s.toplam_tl)}</td>
                    <td style={{ color: "#64748b" }}>{renderNot(s.aciklama)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setEditingId(s.id); setSutForm(s); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="ed-btn btn-anim">✏️</button>
                      <button onClick={async () => { if (confirm("Sil?")) { await supabase.from("sut_giris").delete().eq("id", s.id); verileriGetir(); } }} className="dl-btn btn-anim">✕</button>
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
            
            <div className="fixed-totals">
              <div className="b-kutu hover-card" style={{ borderLeft: `4px solid ${temaRengi}` }}><span>TOPLAM KG</span><b>{fSayi(tSutKg)}</b></div>
              <div className="b-kutu hover-card" style={{ borderLeft: `4px solid ${temaRengi}` }}><span>TOPLAM TL</span><b style={{ color: temaRengi }}>{fSayi(tSutTl)} ₺</b></div>
            </div>
          </div>
        )}

        {/* ================= SATIŞ SEKMESİ ================= */}
        {activeTab === "satis" && (
          <div className="tab-fade-in">
            <div className="filter-row">
              <select value={satisFiltre.bayi} onChange={e => setSatisFiltre({ ...satisFiltre, bayi: e.target.value })} className="f-inp">
                <option value="">Bayi Filtre</option>
                {bayiler.map(b => <option key={b.id} value={b.isim}>{b.isim}</option>)}
              </select>
              <div className="date-filter-group">
                <input type="date" title="Başlangıç Tarihi" value={satisFiltre.baslangic} onChange={e => setSatisFiltre({ ...satisFiltre, baslangic: e.target.value })} className="f-inp" style={{minWidth: "110px"}} />
                <span style={{alignSelf: 'center', fontWeight: 'bold', color: '#64748b'}}>-</span>
                <input type="date" title="Bitiş Tarihi" value={satisFiltre.bitis} onChange={e => setSatisFiltre({ ...satisFiltre, bitis: e.target.value })} className="f-inp" style={{minWidth: "110px"}} />
              </div>
              {(satisFiltre.bayi || satisFiltre.baslangic || satisFiltre.bitis) && (
                 <button onClick={() => setSatisFiltre({bayi: "", baslangic: "", bitis: ""})} className="x-btn-tag btn-anim">TEMİZLE</button>
              )}
            </div>
            
            <div className="card hover-card">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div className="responsive-form">
                  <input type="date" value={satisForm.tarih} onChange={e => setSatisForm({ ...satisForm, tarih: e.target.value })} className="m-inp" />
                  <select value={satisForm.bayi} onChange={e => setSatisForm({ ...satisForm, bayi: e.target.value })} className="m-inp">
                    <option value="">Bayi Seç...</option>
                    {bayiler.map(b => <option key={b.id} value={b.isim}>{b.isim}</option>)}
                  </select>
                  <select value={satisForm.urun} onChange={e => setSatisForm({ ...satisForm, urun: e.target.value })} className="m-inp">
                    <option value="">Ürün Seç...</option>
                    {urunler.map(u => <option key={u.id} value={u.isim}>{u.isim}</option>)}
                  </select>
                </div>
                
                <div className="responsive-form">
                  <input placeholder="Birim" type="number" value={satisForm.birim} onChange={e => setSatisForm({ ...satisForm, birim: e.target.value })} className="m-inp num-inp" />
                  <input placeholder="Adet" type="number" value={satisForm.adet} onChange={e => setSatisForm({ ...satisForm, adet: e.target.value })} className="m-inp num-inp" />
                  <input placeholder="Fiyat" type="number" step="0.01" value={satisForm.fiyat} onChange={e => setSatisForm({ ...satisForm, fiyat: e.target.value })} className="m-inp num-inp" />
                  <input placeholder="Boş Kova" type="number" value={satisForm.bos_kova} onChange={e => setSatisForm({ ...satisForm, bos_kova: e.target.value })} className="m-inp num-inp" />
                  <input placeholder="Açıklama / Not..." value={satisForm.aciklama} onChange={e => setSatisForm({ ...satisForm, aciklama: e.target.value })} className="m-inp grow-inp" />
                </div>
                
                <button onClick={handleSatisKaydet} className="p-btn btn-anim" style={{ background: "#059669", width: "100%" }}>{editingId ? "GÜNCELLE" : "SATIŞI KAYDET"}</button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="tbl tbl-satis">
                <thead>
                  <tr>
                    <th>TARİH</th><th>BAYİ</th><th>ÜRÜN</th><th>BİRİM</th><th>ADET</th><th>FİYAT</th><th>TOP. KG</th><th>BOŞ KOVA</th><th>TUTAR</th><th>NOT</th><th style={{ textAlign: "right" }}>İŞLEM</th>
                  </tr>
                </thead>
                <tbody>{fSatisList.map(s => (
                  <tr key={s.id}>
                    <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
                    <td style={{ fontWeight: "bold" }}>{s.bayi}</td>
                    <td>{s.urun}</td><td>{s.birim}</td><td>{s.adet}</td><td>{s.fiyat}</td>
                    <td style={{ fontWeight: "bold" }}>{fSayi(s.toplam_kg)}</td>
                    <td>{s.bos_kova || ""}</td>
                    <td style={{ color: "#059669", fontWeight: "bold" }}>{fSayi(s.tutar)}</td>
                    <td style={{ color: "#64748b" }}>{renderNot(s.aciklama)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => { setEditingId(s.id); setSatisForm(s); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="ed-btn btn-anim">✏️</button>
                      <button onClick={async () => { if (confirm("Sil?")) { await supabase.from("satis_giris").delete().eq("id", s.id); verileriGetir(); } }} className="dl-btn btn-anim">✕</button>
                    </td>
                  </tr>))}
                </tbody>
              </table>
            </div>
            
            <div className="fixed-totals">
              <div className="b-kutu hover-card" style={{ borderLeft: "4px solid #059669" }}><span>TOPLAM KG</span><b>{fSayi(tSatisKg)}</b></div>
              <div className="b-kutu hover-card" style={{ borderLeft: "4px solid #059669" }}><span>TOPLAM TUTAR</span><b style={{ color: "#059669" }}>{fSayi(tSatisTutar)} ₺</b></div>
            </div>
          </div>
        )}

        {/* ================= AYARLAR SEKMESİ ================= */}
        {activeTab === "ayarlar" && (
          <div className="tab-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            
            <div className="card hover-card">
              <div onClick={() => setAcikTedarikci(!acikTedarikci)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <h4 style={{ margin: 0 }}>🥛 Süt Tedarikçileri</h4>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>{acikTedarikci ? "▲ GİZLE" : "▼ AÇ"}</span>
              </div>
              {acikTedarikci && (
                <div style={{ marginTop: "15px", borderTop: "1px solid #e2e8f0", paddingTop: "15px" }}>
                  <div className="responsive-form" style={{marginBottom: "10px"}}>
                    <input placeholder="Yeni tedarikçi..." value={yeniTedarikci} onChange={e => setYeniTedarikci(e.target.value)} className="m-inp grow-inp" />
                    <button onClick={() => ayarEkle("ciftlikler", yeniTedarikci, setYeniTedarikci)} className="p-btn btn-anim" style={{ background: temaRengi, flex: "0 0 100px" }}>EKLE</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {tedarikciler.map(t => <div key={t.id} className="tag-chip">{t.isim} <button onClick={() => ayarSil("ciftlikler", t.id)} className="x-btn-tag btn-anim">✕</button></div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="card hover-card">
              <div onClick={() => setAcikBayi(!acikBayi)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <h4 style={{ margin: 0 }}>🏢 Satış Bayileri / Müşteriler</h4>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>{acikBayi ? "▲ GİZLE" : "▼ AÇ"}</span>
              </div>
              {acikBayi && (
                <div style={{ marginTop: "15px", borderTop: "1px solid #e2e8f0", paddingTop: "15px" }}>
                  <div className="responsive-form" style={{marginBottom: "10px"}}>
                    <input placeholder="Yeni bayi/müşteri..." value={yeniBayi} onChange={e => setYeniBayi(e.target.value)} className="m-inp grow-inp" />
                    <button onClick={() => ayarEkle("bayiler", yeniBayi, setYeniBayi)} className="p-btn btn-anim" style={{ background: "#059669", flex: "0 0 100px" }}>EKLE</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {bayiler.map(b => <div key={b.id} className="tag-chip" style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>{b.isim} <button onClick={() => ayarSil("bayiler", b.id)} className="x-btn-tag btn-anim">✕</button></div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="card hover-card">
              <div onClick={() => setAcikUrun(!acikUrun)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <h4 style={{ margin: 0 }}>📦 Ürün Listesi</h4>
                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold" }}>{acikUrun ? "▲ GİZLE" : "▼ AÇ"}</span>
              </div>
              {acikUrun && (
                <div style={{ marginTop: "15px", borderTop: "1px solid #e2e8f0", paddingTop: "15px" }}>
                  <div className="responsive-form" style={{marginBottom: "10px"}}>
                    <input placeholder="Yeni ürün..." value={yeniUrun} onChange={e => setYeniUrun(e.target.value)} className="m-inp grow-inp" />
                    <button onClick={() => ayarEkle("urunler", yeniUrun, setYeniUrun)} className="p-btn btn-anim" style={{ background: "#f59e0b", flex: "0 0 100px" }}>EKLE</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {urunler.map(u => <div key={u.id} className="tag-chip" style={{ background: "#ffedd5", border: "1px solid #fdba74" }}>{u.isim} <button onClick={() => ayarSil("urunler", u.id)} className="x-btn-tag btn-anim">✕</button></div>)}
                  </div>
                </div>
              )}
            </div>

            <div className="card hover-card">
              <h4 style={{ margin: "0 0 10px 0" }}>Yazı Boyutu ({fontSize}px)</h4>
              <input type="range" min="11" max="18" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
            </div>

          </div>
        )}

        {/* NOT AÇILIR PENCERESİ (MODAL) */}
        {detayNot && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }} onClick={() => setDetayNot(null)}>
            <div style={{ backgroundColor: "#ffffff", padding: "25px", borderRadius: "16px", width: "100%", maxWidth: "350px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginTop: 0, marginBottom: "15px", color: "#1e293b", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", fontFamily: "sans-serif" }}>Açıklama / Not</h3>
              <p style={{ margin: "0 0 25px 0", color: "#475569", lineHeight: "1.6", fontSize: "15px", wordWrap: "break-word", fontFamily: "sans-serif" }}>{detayNot}</p>
              <button onClick={() => setDetayNot(null)} style={{ width: "100%", padding: "12px", background: "#f1f5f9", color: "#1e293b", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", fontFamily: "sans-serif" }}>KAPAT</button>
            </div>
          </div>
        )}

      </main>

      <footer className="fixed-nav">
        {[{ id: "ozet", i: "📊" }, { id: "sut", i: "🥛" }, { id: "satis", i: "💰" }, { id: "ayarlar", i: "⚙️" }].map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); setEditingId(null); }} className={`n-item btn-anim ${activeTab === item.id ? 'active' : ''}`} style={activeTab === item.id ? { color: temaRengi, borderTopColor: temaRengi } : {}}>
            <span style={{ fontSize: "20px" }}>{item.i}</span>
            <span style={{ fontSize: "10px", fontWeight: "bold" }}>{item.id.toUpperCase()}</span>
          </button>
        ))}
      </footer>

      {/* VITE SIFIRLAYICI CSS - BUNLAR KARANLIK MODU VE KAYMALARI İPTAL EDER */}
      <style>{`
        * { box-sizing: border-box; }
        
        :root { color-scheme: light !important; }

        html, body {
          max-width: 100vw;
          overflow-x: hidden;
          margin: 0 !important; 
          padding: 0 !important;
          background: #f8fafc !important;
          font-family: -apple-system, system-ui, sans-serif;
          color: #1e293b !important;
        }

        #root { 
          display: block !important; 
          padding: 0 !important; 
          margin: 0 auto !important; 
          max-width: none !important; 
          text-align: left !important;
        }
        
        input::placeholder { color: #94a3b8 !important; opacity: 1; }

        .app-container {
          max-width: 1000px;
          margin: 0 auto;
          width: 100%;
          min-height: 100vh;
          background-color: #f8fafc;
          box-shadow: 0 0 20px rgba(0,0,0,0.02);
          position: relative;
          overflow-x: hidden;
        }

        .header-style {
          display: flex; justify-content: space-between; padding: 12px; background: #ffffff; border-bottom: 1px solid #e2e8f0;
          position: sticky; top: 0; z-index: 50;
        }
        
        .main-content { padding: 10px; padding-bottom: 220px; }

        .tab-fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .responsive-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
        .m-inp {
          flex: 1 1 120px;
          padding: 10px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #ffffff; color: #1e293b !important;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .m-inp:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
        
        .num-inp { flex: 0 1 80px; }
        .grow-inp { flex: 2 1 150px; }
        .p-btn { flex: 1 1 100%; height: 40px; color: #ffffff; border: none; border-radius: 6px; cursor: pointer; font-size: 15px; font-weight: bold; }

        @media (min-width: 768px) {
          .responsive-form { flex-wrap: nowrap; align-items: center; }
          .m-inp { padding: 8px; flex: 1 1 auto; }
          .num-inp { flex: 0 1 80px; }
          .p-btn { flex: 0 0 auto; padding: 0 20px; }
        }

        .filter-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .f-inp { flex: 1 1 120px; padding: 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff; color: #1e293b; outline: none; }
        .date-filter-group { display: flex; gap: 4px; flex: 2; flex-wrap: wrap; }

        .card { background: #ffffff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 15px; }
        .hover-card { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .hover-card:hover { box-shadow: 0 6px 12px rgba(0,0,0,0.04); transform: translateY(-1px); }

        .table-wrapper { width: 100%; max-width: 100vw; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tbl { width: 100%; border-collapse: collapse; min-width: 600px; }
        .tbl th { padding: 10px 12px; text-align: left; color: #475569; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 12px; white-space: nowrap; }
        .tbl-satis th { background: #5b9bd5 !important; color: white !important; }
        .tbl td { padding: 8px 12px; color: #1e293b; border-bottom: 1px solid #f1f5f9; }

        /* ALT TOPLAMLAR - MERKEZE ÇİVİLENDİ (KAYMA YAPMAZ) */
        .fixed-totals {
          position: fixed; 
          bottom: 80px; 
          left: 50%; 
          transform: translateX(-50%);
          width: calc(100% - 20px);
          max-width: 980px; 
          display: flex; 
          gap: 10px; 
          z-index: 90;
        }
        .b-kutu { flex: 1; background: #ffffff; padding: 12px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.06); display: flex; flex-direction: column; border: 1px solid #e2e8f0; }
        
        .fixed-nav {
          position: fixed; 
          bottom: 0; 
          left: 50%; 
          transform: translateX(-50%);
          width: 100%; 
          max-width: 1000px; 
          height: 70px;
          background: #ffffff; 
          border-top: 1px solid #e2e8f0; 
          display: flex; 
          z-index: 100;
        }
        .n-item { flex: 1; border: none; background: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-top: 3px solid transparent; transition: color 0.2s, border-color 0.2s; }
        .n-item.active { background: #f8fafc; }

        .btn-anim { transition: transform 0.1s ease; }
        .btn-anim:active { transform: scale(0.95); }
        .out-btn { background: #ffffff; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .ed-btn { background: none; border: none; color: #2563eb; font-size: 16px; cursor: pointer; padding: 4px; }
        .dl-btn { background: none; border: none; color: #dc2626; font-size: 18px; font-weight: bold; cursor: pointer; padding: 4px; }
        .x-btn-tag { border: none; background: none; color: #ef4444; cursor: pointer; font-weight: bold; padding: 4px; }
        .tag-chip { padding: 6px 10px; background: #f1f5f9; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 6px; border: 1px solid #e2e8f0; color: #1e293b; font-weight: 500; }
      `}</style>
    </div>
  );
}
