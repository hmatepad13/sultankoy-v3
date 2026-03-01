import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// --- TİP TANIMLAMALARI ---
interface Ciftlik { id: string; isim: string; }
interface Bayi { id: string; isim: string; }
interface Urun { id: string; isim: string; fiyat?: number | string; }
interface SutGiris { id?: string; tarih: string; ciftlik: string; kg: number | string; fiyat: number | string; toplam_tl?: number; aciklama: string; }
interface SatisGiris { id?: string; fis_no?: string; tarih: string; bayi: string; urun: string; adet: number | string; fiyat: number | string; tutar?: number; }
interface SatisFis { id?: string; fis_no: string; tarih: string; bayi: string; toplam_tutar: number; tahsilat: number; kalan_bakiye: number; odeme_turu: string; aciklama: string; }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // SEKMELER: ozet, sut, satis, analiz, ayarlar
  const [activeTab, setActiveTab] = useState("ozet");
  
  const [ciftlikler, setCiftlikler] = useState<Ciftlik[]>([]);
  const [bayiler, setBayiler] = useState<Bayi[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [sutList, setSutList] = useState<SutGiris[]>([]);
  const [satisFisList, setSatisFisList] = useState<SatisFis[]>([]);
  const [satisList, setSatisList] = useState<SatisGiris[]>([]);
  
  const bugun = new Date().toISOString().split("T")[0];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: any) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, s: any) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) verileriGetir(); }, [session]);

  async function verileriGetir() {
    const [{ data: c }, { data: b }, { data: u }, { data: st }, { data: f }, { data: sg }] = await Promise.all([
      supabase.from("ciftlikler").select("*").order("isim"),
      supabase.from("bayiler").select("*").order("isim"),
      supabase.from("urunler").select("*").order("isim"),
      supabase.from("sut_giris").select("*").order("tarih", { ascending: false }),
      supabase.from("satis_fisleri").select("*").order("tarih", { ascending: false }),
      supabase.from("satis_giris").select("*").order("tarih", { ascending: false })
    ]);
    if (c) setCiftlikler(c); if (b) setBayiler(b); if (u) setUrunler(u); 
    if (st) setSutList(st); if (f) setSatisFisList(f); if (sg) setSatisList(sg);
  }

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(Number(num) || 0));

  // --- HESAPLAMALAR ---
  const toplamSutKg = useMemo(() => sutList.reduce((a, b) => a + Number(b.kg || 0), 0), [sutList]);
  const toplamSatisTl = useMemo(() => satisFisList.reduce((a, b) => a + Number(b.toplam_tutar || 0), 0), [satisFisList]);
  const toplamTahsilat = useMemo(() => satisFisList.reduce((a, b) => a + Number(b.tahsilat || 0), 0), [satisFisList]);
  const toplamAcikHesap = useMemo(() => satisFisList.reduce((a, b) => a + Number(b.kalan_bakiye || 0), 0), [satisFisList]);
  const toplamUrunAdet = useMemo(() => satisList.reduce((a, b) => a + Number(b.adet || 0), 0), [satisList]);
  const toplamUrunTutar = useMemo(() => satisList.reduce((a, b) => a + Number(b.tutar || 0), 0), [satisList]);

  if (!session) {
    return (
      <div className="login-box">
        <form onSubmit={async (e:any) => { e.preventDefault(); await supabase.auth.signInWithPassword({ email: `${username}@sistem.local`, password }); }}>
          <h2>SULTANKÖY v2</h2>
          <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Kullanıcı" className="m-inp" />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Şifre" className="m-inp" />
          <button type="submit" className="p-btn green-btn" style={{width:'100%'}}>GİRİŞ YAP</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header-style">
        <b style={{color:'#2563eb', fontSize:'18px'}}>SULTANKÖY v2</b> 
        <button onClick={() => supabase.auth.signOut()} className="cikis-btn">ÇIKIŞ YAP</button>
      </header>

      <main className="main-content" style={{paddingBottom: '80px', padding: '10px'}}>
        
        {/* --- ÖZET SEKMESİ --- */}
        {activeTab === "ozet" && (
          <div className="fade-in">
            <div className="cards-grid">
              <div className="summary-card" style={{borderLeftColor: '#3b82f6'}}>
                <span>Süt Alımı</span>
                <b style={{color: '#3b82f6'}}>{fSayi(toplamSutKg)} KG</b>
              </div>
              <div className="summary-card" style={{borderLeftColor: '#10b981'}}>
                <span>Toplam Satış</span>
                <b style={{color: '#10b981'}}>{fSayi(toplamSatisTl)} ₺</b>
              </div>
            </div>
            <div className="list-container mt-15">
              <h4 style={{margin: '0 0 10px 0', color: '#333'}}>Son Kesilen Fişler</h4>
              {satisFisList.slice(0, 5).map(f => (
                <div key={f.id} className="list-item">
                  <span style={{color: '#666'}}>{f.tarih.split('-').reverse().join('.')}</span>
                  <b style={{flex: 1, marginLeft: '10px'}}>{f.bayi}</b>
                  <b style={{color: '#10b981'}}>{fSayi(f.toplam_tutar)} ₺</b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- SÜT SEKMESİ --- */}
        {activeTab === "sut" && (
          <div className="fade-in">
             <button className="p-btn blue-btn w-100 mb-10">➕ YENİ SÜT ALIMI EKLE</button>
             <div className="cards-grid">
              <div className="summary-card" style={{borderLeftColor: '#3b82f6'}}>
                <span>TOPLAM ALIM</span><b style={{color: '#3b82f6'}}>{fSayi(toplamSutKg)} KG</b>
              </div>
            </div>
            <div className="table-wrapper mt-10">
              <table className="tbl tbl-blue">
                <thead><tr><th>TARİH</th><th>ÇİFTLİK</th><th style={{textAlign:'right'}}>KG</th></tr></thead>
                <tbody>
                  {sutList.map(s => <tr key={s.id}><td>{s.tarih.split('-').reverse().slice(0,2).join('.')}</td><td><b>{s.ciftlik}</b></td><td style={{textAlign:'right'}}>{fSayi(s.kg)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- SATIŞ SEKMESİ --- */}
        {activeTab === "satis" && (
          <div className="fade-in">
            <button className="p-btn green-btn w-100 mb-10">➕ YENİ SATIŞ FİŞİ KES</button>
            <div className="cards-row">
               <div className="summary-card-small" style={{borderLeftColor:'#10b981'}}><span>FİŞ TOPLAMI</span><b style={{color:'#10b981'}}>{fSayi(toplamSatisTl)} ₺</b></div>
               <div className="summary-card-small" style={{borderLeftColor:'#3b82f6'}}><span>TAHSİLAT</span><b style={{color:'#3b82f6'}}>{fSayi(toplamTahsilat)} ₺</b></div>
               <div className="summary-card-small" style={{borderLeftColor:'#ef4444'}}><span>AÇIK HESAP</span><b style={{color:'#ef4444'}}>{fSayi(toplamAcikHesap)} ₺</b></div>
            </div>
            <div className="table-wrapper mt-10">
              <table className="tbl tbl-blue">
                <thead>
                  <tr><th>TARİH</th><th>BAYİ</th><th style={{textAlign:'right'}}>TUTAR</th><th style={{textAlign:'right'}}>TAHSİLAT</th><th style={{textAlign:'right'}}>KALAN</th><th style={{textAlign:'center'}}>İŞL</th></tr>
                </thead>
                <tbody>
                  {satisFisList.map(f => (
                    <tr key={f.id}>
                      <td>{f.tarih.split("-").reverse().slice(0,2).join(".")}</td>
                      <td><b>{f.bayi}</b></td>
                      <td style={{textAlign:'right', color:'#10b981'}}><b>{fSayi(f.toplam_tutar)}</b></td>
                      <td style={{textAlign:'right', color:'#3b82f6'}}><b>{fSayi(f.tahsilat)}</b></td>
                      <td style={{textAlign:'right', color:'#ef4444'}}><b>{fSayi(f.kalan_bakiye)}</b></td>
                      <td style={{textAlign:'center', fontSize:'14px'}}>🔍 ✏️</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- ANALİZ SEKMESİ --- */}
        {activeTab === "analiz" && (
           <div className="fade-in">
              <div className="analiz-header">
                 <h3 style={{margin:0, color:'#8b5cf6'}}>Ürün & Satış Analizi</h3>
                 <span style={{fontSize:'12px', color:'#666'}}>Bu liste detaylı filtreleme ve raporlama içindir.</span>
              </div>
              <div className="cards-grid mt-10 mb-10">
                <div className="summary-card" style={{borderLeftColor:'#8b5cf6'}}><span>TOPLAM ÜRÜN</span><b style={{color:'#8b5cf6'}}>{fSayi(toplamUrunAdet)}</b></div>
                <div className="summary-card" style={{borderLeftColor:'#8b5cf6'}}><span>TOPLAM TUTAR</span><b style={{color:'#8b5cf6'}}>{fSayi(toplamUrunTutar)} ₺</b></div>
              </div>
              <div className="table-wrapper">
                <table className="tbl tbl-purple">
                   <thead>
                     <tr><th>TARİH</th><th>BAYİ</th><th>ÜRÜN</th><th style={{textAlign:'right'}}>ADET</th><th style={{textAlign:'right'}}>FİYAT</th><th style={{textAlign:'right'}}>TUTAR</th></tr>
                   </thead>
                   <tbody>
                     {satisList.map(s => (
                       <tr key={s.id}>
                         <td>{s.tarih.split("-").reverse().slice(0,2).join(".")}</td>
                         <td><b>{s.bayi}</b></td><td>{s.urun}</td>
                         <td style={{textAlign:'right'}}>{fSayi(s.adet)}</td>
                         <td style={{textAlign:'right'}}>{fSayi(s.fiyat)}</td>
                         <td style={{textAlign:'right', color:'#8b5cf6'}}><b>{fSayi(s.tutar)} ₺</b></td>
                       </tr>
                     ))}
                   </tbody>
                </table>
              </div>
           </div>
        )}

        {/* --- AYARLAR SEKMESİ --- */}
        {activeTab === "ayarlar" && (
          <div className="fade-in">
             <h3 style={{color:'#475569'}}>Sistem Ayarları</h3>
             <div className="list-container mb-10"><h4 style={{margin:0}}>📍 Bayiler ({bayiler.length})</h4></div>
             <div className="list-container mb-10"><h4 style={{margin:0}}>📦 Ürünler ({urunler.length})</h4></div>
             <div className="list-container mb-10"><h4 style={{margin:0}}>🐄 Çiftlikler ({ciftlikler.length})</h4></div>
          </div>
        )}

      </main>

      {/* ALT MENÜ */}
      <footer className="fixed-nav">
        <button onClick={()=>setActiveTab("ozet")} className={activeTab==="ozet"?"active":""}>📊<br/>ÖZET</button>
        <button onClick={()=>setActiveTab("sut")} className={activeTab==="sut"?"active":""}>🥛<br/>SÜT</button>
        <button onClick={()=>setActiveTab("satis")} className={activeTab==="satis"?"active":""}>💰<br/>SATIŞ</button>
        <button onClick={()=>setActiveTab("analiz")} className={activeTab==="analiz"?"active":""}>📈<br/>ANALİZ</button>
        <button onClick={()=>setActiveTab("ayarlar")} className={activeTab==="ayarlar"?"active":""}>⚙️<br/>AYARLAR</button>
      </footer>

      <style>{`
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { margin: 0; padding: 0; background: #f8fafc; overflow-x: hidden; }
        .app-container { max-width: 600px; margin: 0 auto; min-height: 100vh; position: relative; background: #f8fafc; }
        .header-style { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #fff; border-bottom: 1px solid #e2e8f0; }
        .cikis-btn { border: 1px solid #fecaca; background: #fff; color: #ef4444; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; }
        
        .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .cards-row { display: flex; gap: 8px; justify-content: space-between; }
        .summary-card { background: #fff; padding: 15px; border-radius: 12px; border-left: 4px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
        .summary-card span { font-size: 11px; color: #64748b; margin-bottom: 5px; }
        .summary-card b { font-size: 18px; }
        .summary-card-small { flex: 1; background: #fff; padding: 10px; border-radius: 8px; border-left: 3px solid #ddd; display: flex; flex-direction: column; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
        .summary-card-small span { font-size: 9px; color: #64748b; margin-bottom: 4px; font-weight: bold; }
        .summary-card-small b { font-size: 13px; }
        
        .list-container { background: #fff; border-radius: 12px; padding: 15px; border: 1px solid #e2e8f0; }
        .list-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .list-item:last-child { border-bottom: none; padding-bottom: 0; }
        
        .analiz-header { background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #ede9fe; border-left: 4px solid #8b5cf6; }
        
        .table-wrapper { width: 100%; overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; }
        .tbl { width: 100%; border-collapse: collapse; white-space: nowrap; }
        .tbl th { padding: 10px; font-size: 10px; text-align: left; font-weight: bold; color: #fff; }
        .tbl td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; }
        .tbl-blue th { background: #60a5fa; }
        .tbl-purple th { background: #8b5cf6; }
        
        .fixed-nav { position: fixed; bottom: 0; width: 100%; max-width: 600px; height: 65px; background: #fff; display: flex; border-top: 1px solid #e2e8f0; z-index: 100; box-shadow: 0 -2px 10px rgba(0,0,0,0.03); }
        .fixed-nav button { flex: 1; border: none; background: none; font-size: 9px; font-weight: bold; color: #94a3b8; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .fixed-nav button.active { color: #2563eb; border-top: 2px solid #2563eb; background: #eff6ff; }
        
        .p-btn { padding: 14px; border: none; border-radius: 8px; color: #fff; font-weight: bold; cursor: pointer; font-size: 14px; }
        .green-btn { background: #10b981; }
        .blue-btn { background: #3b82f6; }
        .w-100 { width: 100%; }
        .mt-10 { margin-top: 10px; } .mb-10 { margin-bottom: 10px; } .mt-15 { margin-top: 15px; }
        
        .login-box { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
        .login-box form { background: #fff; padding: 30px; border-radius: 12px; width: 320px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .m-inp { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
        .fade-in { animation: fadeIn 0.3s ease-in-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
