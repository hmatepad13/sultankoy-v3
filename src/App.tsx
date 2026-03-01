import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

interface Bayi { id: string; isim: string; }
interface Urun { id: string; isim: string; fiyat?: number | string; }
interface SatisGiris { id?: string; fis_no?: string; tarih: string; bayi: string; urun: string; adet: number | string; fiyat: number | string; tutar?: number; }
interface SatisFis { id?: string; fis_no: string; tarih: string; bayi: string; toplam_tutar: number; tahsilat: number; kalan_bakiye: number; odeme_turu: string; aciklama: string; }

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || "", import.meta.env.VITE_SUPABASE_ANON_KEY || "");

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState("satis");
  const [bayiler, setBayiler] = useState<Bayi[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [satisFisList, setSatisFisList] = useState<SatisFis[]>([]);
  const [satisList, setSatisList] = useState<SatisGiris[]>([]);
  const bugun = new Date().toISOString().split("T")[0];

  const [fisFiltre, setFisFiltre] = useState({ bayiler: [] as string[], baslangic: "", bitis: "" });
  const [analizFiltre, setAnalizFiltre] = useState({ bayiler: [] as string[], urunler: [] as string[], baslangic: "", bitis: "" });
  const [activeFilterModal, setActiveFilterModal] = useState<string | null>(null);

  const [isFisModalOpen, setIsFisModalOpen] = useState(false);
  const [fisUst, setFisUst] = useState({ tarih: bugun, bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "" });
  const [fisDetay, setFisDetay] = useState<Record<string, { adet: string, fiyat: string }>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: any) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, s: any) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) verileriGetir(); }, [session]);

  async function verileriGetir() {
    const [{ data: b }, { data: u }, { data: f }, { data: st }] = await Promise.all([
      supabase.from("bayiler").select("*").order("isim"),
      supabase.from("urunler").select("*").order("isim"),
      supabase.from("satis_fisleri").select("*").order("tarih", { ascending: false }),
      supabase.from("satis_giris").select("*").order("tarih", { ascending: false })
    ]);
    if (b) setBayiler(b); if (u) setUrunler(u); if (f) setSatisFisList(f); if (st) setSatisList(st);
  }

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(Number(num) || 0));

  const handleCheckboxToggle = (listName: string, setStateFn: any, val: string) => {
    setStateFn((prev: any) => {
      const arr = (prev as any)[listName];
      const newArr = arr.includes(val) ? arr.filter((x: string) => x !== val) : [...arr, val];
      return { ...prev, [listName]: newArr };
    });
  };

  const handleBayiSecimi = (val: string) => {
    setFisUst({ ...fisUst, bayi: val });
    const yeniDetay = { ...fisDetay };
    urunler.forEach((u: any) => {
      const gecmis = satisList.filter(s => s.bayi === val && s.urun === u.isim).sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
      yeniDetay[u.id] = { adet: "", fiyat: String(gecmis?.fiyat || u.fiyat || "") };
    });
    setFisDetay(yeniDetay);
  };

  const canliTutar = useMemo(() => urunler.reduce((a, u) => a + (Number(fisDetay[u.id]?.adet) || 0) * (Number(fisDetay[u.id]?.fiyat) || 0), 0), [urunler, fisDetay]);
  const aktifBayiBorc = useMemo(() => {
    if (!fisUst.bayi) return 0;
    return satisFisList.filter(f => f.bayi === fisUst.bayi).reduce((a, b) => a + Number(b.kalan_bakiye), 0);
  }, [fisUst.bayi, satisFisList]);
  const toplamGenelBorc = aktifBayiBorc + (canliTutar - Number(fisUst.tahsilat || 0));

  async function fisKaydet() {
    const eklenecek = urunler.filter(u => Number(fisDetay[u.id]?.adet) > 0);
    const fisNo = `F-${Date.now().toString().slice(-6)}`;
    await supabase.from("satis_fisleri").insert({ fis_no: fisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, toplam_tutar: canliTutar, tahsilat: Number(fisUst.tahsilat)||0, kalan_bakiye: canliTutar - Number(fisUst.tahsilat||0), odeme_turu: fisUst.odeme_turu, aciklama: fisUst.aciklama });
    const detaylar = eklenecek.map(u => ({ fis_no: fisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: Number(fisDetay[u.id].adet), fiyat: Number(fisDetay[u.id].fiyat), tutar: Number(fisDetay[u.id].adet)*Number(fisDetay[u.id].fiyat) }));
    await supabase.from("satis_giris").insert(detaylar);
    setIsFisModalOpen(false); verileriGetir();
  }

  const fFis = satisFisList.filter(f => (fisFiltre.bayiler.length === 0 || fisFiltre.bayiler.includes(f.bayi)) && (!fisFiltre.baslangic || f.tarih >= fisFiltre.baslangic) && (!fisFiltre.bitis || f.tarih <= fisFiltre.bitis));
  const fAnaliz = satisList.filter(s => (analizFiltre.bayiler.length === 0 || analizFiltre.bayiler.includes(s.bayi)) && (analizFiltre.urunler.length === 0 || analizFiltre.urunler.includes(s.urun)) && (!analizFiltre.baslangic || s.tarih >= analizFiltre.baslangic) && (!analizFiltre.bitis || s.tarih <= analizFiltre.bitis));

  if (!session) {
    return (
      <div className="login-box">
        <form onSubmit={async (e:any) => { e.preventDefault(); await supabase.auth.signInWithPassword({ email: `${username}@sistem.local`, password }); }}>
          <h2>Sultanköy v2</h2>
          <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Kullanıcı" />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Şifre" />
          <button type="submit">Giriş Yap</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header-style"><b>SULTANKÖY v2</b> <button onClick={() => supabase.auth.signOut()}>ÇIKIŞ</button></header>
      <main className="main-content">
        {activeTab === "satis" && (
          <div>
            <button onClick={() => setIsFisModalOpen(true)} className="p-btn green-btn" style={{width:'100%', marginBottom:'10px'}}>➕ YENİ SATIŞ FİŞİ</button>
            <div className="compact-totals">
               <div className="c-kutu"><span>TOPLAM SATIŞ</span><b>{fSayi(fFis.reduce((a,b)=>a+b.toplam_tutar,0))}</b></div>
               <div className="c-kutu" style={{borderLeftColor:'red'}}><span>KALAN BAKİYE</span><b>{fSayi(fFis.reduce((a,b)=>a+b.kalan_bakiye,0))}</b></div>
            </div>
            <div className="table-wrapper">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{textAlign:'left'}}>TARİH<br/>
                      <input type="date" className="date-icon-only white-icon" value={fisFiltre.baslangic} onChange={e=>setFisFiltre({...fisFiltre, baslangic:e.target.value})} />
                      <input type="date" className="date-icon-only white-icon" value={fisFiltre.bitis} onChange={e=>setFisFiltre({...fisFiltre, bitis:e.target.value})} />
                    </th>
                    <th>BAYİ <span onClick={() => setActiveFilterModal('fis_bayi')}>🔽</span></th>
                    <th style={{textAlign:'right'}}>TUTAR</th>
                    <th style={{textAlign:'right'}}>KALAN</th>
                  </tr>
                </thead>
                <tbody>
                  {fFis.map(f => (<tr key={f.id}><td>{f.tarih.split("-").reverse().slice(0,2).join(".")}</td><td><b>{f.bayi}</b></td><td style={{textAlign:'right'}}>{fSayi(f.toplam_tutar)}</td><td style={{textAlign:'right', color: f.kalan_bakiye>0?'red':''}}>{fSayi(f.kalan_bakiye)}</td></tr>))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === "analiz" && (
           <div>
              <div className="compact-totals">
                <div className="c-kutu" style={{borderLeftColor:'#8b5cf6'}}><span>ADET</span><b>{fSayi(fAnaliz.reduce((a,b)=>a+Number(b.adet),0))}</b></div>
                <div className="c-kutu" style={{borderLeftColor:'#8b5cf6'}}><span>TUTAR</span><b>{fSayi(fAnaliz.reduce((a,b)=>a+Number(b.tutar),0))}</b></div>
              </div>
              <div className="table-wrapper">
                <table className="tbl tbl-analiz">
                   <thead>
                     <tr>
                       <th style={{textAlign:'left'}}>TARİH<br/>
                         <input type="date" className="date-icon-only white-icon" value={analizFiltre.baslangic} onChange={e=>setAnalizFiltre({...analizFiltre, baslangic:e.target.value})} />
                         <input type="date" className="date-icon-only white-icon" value={analizFiltre.bitis} onChange={e=>setAnalizFiltre({...analizFiltre, bitis:e.target.value})} />
                       </th>
                       <th>BAYİ <span onClick={()=>setActiveFilterModal('analiz_bayi')}>🔽</span></th>
                       <th>ÜRÜN <span onClick={()=>setActiveFilterModal('analiz_urun')}>🔽</span></th>
                       <th style={{textAlign:'right'}}>TUTAR</th>
                     </tr>
                   </thead>
                   <tbody>
                     {fAnaliz.map(s => (<tr key={s.id}><td>{s.tarih.split("-").reverse().slice(0,2).join(".")}</td><td>{s.bayi}</td><td>{s.urun}</td><td style={{textAlign:'right'}}>{fSayi(s.tutar)}</td></tr>))}
                   </tbody>
                </table>
              </div>
           </div>
        )}
      </main>
      <footer className="fixed-nav">
        <button onClick={()=>setActiveTab("satis")} className={activeTab==="satis"?"active":""}>💰 SATIŞ</button>
        <button onClick={()=>setActiveTab("analiz")} className={activeTab==="analiz"?"active":""}>📈 ANALİZ</button>
      </footer>
      {activeFilterModal && (
          <div className="modal-overlay" onClick={() => setActiveFilterModal(null)}>
            <div className="filter-card" onClick={e => e.stopPropagation()}>
              <h4>Filtrele</h4>
              <div className="filter-list">
                {activeFilterModal === 'fis_bayi' && bayiler.map(b => (<label key={b.id}><input type="checkbox" checked={fisFiltre.bayiler.includes(b.isim)} onChange={() => handleCheckboxToggle('bayiler', setFisFiltre, b.isim)}/> {b.isim}</label>))}
                {activeFilterModal === 'analiz_bayi' && bayiler.map(b => (<label key={b.id}><input type="checkbox" checked={analizFiltre.bayiler.includes(b.isim)} onChange={() => handleCheckboxToggle('bayiler', setAnalizFiltre, b.isim)}/> {b.isim}</label>))}
                {activeFilterModal === 'analiz_urun' && urunler.map(u => (<label key={u.id}><input type="checkbox" checked={analizFiltre.urunler.includes(u.isim)} onChange={() => handleCheckboxToggle('urunler', setAnalizFiltre, u.isim)}/> {u.isim}</label>))}
              </div>
              <button onClick={() => setActiveFilterModal(null)} className="p-btn" style={{width:'100%', marginTop:'10px'}}>UYGULA</button>
            </div>
          </div>
      )}
      {isFisModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
             <div className="modal-header"><h3>SATIŞ FİŞİ KES</h3> <button onClick={()=>setIsFisModalOpen(false)}>✕</button></div>
             <div className="modal-body" style={{maxHeight:'70vh', overflowY:'auto'}}>
                <input type="date" value={fisUst.tarih} onChange={e=>setFisUst({...fisUst, tarih:e.target.value})} className="m-inp" />
                <select value={fisUst.bayi} onChange={e=>handleBayiSecimi(e.target.value)} className="m-inp">
                  <option value="">Bayi Seç...</option>
                  {bayiler.map(b=><option key={b.id} value={b.isim}>{b.isim}</option>)}
                </select>
                <div>{urunler.map(u => (<div key={u.id} className="fis-item"><span style={{flex:1, fontSize:'12px', fontWeight:'bold'}}>{u.isim}</span><input type="number" placeholder="Adet" value={fisDetay[u.id]?.adet} onChange={e=>setFisDetay({...fisDetay, [u.id]:{...fisDetay[u.id], adet:e.target.value}})} className="m-inp-small" /><input type="number" placeholder="Fiyat" value={fisDetay[u.id]?.fiyat} onChange={e=>setFisDetay({...fisDetay, [u.id]:{...fisDetay[u.id], fiyat:e.target.value}})} className="m-inp-small" /></div>))}</div>
                <div className="borc-container"><div>Toplam: <b>{fSayi(canliTutar)} ₺</b></div><div style={{color:'red', fontWeight:'bold', marginTop:'5px'}}>GENEL TOPLAM BORÇ: <b>{fSayi(toplamGenelBorc)} ₺</b></div></div>
             </div>
             <div className="modal-footer"><button onClick={fisKaydet} className="p-btn green-btn" style={{width:'100%'}}>KAYDET</button></div>
          </div>
        </div>
      )}
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #f8fafc; font-family: sans-serif; overflow-x: hidden; }
        .app-container { max-width: 600px; margin: 0 auto; min-height: 100vh; position: relative; }
        .header-style { display: flex; justify-content: space-between; padding: 12px; background: #fff; border-bottom: 1px solid #ddd; }
        .table-wrapper { width: 100%; overflow-x: auto; background: #fff; }
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl th { background: #f1f5f9; padding: 4px; font-size: 11px; border-bottom: 1px solid #ddd; }
        .tbl td { padding: 4px; border-bottom: 1px solid #eee; font-size: 12px; }
        .compact-totals { display: flex; width: 100%; }
        .c-kutu { flex: 1; background: #fff; padding: 10px; border-left: 4px solid #2563eb; border-bottom: 1px solid #eee; }
        .c-kutu span { font-size: 9px; display: block; color: #666; font-weight: bold; }
        .c-kutu b { font-size: 14px; }
        .fixed-nav { position: fixed; bottom: 0; width: 100%; max-width: 600px; height: 65px; background: #fff; display: flex; border-top: 1px solid #ddd; z-index: 100; }
        .fixed-nav button { flex: 1; border: none; background: none; font-size: 11px; font-weight: bold; color: #94a3b8; }
        .fixed-nav button.active { color: #2563eb; border-top: 3px solid #2563eb; }
        .p-btn { padding: 12px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-weight: bold; cursor: pointer; }
        .green-btn { background: #059669; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: #fff; width: 95%; border-radius: 12px; overflow: hidden; max-height: 90vh; display: flex; flex-direction: column; }
        .modal-header { padding: 15px; display: flex; justify-content: space-between; border-bottom: 1px solid #eee; }
        .modal-body { padding: 15px; overflow-y: auto; flex: 1; }
        .modal-footer { padding: 15px; border-top: 1px solid #eee; }
        .date-icon-only { width: 14px; height: 14px; border: none; background: transparent; cursor: pointer; position: relative; color: transparent; }
        .date-icon-only::-webkit-calendar-picker-indicator { position: absolute; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; cursor: pointer; filter: invert(0); opacity: 0.9; }
        .white-icon::-webkit-calendar-picker-indicator { filter: invert(1); }
        .login-box { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; }
        .login-box form { background: #fff; padding: 30px; border-radius: 12px; width: 320px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .m-inp { width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 6px; }
        .m-inp-small { width: 60px; padding: 6px; border: 1px solid #ddd; margin-left: 4px; text-align: right; }
        .fis-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; align-items: center; }
        .borc-container { margin-top: 15px; background: #fef2f2; padding: 10px; border-radius: 6px; border: 1px solid #fecaca; }
        .filter-card { background: #fff; width: 280px; padding: 20px; border-radius: 12px; }
        .filter-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      `}</style>
    </div>
  );
}
