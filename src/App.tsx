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
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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
  const [sutSort, setSutSort] = useState<any>({ key: 'tarih', direction: 'asc' });

  // --- SATIŞ STATE'LERİ ---
  const [isFisModalOpen, setIsFisModalOpen] = useState<boolean>(false);
  const [isTahsilatModalOpen, setIsTahsilatModalOpen] = useState<boolean>(false);
  const [tahsilatForm, setTahsilatForm] = useState({ tarih: bugun, bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
  
  const [editingFisId, setEditingFisId] = useState<string | null>(null);
  const [editingFisNo, setEditingFisNo] = useState<string | null>(null);
  const [fisUst, setFisUst] = useState({ tarih: bugun, bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "", bos_kova: "", teslim_alan: "" });
  const [fisDetay, setFisDetay] = useState<Record<string, { adet: string, kg: string, fiyat: string }>>({});
  const [gosterilenEkler, setGosterilenEkler] = useState({ tereyagi: false, yogurt_kaymagi: false, iade: false, bos_kova: false });
  const [sonFisData, setSonFisData] = useState<any>(null);

  const [fisFiltre, setFisFiltre] = useState<{ bayiler: string[], baslangic: string, bitis: string }>({ bayiler: [], baslangic: "", bitis: "" });
  const [fisSort, setFisSort] = useState<any>({ key: 'tarih', direction: 'asc' });

  // --- ANALİZ STATE'LERİ ---
  const [analizFiltre, setAnalizFiltre] = useState<{bayiler: string[], urunler: string[], baslangic: string, bitis: string}>({ bayiler: [], urunler: [], baslangic: "", bitis: "" });
  const [analizSort, setAnalizSort] = useState<any>({ key: 'tarih', direction: 'asc' });

  const [activeFilterModal, setActiveFilterModal] = useState<'sut_ciftlik' | 'fis_bayi' | 'analiz_bayi' | 'analiz_urun' | 'sut_tarih' | 'fis_tarih' | 'analiz_tarih' | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUsername(savedUser);

    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');

    if (!document.getElementById("html2canvas-script")) {
      const script = document.createElement("script");
      script.id = "html2canvas-script";
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
    }

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
            u.forEach(urun => { if (!yeniDetay[urun.id]) yeniDetay[urun.id] = { adet: "", kg: "", fiyat: urun.fiyat || "" }; });
            if (!yeniDetay["v_iade"]) yeniDetay["v_iade"] = { adet: "", kg: "", fiyat: "" };
            if (!yeniDetay["v_bos_kova"]) yeniDetay["v_bos_kova"] = { adet: "", kg: "", fiyat: "" };
            return yeniDetay;
          });
        }
      }

      if (hedef === "hepsi" || hedef === "satis") {
        const [{ data: f }, { data: st }] = await Promise.all([
          supabase.from("satis_fisleri").select("*").order("tarih", { ascending: true }).order("id", { ascending: true }),
          supabase.from("satis_giris").select("*").order("tarih", { ascending: true }).order("id", { ascending: true })
        ]);
        if (f) setSatisFisList(f);
        if (st) setSatisList(st);
      }

      if (hedef === "hepsi" || hedef === "sut") {
        const { data: s } = await supabase.from("sut_giris").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (s) setSutList(s);
      }
    } catch (error) { console.error(error); }
  }

  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(num) || 0).replace(/,00$/, '');
  const fSayiNoDec = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(num) || 0);

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
      const numA = Number(valA), numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
        if (numA < numB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (numA > numB) return sortConfig.direction === 'asc' ? 1 : -1;
      } else {
        let strA = String(valA || ''), strB = String(valB || '');
        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return sortConfig.direction === 'asc' ? String(a.id).localeCompare(String(b.id)) : String(b.id).localeCompare(String(a.id));
    });
  };

  const handleCheckboxToggle = (listName: 'ciftlikler' | 'bayiler' | 'urunler', setStateFn: any, val: string) => {
    setStateFn((prev: any) => {
      const arr = prev[listName];
      if (arr.includes(val)) return { ...prev, [listName]: arr.filter((x: string) => x !== val) };
      return { ...prev, [listName]: [...arr, val] };
    });
  };

  const Th = ({ label, sortKey, currentSort, setSort, align="left", filterType = null, isAnaliz = false }: any) => (
    <th style={{ textAlign: align }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSort({ key: sortKey, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' })}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{label}</span>
            {filterType && (
              <span onClick={(e) => { e.stopPropagation(); setActiveFilterModal(filterType); }} style={{ fontSize: '10px', padding: '2px', background: isAnaliz ? '#7c3aed' : '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                🔽
              </span>
            )}
          </div>
          <span style={{fontSize:'9px', color: isAnaliz ? '#d8b4fe' : '#94a3b8', paddingLeft: '2px', textAlign: 'right'}}>
            {currentSort.key === sortKey ? (currentSort.direction === 'asc' ? '▲' : '▼') : ''}
          </span>
        </div>
      </div>
    </th>
  );

  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg || !sutForm.fiyat) return alert("Çiftlik, KG ve Fiyat alanları zorunludur!");
    const p = { ...sutForm, kg: Number(sutForm.kg), fiyat: Number(sutForm.fiyat), toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat) };
    const { error } = editingSutId ? await supabase.from("sut_giris").update(p).eq("id", editingSutId) : await supabase.from("sut_giris").insert(p);
    if (error) return alert("Hata: " + error.message);
    setSutForm({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" }); 
    setEditingSutId(null); setIsSutModalOpen(false); verileriGetir("sut"); 
  }

  async function handleTahsilatKaydet() {
    if (!tahsilatForm.bayi || !tahsilatForm.miktar) return alert("Bayi ve miktar alanları zorunludur!");
    if (!bayiler.some(b => b.isim === tahsilatForm.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Müşteri seçin! Kendiniz rastgele isim giremezsiniz.");

    const tMiktar = Number(tahsilatForm.miktar);
    if (tMiktar <= 0) return alert("Geçerli bir tahsilat tutarı girin.");

    const fNo = `T-${Date.now().toString().slice(-6)}`;
    const fData = {
        fis_no: fNo,
        tarih: tahsilatForm.tarih,
        bayi: tahsilatForm.bayi,
        toplam_tutar: 0,
        tahsilat: tMiktar,
        kalan_bakiye: -tMiktar,
        odeme_turu: tahsilatForm.odeme_turu,
        aciklama: tahsilatForm.aciklama ? `[Sadece Tahsilat] - ${tahsilatForm.aciklama}` : `[Sadece Tahsilat]`
    };

    const { error } = await supabase.from("satis_fisleri").insert(fData);
    if (error) return alert("Hata: " + error.message);

    setTahsilatForm({ tarih: bugun, bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
    setIsTahsilatModalOpen(false);
    verileriGetir("satis");
  }

  const handleBayiSecimi = (secilenBayi: string) => {
    if (!secilenBayi) return;
    const yeniDetay = { ...fisDetay };
    
    urunler.forEach(u => {
      const bayiSatislari = satisList.filter(s => s.bayi === secilenBayi && s.urun === u.isim);
      let hafizaFiyat = u.fiyat || "";
      if (bayiSatislari.length > 0) {
        const sonSatis = bayiSatislari.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        hafizaFiyat = sonSatis.fiyat;
      }
      if (!editingFisId) yeniDetay[u.id] = { adet: fisDetay[u.id]?.adet || "", kg: fisDetay[u.id]?.kg || "", fiyat: String(hafizaFiyat) };
    });

    const bayiIadeler = satisList.filter(s => s.bayi === secilenBayi && s.urun === "İade");
    let hafizaIadeFiyat = "15";
    if (bayiIadeler.length > 0) {
        const sonIade = bayiIadeler.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        hafizaIadeFiyat = String(Math.abs(Number(sonIade.fiyat)));
    }
    
    const bayiKovalar = satisList.filter(s => s.bayi === secilenBayi && s.urun === "Boş Kova");
    let hafizaKovaFiyat = "15";
    if (bayiKovalar.length > 0) {
        const sonKova = bayiKovalar.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        hafizaKovaFiyat = String(Math.abs(Number(sonKova.fiyat)));
    }

    if (!editingFisId) {
        yeniDetay["v_iade"] = { adet: fisDetay["v_iade"]?.adet || "", kg: "", fiyat: hafizaIadeFiyat };
        yeniDetay["v_bos_kova"] = { adet: fisDetay["v_bos_kova"]?.adet || "", kg: "", fiyat: hafizaKovaFiyat };
    }

    setFisDetay(yeniDetay);
  };

  const aktifBayi = fisUst.bayi;
  const eskiBorc = useMemo(() => {
      if (!aktifBayi) return 0;
      const bayiFisleri = satisFisList.filter(f => f.bayi === aktifBayi && f.id !== editingFisId);
      return bayiFisleri.reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
  }, [aktifBayi, satisFisList, editingFisId]);

  const fisCanliToplam = useMemo(() => {
    let urunToplami = urunler.reduce((toplam, u) => {
      const adet = Number(fisDetay[u.id]?.adet) || 0;
      const kg = Number(fisDetay[u.id]?.kg) || 0;
      const fiyat = Number(fisDetay[u.id]?.fiyat) || 0;
      const miktar = kg > 0 ? kg : adet; 
      return toplam + (miktar * fiyat);
    }, 0);
    
    const iAdet = Number(fisDetay["v_iade"]?.adet) || 0;
    const iKg = Number(fisDetay["v_iade"]?.kg) || 0;
    const iFiyat = Number(fisDetay["v_iade"]?.fiyat) || 0;
    const iMiktar = iKg > 0 ? iKg : iAdet;

    const kAdet = Number(fisDetay["v_bos_kova"]?.adet) || 0;
    const kKg = Number(fisDetay["v_bos_kova"]?.kg) || 0;
    const kFiyat = Number(fisDetay["v_bos_kova"]?.fiyat) || 0;
    const kMiktar = kKg > 0 ? kKg : kAdet;

    return urunToplami - (iMiktar * iFiyat) - (kMiktar * kFiyat);
  }, [urunler, fisDetay]);

  const toplamGenelBorc = eskiBorc + (fisCanliToplam - Number(fisUst.tahsilat || 0));

  async function handleTopluFisKaydet() {
    if (!fisUst.bayi) return alert("Lütfen bir Bayi/Market seçin!");
    if (!bayiler.some(b => b.isim === fisUst.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Market seçin! Kendiniz rastgele isim giremezsiniz.");

    const eklenecekUrunler = urunler.filter(u => Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);
    
    const iadeAdet = Number(fisDetay["v_iade"]?.adet) || 0;
    const iadeKg = Number(fisDetay["v_iade"]?.kg) || 0;
    const iadeFiyat = Number(fisDetay["v_iade"]?.fiyat) || 0;
    const iadeMiktar = iadeKg > 0 ? iadeKg : iadeAdet;

    const kovaAdet = Number(fisDetay["v_bos_kova"]?.adet) || 0;
    const kovaKg = Number(fisDetay["v_bos_kova"]?.kg) || 0;
    const kovaFiyat = Number(fisDetay["v_bos_kova"]?.fiyat) || 0;
    const kovaMiktar = kovaKg > 0 ? kovaKg : kovaAdet;

    if (eklenecekUrunler.length === 0 && iadeMiktar === 0 && kovaMiktar === 0) return alert("Fişte işlem yok! Ürün, iade veya kova girin.");

    const ortakFisNo = editingFisNo || `F-${Date.now().toString().slice(-6)}`;
    const tahsilat = Number(fisUst.tahsilat) || 0;
    const kalanBakiye = fisCanliToplam - tahsilat;
    
    const genelNot = [
        fisUst.teslim_alan ? `[Teslim Alan: ${fisUst.teslim_alan}]` : '',
        `[Ödeme: ${fisUst.odeme_turu}]`, 
        fisUst.aciklama
    ].filter(Boolean).join(" - ");

    const fisMaster = { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, toplam_tutar: fisCanliToplam, tahsilat: tahsilat, kalan_bakiye: kalanBakiye, odeme_turu: fisUst.odeme_turu, aciklama: genelNot };

    let savedFisId = editingFisId;

    if (editingFisId) {
      const eskiDetaylar = satisList.filter(s => s.fis_no === ortakFisNo);
      const { error: errFisUpd } = await supabase.from("satis_fisleri").update(fisMaster).eq("id", editingFisId);
      if (errFisUpd) return alert("Güncelleme Hatası: " + errFisUpd.message);
      
      await supabase.from("satis_giris").delete().eq("fis_no", ortakFisNo);

      const insertArray = eklenecekUrunler.map((u) => {
        const adet = Number(fisDetay[u.id].adet), kg = Number(fisDetay[u.id].kg), fiyat = Number(fisDetay[u.id].fiyat);
        const miktar = kg > 0 ? kg : adet;
        const kgEslesme = u.isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
        const hesaplananKg = kg > 0 ? kg : (kgEslesme ? Number(kgEslesme[1]) * adet : adet);

        return { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: adet, fiyat: fiyat, birim: kgEslesme ? Number(kgEslesme[1]) : 1, toplam_kg: hesaplananKg, tutar: miktar * fiyat, bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}` };
      });

      if (iadeMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "İade", adet: iadeAdet, fiyat: -iadeFiyat, birim: 1, toplam_kg: iadeKg, tutar: -(iadeMiktar * iadeFiyat), bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}` });
      }

      if (kovaMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "Boş Kova", adet: kovaAdet, fiyat: -kovaFiyat, birim: 1, toplam_kg: kovaKg, tutar: -(kovaMiktar * kovaFiyat), bos_kova: kovaAdet, aciklama: `Bağlı Fiş: ${ortakFisNo}` });
      }

      const { error: errDetay } = await supabase.from("satis_giris").insert(insertArray);
      if (errDetay) {
        alert("Hata oluştu! Eski verileriniz geri yükleniyor...");
        const kurtarilacakVeriler = eskiDetaylar.map(eski => { const { id, ...gerisi } = eski; return gerisi; });
        await supabase.from("satis_giris").insert(kurtarilacakVeriler);
        verileriGetir("satis"); return; 
      }
    } else {
      const { data: newFisData, error: errFisIns } = await supabase.from("satis_fisleri").insert(fisMaster).select().single();
      if (errFisIns) return alert("Kayıt Hatası: " + errFisIns.message);
      savedFisId = newFisData?.id;
      
      const insertArray = eklenecekUrunler.map((u) => {
        const adet = Number(fisDetay[u.id].adet), kg = Number(fisDetay[u.id].kg), fiyat = Number(fisDetay[u.id].fiyat);
        const miktar = kg > 0 ? kg : adet;
        const kgEslesme = u.isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
        const hesaplananKg = kg > 0 ? kg : (kgEslesme ? Number(kgEslesme[1]) * adet : adet);

        return { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: adet, fiyat: fiyat, birim: kgEslesme ? Number(kgEslesme[1]) : 1, toplam_kg: hesaplananKg, tutar: miktar * fiyat, bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}` };
      });

      if (iadeMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "İade", adet: iadeAdet, fiyat: -iadeFiyat, birim: 1, toplam_kg: iadeKg, tutar: -(iadeMiktar * iadeFiyat), bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}` });
      }

      if (kovaMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "Boş Kova", adet: kovaAdet, fiyat: -kovaFiyat, birim: 1, toplam_kg: kovaKg, tutar: -(kovaMiktar * kovaFiyat), bos_kova: kovaAdet, aciklama: `Bağlı Fiş: ${ortakFisNo}` });
      }

      await supabase.from("satis_giris").insert(insertArray);
    }
    
    const ekstraIndirimler = [];
    if (iadeMiktar > 0) ekstraIndirimler.push({ isim: "İade", miktar: iadeMiktar, birim: iadeKg > 0 ? "KG" : "Ad", tutar: iadeMiktar * iadeFiyat });
    if (kovaMiktar > 0) ekstraIndirimler.push({ isim: "Boş Kova", miktar: kovaMiktar, birim: kovaKg > 0 ? "KG" : "Ad", tutar: kovaMiktar * kovaFiyat });

    const fisGosterimData = {
      id: savedFisId,
      fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, aciklama: fisUst.aciklama, teslim_alan: fisUst.teslim_alan,
      urunler: eklenecekUrunler.map(u => {
         const adet = Number(fisDetay[u.id].adet);
         const kg = Number(fisDetay[u.id].kg);
         const fiyat = Number(fisDetay[u.id].fiyat);
         return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: (kg > 0 ? kg : adet) * fiyat };
      }),
      ekstraIndirimler,
      genelToplam: fisCanliToplam, tahsilat: tahsilat, kalanBakiye: (fisCanliToplam - tahsilat), odeme: fisUst.odeme_turu,
      eskiBorc: eskiBorc, genelBorc: toplamGenelBorc,
      gosterBakiye: false
    };
    
    resetFisForm(); setIsFisModalOpen(false); verileriGetir("satis"); setSonFisData(fisGosterimData);
  }

  const resetFisForm = () => {
    setEditingFisId(null); setEditingFisNo(null);
    setFisUst({ tarih: bugun, bayi: "", aciklama: "", odeme_turu: "PEŞİN", tahsilat: "", bos_kova: "", teslim_alan: "" });
    setGosterilenEkler({ tereyagi: false, yogurt_kaymagi: false, iade: false, bos_kova: false });
    const temizDetay: any = {};
    urunler.forEach(u => temizDetay[u.id] = { adet: "", kg: "", fiyat: u.fiyat || "" });
    temizDetay["v_iade"] = { adet: "", kg: "", fiyat: "" };
    temizDetay["v_bos_kova"] = { adet: "", kg: "", fiyat: "" };
    setFisDetay(temizDetay);
  };

  const handleYeniFisAc = () => { resetFisForm(); setIsFisModalOpen(true); };

  const handleFisDuzenle = (fis: any) => {
    setEditingFisId(fis.id); setEditingFisNo(fis.fis_no);
    let safAciklama = fis.aciklama || "";
    let tAlan = "";

    const tMatch = safAciklama.match(/\[Teslim Alan: (.*?)\]/);
    if (tMatch) {
       tAlan = tMatch[1];
       safAciklama = safAciklama.replace(/\[Teslim Alan: .*?\]\s*-\s*/, "");
       safAciklama = safAciklama.replace(/\[Teslim Alan: .*?\]/, "");
    }

    if (safAciklama.includes("[Ödeme: ")) {
       safAciklama = safAciklama.replace(/\[Ödeme: .*?\]\s*-\s*/, "");
       safAciklama = safAciklama.replace(/\[Ödeme: .*?\]/, "");
    }
    
    if (safAciklama.includes("[Sadece Tahsilat]")) {
       safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]\s*-\s*/, "");
       safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]/, "");
    }

    const iadeUrun = satisList.find(s => s.fis_no === fis.fis_no && s.urun === "İade");
    const kovaUrun = satisList.find(s => s.fis_no === fis.fis_no && (s.urun === "İade Kova" || s.urun === "Boş Kova"));
    
    let iadeAdetStr = iadeUrun?.adet ? String(iadeUrun.adet) : "";
    let iadeKgStr = iadeUrun?.toplam_kg && Number(iadeUrun.toplam_kg) > 0 ? String(iadeUrun.toplam_kg) : "";
    let iadeFiyatStr = iadeUrun ? String(Math.abs(Number(iadeUrun.fiyat))) : "";

    let kovaAdetStr = kovaUrun?.adet ? String(kovaUrun.adet) : "";
    let kovaKgStr = kovaUrun?.toplam_kg && Number(kovaUrun.toplam_kg) > 0 ? String(kovaUrun.toplam_kg) : "";
    let kovaFiyatStr = kovaUrun ? String(Math.abs(Number(kovaUrun.fiyat))) : "";

    setFisUst({ tarih: fis.tarih, bayi: fis.bayi, aciklama: safAciklama, odeme_turu: fis.odeme_turu || "PEŞİN", tahsilat: fis.tahsilat > 0 ? String(fis.tahsilat) : "", bos_kova: "", teslim_alan: tAlan });
    
    const ilgiliUrunler = satisList.filter(s => s.fis_no === fis.fis_no);
    const dolanDetay: any = {};
    urunler.forEach(u => {
      const buUrun = ilgiliUrunler.find(s => s.urun === u.isim);
      let calculatedKg = "";
      if (buUrun) {
          const adetNum = Number(buUrun.adet);
          const tutarNum = Number(buUrun.tutar);
          const fiyatNum = Number(buUrun.fiyat);
          if (fiyatNum !== 0 && Math.abs(tutarNum - (adetNum * fiyatNum)) > 0.01) {
              calculatedKg = String(tutarNum / fiyatNum);
          }
      }
      dolanDetay[u.id] = { adet: buUrun ? String(buUrun.adet) : "", kg: calculatedKg, fiyat: buUrun ? String(buUrun.fiyat) : String(u.fiyat || "") };
    });
    
    dolanDetay["v_iade"] = { adet: iadeAdetStr, kg: iadeKgStr, fiyat: iadeFiyatStr };
    dolanDetay["v_bos_kova"] = { adet: kovaAdetStr, kg: kovaKgStr, fiyat: kovaFiyatStr };
    setFisDetay(dolanDetay); setIsFisModalOpen(true);
  };

  const handleFisDetayGoster = (fis: SatisFis) => {
    const ilgiliUrunler = satisList.filter(s => s.fis_no === fis.fis_no && s.urun !== "İade Kova" && s.urun !== "Boş Kova" && s.urun !== "İade");
    const iadeUrun = satisList.find(s => s.fis_no === fis.fis_no && s.urun === "İade");
    const kovaUrun = satisList.find(s => s.fis_no === fis.fis_no && (s.urun === "İade Kova" || s.urun === "Boş Kova"));
    
    const bayiFisleri = satisFisList.filter(f => f.bayi === fis.bayi && f.tarih <= fis.tarih && f.id !== fis.id);
    const oGunkuEskiBorc = bayiFisleri.reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
    
    let ekstraIndirimler = [];
    if (iadeUrun) ekstraIndirimler.push({ isim: "İade", miktar: iadeUrun.toplam_kg && Number(iadeUrun.toplam_kg) > 0 ? iadeUrun.toplam_kg : iadeUrun.adet, birim: iadeUrun.toplam_kg && Number(iadeUrun.toplam_kg) > 0 ? "KG" : "Ad", tutar: Math.abs(Number(iadeUrun.tutar)) });
    if (kovaUrun) ekstraIndirimler.push({ isim: kovaUrun.urun === "İade Kova" ? "İade Kova" : "Boş Kova", miktar: kovaUrun.toplam_kg && Number(kovaUrun.toplam_kg) > 0 ? kovaUrun.toplam_kg : kovaUrun.adet, birim: kovaUrun.toplam_kg && Number(kovaUrun.toplam_kg) > 0 ? "KG" : "Ad", tutar: Math.abs(Number(kovaUrun.tutar)) });

    let safAciklama = fis.aciklama || "";
    let tAlan = "";
    const tMatch = safAciklama.match(/\[Teslim Alan: (.*?)\]/);
    if (tMatch) {
       tAlan = tMatch[1];
       safAciklama = safAciklama.replace(/\[Teslim Alan: .*?\]\s*-\s*/, "").replace(/\[Teslim Alan: .*?\]/, "");
    }
    if (safAciklama.includes("[Ödeme: ")) safAciklama = safAciklama.replace(/\[Ödeme: .*?\]\s*-\s*/, "").replace(/\[Ödeme: .*?\]/, "");
    if (safAciklama.includes("[Sadece Tahsilat]")) safAciklama = safAciklama.replace(/\[Sadece Tahsilat\]\s*-\s*/, "").replace(/\[Sadece Tahsilat\]/, "");

    setSonFisData({ 
      id: fis.id,
      fis_no: fis.fis_no, tarih: fis.tarih, bayi: fis.bayi, aciklama: safAciklama, teslim_alan: tAlan,
      urunler: ilgiliUrunler.map(u => {
          let calculatedKg = 0;
          const a = Number(u.adet), t = Number(u.tutar), f = Number(u.fiyat);
          if (f !== 0 && Math.abs(t - (a * f)) > 0.01) calculatedKg = t / f;
          return { isim: u.urun, adet: a, kg: calculatedKg, fiyat: f, tutar: t };
      }), 
      ekstraIndirimler,
      genelToplam: fis.toplam_tutar, tahsilat: fis.tahsilat, kalanBakiye: fis.kalan_bakiye, odeme: fis.odeme_turu || "Bilinmiyor",
      eskiBorc: oGunkuEskiBorc, genelBorc: oGunkuEskiBorc + fis.kalan_bakiye,
      gosterBakiye: false 
    });
  };

  async function handleFisSil(fis: any) {
    if (!confirm(`Tüm fişi (${fis.fis_no}) silmek istediğinize emin misiniz?`)) return;
    await supabase.from("satis_giris").delete().eq("fis_no", fis.fis_no);
    await supabase.from("satis_fisleri").delete().eq("id", fis.id);
    verileriGetir("satis"); 
  }

  const handleWhatsappResimGonder = () => {
    const fisElement = document.getElementById("print-receipt");
    if (!fisElement) return;
    if (typeof (window as any).html2canvas !== "undefined") {
      (window as any).html2canvas(fisElement, { scale: 3, backgroundColor: "#ffffff" }).then((canvas: any) => {
        canvas.toBlob((blob: Blob | null) => {
          if (!blob) return;
          const file = new File([blob], `Sultankoy_Fis_${sonFisData?.fis_no || Date.now()}.jpg`, { type: "image/jpeg" });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              navigator.share({ title: 'Sultanköy Fiş Özeti', files: [file] }).catch(() => {});
          } else { 
              const link = document.createElement("a"); link.download = file.name; link.href = canvas.toDataURL("image/jpeg", 0.9); link.click(); 
          }
        }, "image/jpeg", 0.9);
      });
    } else alert("Resim oluşturucu yükleniyor, 1 saniye sonra tekrar deneyin.");
  };

  let fFisList = sortData(satisFisList.filter((f: any) => 
    (fisFiltre.bayiler.length === 0 || fisFiltre.bayiler.includes(f.bayi)) && 
    (!fisFiltre.baslangic || f.tarih >= fisFiltre.baslangic) && (!fisFiltre.bitis || f.tarih <= fisFiltre.bitis)
  ), fisSort);
  const tFisToplam = fFisList.reduce((a: number, b: any) => a + Number(b.toplam_tutar), 0);
  const tFisTahsilat = fFisList.reduce((a: number, b: any) => a + Number(b.tahsilat), 0);
  const tFisKalan = fFisList.reduce((a: number, b: any) => a + Number(b.kalan_bakiye), 0);

  let fSutList = sortData(sutList.filter((s: any) => 
    (sutFiltre.ciftlikler.length === 0 || sutFiltre.ciftlikler.includes(s.ciftlik)) && 
    (!sutFiltre.baslangic || s.tarih >= sutFiltre.baslangic) && (!sutFiltre.bitis || s.tarih <= sutFiltre.bitis)
  ), sutSort);
  const tSutKg = fSutList.reduce((a: number, b: any) => a + Number(b.kg), 0);
  const tSutTl = fSutList.reduce((a: number, b: any) => a + Number(b.toplam_tl), 0);

  let fAnalizList = sortData(satisList.filter((s: any) => 
    (analizFiltre.bayiler.length === 0 || analizFiltre.bayiler.includes(s.bayi)) && 
    (analizFiltre.urunler.length === 0 || analizFiltre.urunler.includes(s.urun)) && 
    (!analizFiltre.baslangic || s.tarih >= analizFiltre.baslangic) && (!analizFiltre.bitis || s.tarih <= analizFiltre.bitis)
  ), analizSort);
  const tAnalizKg = fAnalizList.reduce((a: number, b: any) => a + Number(b.toplam_kg), 0);
  const tAnalizTutar = fAnalizList.reduce((a: number, b: any) => a + Number(b.tutar), 0);

  const renderOzet = () => (
    <div className="tab-fade-in main-content-area">
      <div className="cards-grid">
        <div className="card summary-c" style={{ borderLeft: `5px solid ${temaRengi}` }}><small>Süt Alımı</small><h2 style={{ margin: "5px 0", color: temaRengi }}>{fSayiNoDec(sutList.reduce((a, b) => a + Number(b.kg), 0))} KG</h2></div>
        <div className="card summary-c" style={{ borderLeft: "5px solid #059669" }}><small>Toplam Satış</small><h2 style={{ margin: "5px 0", color: "#059669" }}>{fSayiNoDec(satisFisList.reduce((a, b) => a + Number(b.toplam_tutar), 0))} ₺</h2></div>
      </div>
      <div className="card" style={{marginTop: "5px"}}>
        <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Son Kesilen Fişler</h4>
        {satisFisList.slice().reverse().slice(0, 5).map(f => (
          <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{fontSize: "12px"}}>{f.tarih.split("-").reverse().join(".")} <b className="truncate-text" style={{display:"inline-block", verticalAlign:"bottom"}}>{f.bayi}</b></span>
            <b style={{color: '#059669'}}>{fSayi(f.toplam_tutar)} ₺</b>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSut = () => (
    <div className="tab-fade-in main-content-area">
      <button onClick={() => { setSutForm({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" }); setEditingSutId(null); setIsSutModalOpen(true); }} className="btn-anim m-btn blue-btn">➕ YENİ SÜT GİRİŞİ</button>
      <div className="compact-totals">
        <div className="c-kutu" style={{ borderLeftColor: temaRengi }}><span>SÜT</span><b style={{ color: temaRengi }}>{fSayi(tSutKg)} KG</b></div>
        <div className="c-kutu" style={{ borderLeftColor: temaRengi }}><span>T. TUTAR</span><b style={{ color: temaRengi }}>{fSayiNoDec(tSutTl)} ₺</b></div>
      </div>
      <div className="table-wrapper"><table className="tbl">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={sutSort} setSort={setSutSort} filterType="sut_tarih" />
          <Th label="ÇİFTLİK" sortKey="ciftlik" currentSort={sutSort} setSort={setSutSort} filterType="sut_ciftlik" />
          <Th label="KG" sortKey="kg" currentSort={sutSort} setSort={setSutSort} align="right" />
          <Th label="FİYAT" sortKey="fiyat" currentSort={sutSort} setSort={setSutSort} align="right" />
          <Th label="TUTAR" sortKey="toplam_tl" currentSort={sutSort} setSort={setSutSort} align="right" />
          <th></th>
        </tr></thead>
        <tbody>{fSutList.map(s => (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }} className="truncate-text-td">{s.ciftlik}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.kg)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.fiyat)}</td>
            <td style={{ textAlign: "right", color: temaRengi, fontWeight: "bold" }}>{fSayiNoDec(s.toplam_tl)}</td>
            <td className="actions-cell"><div className="action-buttons">{renderNot(s.aciklama)}<button onClick={() => { setEditingSutId(s.id); setSutForm(s as any); setIsSutModalOpen(true); }} className="ed-btn">✏️</button><button onClick={async () => { if(confirm("Sil?")){ await supabase.from("sut_giris").delete().eq("id", s.id); verileriGetir("sut"); } }} className="dl-btn">✕</button></div></td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderSatis = () => (
    <div className="tab-fade-in main-content-area">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
         <button onClick={handleYeniFisAc} className="btn-anim m-btn green-btn" style={{ margin: 0, flex: 2, fontSize: '13px' }}>➕ YENİ SATIŞ FİŞİ</button>
         <button onClick={() => { setTahsilatForm({ tarih: bugun, bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" }); setIsTahsilatModalOpen(true); }} className="btn-anim m-btn blue-btn" style={{ margin: 0, flex: 1.2, fontSize: '13px', background: '#3b82f6' }}>💸 TAHSİLAT</button>
      </div>
      <div className="compact-totals">
        <div className="c-kutu" style={{ borderLeftColor: "#059669" }}><span>TOPLAM</span><b style={{ color: "#059669" }}>{fSayi(tFisToplam)} ₺</b></div>
        <div className="c-kutu" style={{ borderLeftColor: "#2563eb" }}><span>TAHSİLAT</span><b style={{ color: "#2563eb" }}>{fSayi(tFisTahsilat)} ₺</b></div>
        <div className="c-kutu" style={{ borderLeftColor: "#dc2626" }}><span>AÇIK HESAP</span><b style={{ color: "#dc2626" }}>{fSayi(tFisKalan)} ₺</b></div>
      </div>
      <div className="table-wrapper"><table className="tbl tbl-satis">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={fisSort} setSort={setFisSort} filterType="fis_tarih" />
          <Th label="BAYİ" sortKey="bayi" currentSort={fisSort} setSort={setFisSort} filterType="fis_bayi" />
          <Th label="TUTAR" sortKey="toplam_tutar" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="TAHS." sortKey="tahsilat" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="KALAN" sortKey="kalan_bakiye" currentSort={fisSort} setSort={setFisSort} align="right" />
          <th></th>
        </tr></thead>
        <tbody>{fFisList.map(f => (
          <tr key={f.id}>
            <td>{f.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold", color: f.toplam_tutar === 0 ? "#8b5cf6" : "inherit" }} className="truncate-text-td">{f.bayi}</td>
            <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{f.toplam_tutar === 0 ? "-" : fSayi(f.toplam_tutar)}</td>
            <td style={{ textAlign: "right", color: "#2563eb", fontWeight: "bold" }}>{fSayi(f.tahsilat)}</td>
            <td style={{ textAlign: "right", color: f.kalan_bakiye > 0 ? "#dc2626" : (f.kalan_bakiye < 0 ? "#059669" : "#64748b"), fontWeight: "bold" }}>{fSayi(f.kalan_bakiye)}</td>
            <td className="actions-cell"><div className="action-buttons"><button onClick={() => handleFisDetayGoster(f)} className="btn-anim" style={{background: "none", border: "none", padding: "0 2px", cursor: "pointer", fontSize: "16px"}}>🔍</button><button onClick={() => handleFisDuzenle(f)} className="ed-btn">✏️</button><button onClick={() => handleFisSil(f)} className="dl-btn">✕</button></div></td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderAnaliz = () => (
    <div className="tab-fade-in main-content-area">
      <div className="compact-totals" style={{marginTop: "5px"}}>
        <div className="c-kutu" style={{ borderLeftColor: "#8b5cf6" }}><span>TOPLAM ADET/KG</span><b style={{ color: "#8b5cf6" }}>{fSayi(tAnalizKg)}</b></div>
        <div className="c-kutu" style={{ borderLeftColor: "#8b5cf6" }}><span>TOPLAM TUTAR</span><b style={{ color: "#8b5cf6" }}>{fSayi(tAnalizTutar)} ₺</b></div>
      </div>
      <div className="table-wrapper"><table className="tbl tbl-analiz">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_tarih" />
          <Th label="BAYİ" sortKey="bayi" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_bayi" />
          <Th label="ÜRÜN" sortKey="urun" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} filterType="analiz_urun" />
          <Th label="ADET" sortKey="adet" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="KG" sortKey="toplam_kg" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="FİYAT" sortKey="fiyat" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
          <Th label="TUTAR" sortKey="tutar" currentSort={analizSort} setSort={setAnalizSort} isAnaliz={true} align="right" />
        </tr></thead>
        <tbody>{fAnalizList.map(s => (
          <tr key={s.id}>
            <td>{s.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }}>{s.bayi}</td>
            <td>{s.urun}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.adet)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(s.toplam_kg)}</td>
            <td style={{ textAlign: "right" }}>{fSayi(Math.abs(Number(s.fiyat)))}</td>
            <td style={{ textAlign: "right", color: Number(s.fiyat) < 0 ? "#dc2626" : "#8b5cf6", fontWeight: "bold" }}>
              {Number(s.fiyat) < 0 ? "-" : ""}{fSayi(Math.abs(Number(s.tutar)))}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderAyarlar = () => (
    <div className="tab-fade-in main-content-area" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {[{ t: "ciftlikler", title: "🥛 Süt Tedarikçileri", open: acikTedarikci, setOpen: setAcikTedarikci, val: yeniTedarikci, setVal: setYeniTedarikci, data: tedarikciler, btnColor: temaRengi, isUrun: false }, { t: "bayiler", title: "🏢 Satış Bayileri / Müşteriler", open: acikBayi, setOpen: setAcikBayi, val: yeniBayi, setVal: setYeniBayi, data: bayiler, btnColor: "#059669", isUrun: false }, { t: "urunler", title: "📦 Ürün Listesi", open: acikUrun, setOpen: setAcikUrun, val: yeniUrun, setVal: setYeniUrun, data: urunler, btnColor: "#f59e0b", isUrun: true }].map(sec => (
        <div key={sec.t} className="card">
          <div onClick={() => sec.setOpen(!sec.open)} style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
            <h4 style={{ margin: 0 }}>{sec.title}</h4><span style={{ fontSize: "11px", color: "#64748b" }}>{sec.open ? "▲ GİZLE" : "▼ AÇ"}</span>
          </div>
          {sec.open && (
            <div style={{ marginTop: "15px", borderTop: "1px solid #e2e8f0", paddingTop: "15px" }}>
              <div className="responsive-form" style={{marginBottom: "10px"}}>
                <input placeholder="Yeni ekle..." value={sec.val} onChange={e => sec.setVal(e.target.value)} className="m-inp grow-inp" />
                {sec.isUrun && <input placeholder="Fiyat" type="number" value={yeniUrunFiyat} onChange={e => setYeniUrunFiyat(e.target.value)} className="m-inp num-inp" />}
                <button onClick={() => ayarIslem(sec.t, sec.val, "ekle", null, sec.setVal)} className="p-btn btn-anim" style={{ background: sec.btnColor, flex: "0 0 100px" }}>EKLE</button>
              </div>
              <div className="responsive-form" style={{marginTop: "5px"}}>
                <select className="m-inp" value="" onChange={(e) => { const sId = e.target.value; if(!sId) return; const targetItem = sec.data.find(d => String(d.id) === String(sId)); if(confirm(`"${targetItem?.isim}" silinecek?`)) { ayarIslem(sec.t, null, "sil", sId); } }} style={{ width: "100%", cursor: "pointer", backgroundColor: "#f8fafc", color: "#64748b" }}>
                  <option value="">Kayıtlı Listeyi Gör / Silmek İçin Seçin...</option>
                  {sec.data.map(d => <option key={d.id} value={d.id} style={{color: "#1e293b"}}>{d.isim} {sec.isUrun && (d as Urun).fiyat ? `(${fSayi((d as Urun).fiyat)})` : ""}</option>)}
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

  if (!session) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "20px", boxSizing: "border-box" }}>
        <form onSubmit={async (e) => { e.preventDefault(); const target = e.currentTarget as any; if (target.elements.remember.checked) localStorage.setItem('user', username); else localStorage.removeItem('user'); await supabase.auth.signInWithPassword({ email: username.includes("@") ? username : `${username}@sistem.local`, password }); }} style={{ background: "#fff", padding: "30px", borderRadius: "12px", width: "100%", maxWidth: "360px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a", textAlign: "center" }}>Sultanköy v2</h2><p style={{ margin: "0 0 24px", color: "#64748b", textAlign: "center", fontSize:"14px" }}>Yönetim Paneline Giriş Yapın</p>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Kullanıcı Adı" style={{ width: "100%", marginBottom: "16px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifre" style={{ width: "100%", marginBottom: "16px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <label style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b", cursor: "pointer", marginBottom: "20px" }}><input type="checkbox" id="remember" defaultChecked={!!localStorage.getItem('user')} /> Beni Hatırla</label>
          <button type="submit" style={{ width: "100%", padding: "12px", background: temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>Giriş Yap</button>
        </form>
      </div>
    );
  }
  
  return (
    <div className="app-container" style={{ fontSize: `${fontSize}px` }}>
      <header className="header-style">
        <b style={{ color: temaRengi, fontSize: "16px", marginLeft: "10px" }}>SULTANKÖY v2</b>
        <button onClick={() => supabase.auth.signOut()} className="out-btn btn-anim" style={{marginRight: "10px"}}>ÇIKIŞ YAP</button>
      </header>

      <main className="main-content">
        {activeTab === "ozet" && renderOzet()}
        {activeTab === "sut" && renderSut()}
        {activeTab === "satis" && renderSatis()}
        {activeTab === "analiz" && renderAnaliz()}
        {activeTab === "ayarlar" && renderAyarlar()}

        {/* FİLTRE MODALI */}
        {activeFilterModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setActiveFilterModal(null)}>
            <div style={{ backgroundColor: "#fff", padding: "15px", borderRadius: "10px", width: "100%", maxWidth: "260px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
              <h4 style={{marginTop: 0, marginBottom: "10px", borderBottom: "1px solid #eee", paddingBottom: "5px", color: "#1e293b"}}>
                {activeFilterModal.endsWith('_tarih') ? 'Tarih Aralığı Seç' : 'Filtrele'}
              </h4>
              {activeFilterModal.endsWith('_tarih') && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div><label style={{fontSize: "12px", color: "#64748b"}}>Başlangıç</label><input type="date" value={activeFilterModal.includes('sut') ? sutFiltre.baslangic : activeFilterModal.includes('fis') ? fisFiltre.baslangic : analizFiltre.baslangic} onChange={(e) => { if(activeFilterModal.includes('sut')) setSutFiltre({...sutFiltre, baslangic: e.target.value}); if(activeFilterModal.includes('fis')) setFisFiltre({...fisFiltre, baslangic: e.target.value}); if(activeFilterModal.includes('analiz')) setAnalizFiltre({...analizFiltre, baslangic: e.target.value}); }} className="m-inp" style={{width: "100%", marginTop: "4px"}} /></div>
                  <div><label style={{fontSize: "12px", color: "#64748b"}}>Bitiş</label><input type="date" value={activeFilterModal.includes('sut') ? sutFiltre.bitis : activeFilterModal.includes('fis') ? fisFiltre.bitis : analizFiltre.bitis} onChange={(e) => { if(activeFilterModal.includes('sut')) setSutFiltre({...sutFiltre, bitis: e.target.value}); if(activeFilterModal.includes('fis')) setFisFiltre({...fisFiltre, bitis: e.target.value}); if(activeFilterModal.includes('analiz')) setAnalizFiltre({...analizFiltre, bitis: e.target.value}); }} className="m-inp" style={{width: "100%", marginTop: "4px"}} /></div>
                </div>
              )}
              <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
                {activeFilterModal === 'sut_ciftlik' && tedarikciler.map(t => (<label key={t.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={sutFiltre.ciftlikler.includes(t.isim)} onChange={() => handleCheckboxToggle('ciftlikler', setSutFiltre, t.isim)} style={{width:"18px", height:"18px"}}/> {t.isim}</label>))}
                {activeFilterModal.includes('_bayi') && bayiler.map(b => (<label key={b.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={activeFilterModal === 'fis_bayi' ? fisFiltre.bayiler.includes(b.isim) : analizFiltre.bayiler.includes(b.isim)} onChange={() => handleCheckboxToggle('bayiler', activeFilterModal === 'fis_bayi' ? setFisFiltre : setAnalizFiltre, b.isim)} style={{width:"18px", height:"18px"}}/> {b.isim}</label>))}
                {activeFilterModal === 'analiz_urun' && urunler.map(u => (<label key={u.id} style={{display: "flex", alignItems: "center", gap: "8px", fontSize: "14px"}}><input type="checkbox" checked={analizFiltre.urunler.includes(u.isim)} onChange={() => handleCheckboxToggle('urunler', setAnalizFiltre, u.isim)} style={{width:"18px", height:"18px"}}/> {u.isim}</label>))}
              </div>
              <div style={{display: "flex", gap: "8px", marginTop: "15px"}}><button onClick={() => { if(activeFilterModal === 'sut_ciftlik') setSutFiltre({...sutFiltre, ciftlikler: []}); if(activeFilterModal === 'fis_bayi') setFisFiltre({...fisFiltre, bayiler: []}); if(activeFilterModal === 'analiz_bayi') setAnalizFiltre({...analizFiltre, bayiler: []}); if(activeFilterModal === 'analiz_urun') setAnalizFiltre({...analizFiltre, urunler: []}); if(activeFilterModal.includes('_tarih')){ setSutFiltre({...sutFiltre, baslangic: '', bitis: ''}); setFisFiltre({...fisFiltre, baslangic: '', bitis: ''}); setAnalizFiltre({...analizFiltre, baslangic: '', bitis: ''}); } }} style={{flex: 1, padding: "10px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: "6px", fontWeight: "bold"}}>TEMİZLE</button><button onClick={() => setActiveFilterModal(null)} style={{flex: 1, padding: "10px", background: activeFilterModal.includes('analiz') ? '#8b5cf6' : temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold"}}>UYGULA</button></div>
            </div>
          </div>
        )}

        {/* YENİ SATIŞ FİŞİ EKRANI */}
        {isFisModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "8px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "420px", maxHeight: "95vh", borderRadius: "8px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: editingFisId ? "#fef3c7" : "#f8fafc", borderRadius: "8px 8px 0 0" }}>
                <h3 style={{ margin: 0, color: editingFisId ? "#b45309" : "#059669", fontSize: "15px" }}>{editingFisId ? "✏️ Fişi Düzenle" : "🧾 Yeni Satış Fişi"}</h3>
                <button onClick={() => setIsFisModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}>
                <div style={{display: "flex", gap: "6px", marginBottom: "12px"}}>
                  <input type="date" value={fisUst.tarih} onChange={e => setFisUst({ ...fisUst, tarih: e.target.value })} className="m-inp" style={{flex: "0 0 100px", padding: "6px 8px", fontSize: "13px"}} />
                  
                  {/* BAYİ ARAMA KISMI */}
                  <input
                    list="bayiler-list"
                    placeholder="Bayi Seç / Ara..."
                    value={fisUst.bayi}
                    onChange={e => {
                      setFisUst({ ...fisUst, bayi: e.target.value });
                      if (bayiler.find(b => b.isim === e.target.value)) {
                        handleBayiSecimi(e.target.value);
                      }
                    }}
                    className="m-inp grow-inp"
                    style={{fontWeight: "bold", padding: "6px 8px", fontSize: "13px"}}
                  />
                  <datalist id="bayiler-list">
                    {bayiler.map(b => <option key={b.id} value={b.isim}>{b.isim}</option>)}
                  </datalist>

                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  {urunler.map(u => {
                    const isimLower = u.isim.toLowerCase();
                    const isFixed = (isimLower.includes("3 kg") || isimLower.includes("5 kg") || (isimLower.includes("kayma") && !isimLower.includes("yoğurt")));
                    const isTereyagi = isimLower.includes("tereya");
                    const isYogurtKaymagi = isimLower.includes("yoğurt kayma");
                    const isFilled = (Number(fisDetay[u.id]?.adet) > 0 || Number(fisDetay[u.id]?.kg) > 0);

                    if (!isFixed && !isFilled && !(gosterilenEkler.tereyagi && isTereyagi) && !(gosterilenEkler.yogurt_kaymagi && isYogurtKaymagi)) return null;

                    const handleAdetChange = (e: any) => {
                        const val = e.target.value;
                        let newKg = fisDetay[u.id]?.kg || "";
                        const match = u.isim.match(/(\d+)\s*kg/i);
                        if (match && match[1]) {
                            const multiplier = Number(match[1]);
                            if (val !== "") {
                                newKg = String(Number(val) * multiplier);
                            } else {
                                newKg = "";
                            }
                        }
                        setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], adet: val, kg: newKg}});
                    };

                    return (
                      <div key={u.id} style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: isFilled ? (editingFisId ? '#fef3c7' : '#ecfdf5') : '#f8fafc', borderRadius: '4px', border: isFilled ? (editingFisId ? '1px solid #fde68a' : '1px solid #a7f3d0') : '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: isFilled ? (editingFisId ? "#b45309" : "#065f46") : "#475569", whiteSpace: "normal", lineHeight: "1.2" }}>{u.isim}</div>
                        <input placeholder="Adet" type="number" value={fisDetay[u.id]?.adet || ""} onChange={handleAdetChange} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                        <input placeholder="KG" type="number" step="0.01" value={fisDetay[u.id]?.kg || ""} onChange={e => setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                        <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>x</div>
                        <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay[u.id]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, [u.id]: {...fisDetay[u.id], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: isFilled ? "#fff" : "", fontSize: "12px", height:"24px"}} />
                      </div>
                    );
                  })}
                  
                  {/* DİNAMİK BUTONLAR */}
                  <div style={{ display: "flex", gap: "6px", marginBottom: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                      <button onClick={() => setGosterilenEkler(p => ({...p, tereyagi: true}))} className="btn-anim" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", color: "#475569" }}>+ Tereyağı</button>
                      <button onClick={() => setGosterilenEkler(p => ({...p, yogurt_kaymagi: true}))} className="btn-anim" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", color: "#475569" }}>+ Y. Kaymağı</button>
                      <button onClick={() => setGosterilenEkler(p => ({...p, iade: true}))} className="btn-anim" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", color: "#dc2626" }}>+ İade</button>
                      <button onClick={() => setGosterilenEkler(p => ({...p, bos_kova: true}))} className="btn-anim" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", fontWeight: "bold", color: "#dc2626" }}>+ Boş Kova</button>
                  </div>

                  {/* İADE SATIRI */}
                  {(gosterilenEkler.iade || Number(fisDetay["v_iade"]?.adet) > 0 || Number(fisDetay["v_iade"]?.kg) > 0) && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca', marginTop: "4px" }}>
                      <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: "#dc2626", whiteSpace: "normal", lineHeight: "1.2" }}>İade</div>
                      <input placeholder="Adet" type="number" value={fisDetay["v_iade"]?.adet || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], adet: e.target.value}})} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <input placeholder="KG" type="number" step="0.01" value={fisDetay["v_iade"]?.kg || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>x</div>
                      <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay["v_iade"]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, v_iade: {...fisDetay["v_iade"], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                    </div>
                  )}

                  {/* BOŞ KOVA SATIRI */}
                  {(gosterilenEkler.bos_kova || Number(fisDetay["v_bos_kova"]?.adet) > 0 || Number(fisDetay["v_bos_kova"]?.kg) > 0) && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca', marginTop: "4px" }}>
                      <div style={{ flex: 1, minWidth: "85px", fontWeight: 'bold', fontSize: "12px", color: "#dc2626", whiteSpace: "normal", lineHeight: "1.2" }}>Boş Kova</div>
                      <input placeholder="Adet" type="number" value={fisDetay["v_bos_kova"]?.adet || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], adet: e.target.value}})} className="m-inp" style={{flex: "0 0 45px", width: "45px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <input placeholder="KG" type="number" step="0.01" value={fisDetay["v_bos_kova"]?.kg || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], kg: e.target.value}})} className="m-inp" style={{flex: "0 0 50px", width: "50px", padding: "4px 2px", textAlign: "center", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                      <div style={{fontSize:"12px", color:"#94a3b8", width:"8px", textAlign:"center"}}>x</div>
                      <input placeholder="Fiyat" type="number" step="0.01" value={fisDetay["v_bos_kova"]?.fiyat || ""} onChange={e => setFisDetay({...fisDetay, v_bos_kova: {...fisDetay["v_bos_kova"], fiyat: e.target.value}})} className="m-inp" style={{flex: "0 0 60px", width: "60px", padding: "4px 2px", textAlign: "right", background: "#fff", fontSize: "12px", height:"24px", borderColor: "#fca5a5"}} />
                    </div>
                  )}

                </div>
                <div style={{display: "flex", gap: "6px"}}>
                  <select value={fisUst.odeme_turu} onChange={e => setFisUst({ ...fisUst, odeme_turu: e.target.value })} className="m-inp" style={{flex: "0 0 95px", padding: "6px 4px", fontSize: "12px", height: "30px"}}><option value="PEŞİN">💵 PEŞİN</option><option value="VADE">⏳ VADE</option><option value="KREDİ KARTI">💳 K.KARTI</option><option value="HAVALE/EFT">🏦 HAVALE</option></select>
                  <input placeholder="Açıklama/Not..." value={fisUst.aciklama} onChange={e => setFisUst({ ...fisUst, aciklama: e.target.value })} className="m-inp grow-inp" style={{padding: "6px 8px", fontSize: "12px", height: "30px"}} />
                </div>
                <div style={{display: "flex", gap: "6px", marginTop: "6px"}}>
                  <input placeholder="Teslim Alan (İsim Soyisim)" value={fisUst.teslim_alan || ""} onChange={e => setFisUst({ ...fisUst, teslim_alan: e.target.value })} className="m-inp grow-inp" style={{padding: "6px 8px", fontSize: "12px", height: "30px"}} />
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 8px 8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}><span style={{color: "#0f172a", fontWeight: "bold", fontSize: "14px"}}>Genel Toplam:</span><b style={{color: "#0f172a", fontSize: "16px"}}>{fSayi(fisCanliToplam)} ₺</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}><span style={{color: "#2563eb", fontWeight: "bold", fontSize: "13px"}}>Tahsil Edilen:</span><input type="number" placeholder="Alınan..." value={fisUst.tahsilat} onChange={e => setFisUst({ ...fisUst, tahsilat: e.target.value })} className="m-inp" style={{ flex: "0 0 90px", padding: "4px 6px", textAlign: "right", borderColor: "#bfdbfe", fontSize: "13px", height: "28px" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", borderTop: "1px dashed #cbd5e1", paddingTop: "6px" }}><span style={{color: (fisCanliToplam - Number(fisUst.tahsilat || 0)) > 0 ? "#dc2626" : "#059669", fontWeight: "bold", fontSize: "13px"}}>BU FİŞTEN KALAN:</span><b style={{color: (fisCanliToplam - Number(fisUst.tahsilat || 0)) > 0 ? "#dc2626" : "#059669", fontSize: "14px"}}>{fSayi(fisCanliToplam - Number(fisUst.tahsilat || 0))} ₺</b></div>
                
                {aktifBayi && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}><span style={{color: "#64748b", fontSize: "11px"}}>Önceki Bakiye:</span><b style={{color: "#64748b", fontSize: "12px"}}>{fSayi(eskiBorc)} ₺</b></div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", background: "#fef2f2", padding: "6px", borderRadius: "6px", border: "1px solid #fecaca" }}><span style={{color: "#dc2626", fontWeight: "bold", fontSize: "12px"}}>GENEL TOPLAM BORÇ:</span><b style={{color: "#dc2626", fontSize: "16px"}}>{fSayi(toplamGenelBorc)} ₺</b></div>
                  </>
                )}
                <button onClick={handleTopluFisKaydet} className="p-btn btn-anim" style={{ background: editingFisId ? "#f59e0b" : "#059669", width: "100%", height: "40px", fontSize: "14px" }}>{editingFisId ? "DEĞİŞİKLİKLERİ KAYDET" : "FİŞİ KAYDET"}</button>
              </div>
            </div>
          </div>
        )}

        {/* MÜŞTERİ ÇIKTI EKRANI */}
        {sonFisData && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }}>
            <div style={{ backgroundColor: "#f8fafc", borderRadius: "10px", width: "95vw", maxWidth: "340px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "95vh" }}>
              
              <div style={{ overflowY: "auto", flex: 1 }}>
                <div id="print-receipt" style={{ background: "#fff", padding: "15px", textAlign: "center", borderBottom: "1px dashed #cbd5e1" }}>
                  <h2 style={{ margin: "0 0 2px", color: "#000", fontSize: "18px" }}>SULTANKÖY</h2><div style={{ color: "#000", fontSize: "11px", marginBottom: "12px" }}>Süt Ürünleri</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginBottom: "2px" }}><span>Tarih:</span><b>{sonFisData.tarih.split("-").reverse().join(".")}</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginBottom: "2px" }}><span>Sayın:</span><b style={{textAlign: "right"}}>{sonFisData.bayi}</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#000", marginBottom: "12px" }}><span>Fiş No:</span><b>{sonFisData.fis_no}</b></div>
                  
                  {sonFisData.urunler.length > 0 && (
                    <table style={{ width: '100%', fontSize: '11px', textAlign: 'left', borderCollapse: 'collapse', marginBottom: '12px', color: '#000' }}>
                      <thead><tr style={{ borderBottom: '1px solid #000' }}><th style={{ paddingBottom: '4px' }}>Ürün</th><th style={{ paddingBottom: '4px', textAlign: 'center' }}>Adet</th><th style={{ paddingBottom: '4px', textAlign: 'center' }}>KG</th><th style={{ paddingBottom: '4px', textAlign: 'right' }}>B.Fiyat</th><th style={{ paddingBottom: '4px', textAlign: 'right' }}>Tutar</th></tr></thead>
                      <tbody>{sonFisData.urunler.map((u:any, i:number) => (<tr key={i}><td style={{ padding: '4px 0', borderBottom: '1px dashed #ccc' }}>{u.isim}</td><td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{u.adet || '-'}</td><td style={{ padding: '4px 0', textAlign: 'center', borderBottom: '1px dashed #ccc' }}>{u.kg > 0 ? u.kg : '-'}</td><td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(u.fiyat)}</td><td style={{ padding: '4px 0', textAlign: 'right', borderBottom: '1px dashed #ccc' }}>{fSayi(u.tutar)}</td></tr>))}</tbody>
                    </table>
                  )}
                  
                  {sonFisData.ekstraIndirimler && sonFisData.ekstraIndirimler.map((ek: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#000", paddingTop: "2px", fontWeight: "bold" }}>
                      <span>{ek.isim} ({ek.miktar} {ek.birim}):</span>
                      <b>-{fSayi(ek.tutar)}</b>
                    </div>
                  ))}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", paddingTop: "6px", color: "#000", borderTop: "1px dashed #ccc", marginTop: "4px" }}><span>Genel Toplam:</span><b>{fSayi(sonFisData.genelToplam)} ₺</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", paddingTop: "4px", color: "#000" }}><span>Tahsil Edilen:</span><b>{fSayi(sonFisData.tahsilat)}</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", paddingTop: "4px", color: "#000" }}><span>Bu Fiş Kalan:</span><b>{fSayi(sonFisData.kalanBakiye)}</b></div>
                  
                  {sonFisData.gosterBakiye && (sonFisData.eskiBorc !== 0 || sonFisData.genelBorc !== 0) && (
                    <div style={{ marginTop: "6px", borderTop: "1px solid #000", paddingTop: "6px" }}>
                      {sonFisData.eskiBorc !== 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#000", marginBottom: "2px" }}><span>Önceki Bakiye:</span><b>{fSayi(sonFisData.eskiBorc)} ₺</b></div>}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#000", fontWeight: "bold" }}><span>TOPLAM BORÇ:</span><b>{fSayi(sonFisData.genelBorc)} ₺</b></div>
                    </div>
                  )}
                  {sonFisData.teslim_alan && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#000", marginTop: "10px" }}>
                      <span>Teslim Alan:</span><b style={{textAlign: "right"}}>{sonFisData.teslim_alan}</b>
                    </div>
                  )}
                  <div style={{ textAlign: "right", fontSize: "10px", color: "#000", marginTop: "10px", borderTop: "1px dashed #ccc", paddingTop: "4px" }}>Ödeme: {sonFisData.odeme}</div>
                  <div style={{ textAlign: "center", fontSize: "9px", color: "#000", marginTop: "12px" }}>Bizi tercih ettiğiniz için teşekkür ederiz.</div>
                </div>
              </div>

              <div className="no-print" style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px", background: "#f8fafc", borderTop: "1px solid #cbd5e1" }}>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', background: '#e2e8f0', padding: '8px', borderRadius: '6px', cursor: 'pointer', color: '#1e293b', fontWeight: 'bold' }}>
                  <input type="checkbox" checked={sonFisData.gosterBakiye} onChange={e => setSonFisData({...sonFisData, gosterBakiye: e.target.checked})} style={{ width: '16px', height: '16px' }} />
                  Fiş Çıktısında Müşteriye Toplam Borcu Göster
                </label>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => window.print()} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#475569", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span style={{fontSize:'16px'}}>🖨️</span> YAZDIR
                  </button>
                  <button onClick={handleWhatsappResimGonder} className="btn-anim" style={{ flex: 1, padding: "10px", background: "#25D366", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "13px", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
                    WHATSAPP
                  </button>
                </div>
                
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <button onClick={() => {
                      const fakeFis = { id: sonFisData.id, fis_no: sonFisData.fis_no, tarih: sonFisData.tarih, bayi: sonFisData.bayi, odeme_turu: sonFisData.odeme, aciklama: sonFisData.aciklama || "", tahsilat: sonFisData.tahsilat, kalan_bakiye: sonFisData.kalanBakiye, toplam_tutar: sonFisData.genelToplam };
                      setSonFisData(null);
                      handleFisDuzenle(fakeFis as any);
                  }} className="btn-anim" style={{ flex: 1, padding: "8px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>✏️ DÜZENLE</button>

                  <button onClick={() => {
                      if(confirm("Bu fişi silmek istediğinize emin misiniz?")) {
                          handleFisSil({ id: sonFisData.id, fis_no: sonFisData.fis_no } as any);
                          setSonFisData(null);
                      }
                  }} className="btn-anim" style={{ flex: 1, padding: "8px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "12px" }}>🗑️ SİL</button>
                </div>

                <button onClick={() => setSonFisData(null)} className="btn-anim" style={{ width: "100%", padding: "8px", background: "transparent", color: "#64748b", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", fontSize: "11px", marginTop: "2px" }}>KAPAT</button>
              </div>
            </div>
          </div>
        )}

        {/* TAHSİLAT MODALI */}
        {isTahsilatModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
               <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                 <h3 style={{ margin: "0", color: "#2563eb", fontSize: "15px" }}>💸 Yeni Tahsilat Ekle</h3>
                 <button onClick={() => setIsTahsilatModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
               </div>
               <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <input type="date" value={tahsilatForm.tarih} onChange={e => setTahsilatForm({ ...tahsilatForm, tarih: e.target.value })} className="m-inp" style={{ flex: 1 }} />
                    <input list="bayiler-tahsilat" placeholder="Müşteri/Bayi Seç..." value={tahsilatForm.bayi} onChange={e => setTahsilatForm({ ...tahsilatForm, bayi: e.target.value })} className="m-inp" style={{ flex: 2, fontWeight: "bold" }} />
                    <datalist id="bayiler-tahsilat">
                      {bayiler.map(b => <option key={b.id} value={b.isim}>{b.isim}</option>)}
                    </datalist>
                 </div>
                 <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Tahsilat Tutarı (₺)</label><input type="number" step="0.01" value={tahsilatForm.miktar} onChange={e => setTahsilatForm({ ...tahsilatForm, miktar: e.target.value })} className="m-inp" style={{width: "100%", textAlign: "right", color: "#059669", fontWeight: "bold"}} /></div>
                    <div style={{flex: 1}}>
                      <label style={{fontSize: "11px", color: "#64748b"}}>Ödeme Türü</label>
                      <select value={tahsilatForm.odeme_turu} onChange={e => setTahsilatForm({ ...tahsilatForm, odeme_turu: e.target.value })} className="m-inp" style={{width: "100%"}}><option value="PEŞİN">💵 PEŞİN</option><option value="KREDİ KARTI">💳 K.KARTI</option><option value="HAVALE/EFT">🏦 HAVALE</option></select>
                    </div>
                 </div>
                 <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={tahsilatForm.aciklama} onChange={e => setTahsilatForm({ ...tahsilatForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%"}} /></div>
               </div>
               <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                 <button onClick={handleTahsilatKaydet} className="p-btn btn-anim" style={{ background: "#2563eb", width: "100%", height: "45px", fontSize: "15px" }}>KAYDET</button>
               </div>
            </div>
          </div>
        )}

        {/* SÜT GİRİŞİ MODALI */}
        {isSutModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", width: "95vw", maxWidth: "350px", borderRadius: "12px", display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease-out", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
              <div style={{ padding: "12px 15px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: editingSutId ? "#fef3c7" : "#f8fafc", borderRadius: "12px 12px 0 0" }}>
                <h3 style={{ margin: "0 0 15px", color: editingSutId ? "#b45309" : temaRengi, fontSize: "15px" }}>{editingSutId ? "✏️ Süt Kaydını Düzenle" : "🥛 Yeni Süt Girişi"}</h3>
                <button onClick={() => setIsSutModalOpen(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", padding: 0 }}>✕</button>
              </div>
              <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                   <input type="date" value={sutForm.tarih} onChange={e => setSutForm({ ...sutForm, tarih: e.target.value })} className="m-inp" style={{ flex: 1, padding: "8px" }} />
                   <select value={sutForm.ciftlik} onChange={e => setSutForm({ ...sutForm, ciftlik: e.target.value })} className="m-inp" style={{ flex: 2, fontWeight: "bold", padding: "8px" }}>
                     <option value="">Çiftlik Seç...</option>
                     {tedarikciler.map(t => <option key={t.id} value={t.isim}>{t.isim}</option>)}
                   </select>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Miktar (KG)</label><input type="number" value={sutForm.kg} onChange={e => setSutForm({ ...sutForm, kg: e.target.value })} className="m-inp" style={{width: "100%", padding: "8px", textAlign: "right"}} /></div>
                  <div style={{flex: 1}}><label style={{fontSize: "11px", color: "#64748b"}}>Birim Fiyat</label><input type="number" step="0.01" value={sutForm.fiyat} onChange={e => setSutForm({ ...sutForm, fiyat: e.target.value })} className="m-inp" style={{width: "100%", padding: "8px", textAlign: "right"}} /></div>
                </div>
                <div><label style={{fontSize: "11px", color: "#64748b"}}>Açıklama / Not</label><input placeholder="Opsiyonel..." value={sutForm.aciklama} onChange={e => setSutForm({ ...sutForm, aciklama: e.target.value })} className="m-inp" style={{width: "100%", padding: "8px"}} /></div>
              </div>
              <div style={{ padding: "12px 15px", borderTop: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "0 0 12px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}><span style={{color: "#64748b", fontSize: "13px"}}>Toplam Tutar:</span><b style={{color: temaRengi, fontSize: "18px"}}>{fSayi((Number(sutForm.kg) || 0) * (Number(sutForm.fiyat) || 0))} ₺</b></div>
                <button onClick={handleSutKaydet} className="p-btn btn-anim" style={{ background: editingSutId ? "#f59e0b" : temaRengi, width: "100%", height: "45px", fontSize: "15px" }}>{editingSutId ? "GÜNCELLE" : "KAYDET"}</button>
              </div>
            </div>
          </div>
        )}

        {/* NOT DETAY MODALI */}
        {detayNot && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1500, padding: "20px" }} onClick={() => setDetayNot(null)}>
            <div style={{ backgroundColor: "#fff", padding: "25px", borderRadius: "16px", width: "100%", maxWidth: "350px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: "0 0 15px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px" }}>Açıklama / Not</h3><p style={{ margin: "0 0 25px", color: "#475569", lineHeight: "1.6", wordWrap: "break-word" }}>{detayNot}</p>
              <button onClick={() => setDetayNot(null)} style={{ width: "100%", padding: "12px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>KAPAT</button>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed-nav main-content-area">
        {[{ id: "ozet", i: "📊" }, { id: "sut", i: "🥛" }, { id: "satis", i: "💰" }, { id: "analiz", i: "📈" }, { id: "ayarlar", i: "⚙️" }].map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); setEditingSutId(null); setIsSutModalOpen(false); setIsFisModalOpen(false); setIsTahsilatModalOpen(false); }} className={`n-item btn-anim ${activeTab === item.id ? 'active' : ''}`} style={activeTab === item.id ? { color: item.id === 'analiz' ? '#8b5cf6' : temaRengi, borderTopColor: item.id === 'analiz' ? '#8b5cf6' : temaRengi } : {}}>
            <span style={{ fontSize: "20px" }}>{item.i}</span><span style={{ fontSize: "10px", fontWeight: "bold" }}>{item.id.toUpperCase()}</span>
          </button>
        ))}
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        :root { color-scheme: light !important; }
        
        html, body { width: 100%; max-width: 100%; overflow-x: hidden !important; margin: 0 !important; padding: 0 !important; background: #f8fafc !important; font-family: -apple-system, system-ui, sans-serif; color: #1e293b !important; }
        #root { display: block !important; padding: 0 !important; margin: 0 auto !important; width: 100% !important; text-align: left !important; }
        input::placeholder { color: #94a3b8 !important; opacity: 1; }
        
        .app-container { max-width: 800px; margin: 0 auto; width: 100%; min-height: 100vh; background: #f8fafc; position: relative; overflow-x: hidden; }
        
        .header-style { display: flex; justify-content: space-between; padding: 12px 0; background: #fff; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 50; width: 100%; align-items: center; }
        
        .main-content { padding: 10px; padding-bottom: 80px; width: 100%; box-sizing: border-box; }
        .tab-fade-in { animation: fadeIn 0.3s ease-in-out; width: 100%; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        .responsive-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
        .m-inp { flex: 1 1 120px; padding: 8px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; outline: none; background: #fff; color: #1e293b !important; }
        .num-inp { flex: 0 0 65px !important; min-width: 65px; padding: 6px 4px !important; text-align: center; }
        .grow-inp { flex: 1 1 120px !important; }
        .p-btn { flex: 0 0 auto !important; padding: 0 20px; height: 36px; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; }
        
        .card { background: #fff; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 15px; width: 100%; box-sizing: border-box; }
        .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
        
        .m-btn { width: 100%; padding: 12px; color: #fff; border: none; border-radius: 10px; font-weight: bold; font-size: 15px; cursor: pointer; margin-bottom: 10px; }
        .green-btn { background: #059669; } .blue-btn { background: #2563eb; }
        
        .compact-totals { display: flex; gap: 6px; margin-bottom: 12px; width: 100%; justify-content: space-between; }
        .c-kutu { flex: 1; background: #fff; padding: 10px 4px; border-radius: 8px; border: 1px solid #e2e8f0; border-left-width: 4px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.02); text-align: center; }
        .c-kutu span { font-size: 9px; color: #64748b; font-weight: bold; margin-bottom: 2px; }
        .c-kutu b { font-size: 13px; white-space: nowrap; }
        
        .table-wrapper { width: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; box-sizing: border-box; }
        .tbl { width: 100%; border-collapse: collapse; table-layout: auto; min-width: 100%; }
        .tbl th { background: #f1f5f9; border-bottom: 1px solid #e2e8f0; color: #475569; font-weight: bold; font-size: 10px; padding: 3px 4px !important; white-space: nowrap; }
        .tbl-satis th { background: #5b9bd5 !important; color: white !important; }
        .tbl-analiz th { background: #8b5cf6 !important; color: white !important; }
        .tbl td { font-size: 11px; border-bottom: 1px solid #f1f5f9; padding: 3px 4px !important; white-space: nowrap; vertical-align: middle; }
        
        .actions-cell { white-space: nowrap !important; width: 1% !important; text-align: right; }
        .action-buttons { display: flex; gap: 2px; justify-content: flex-end; align-items: center; }
        
        .truncate-text-td { max-width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }

        .fixed-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 1000px; height: 70px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; z-index: 100; }
        .n-item { flex: 1; border: none; background: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-top: 3px solid transparent; }
        .n-item.active { background: #f8fafc; }
        .btn-anim { transition: transform 0.1s; } .btn-anim:active { transform: scale(0.95); }
        .out-btn { background: #fff; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: bold; cursor: pointer; }
        .ed-btn { background: none; border: none; color: #f59e0b; font-size: 15px; cursor: pointer; padding: 0 2px; }
        .dl-btn { background: none; border: none; color: #dc2626; font-size: 15px; font-weight: bold; cursor: pointer; padding: 0 2px; }

        @media (max-width: 600px) {
          .main-content { padding: 0 !important; padding-bottom: 80px !important; width: 100% !important; overflow-x: hidden !important; }
          .table-wrapper { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; margin: 0 !important; }
          .tbl th, .tbl td { padding: 3px 2px !important; font-size: 11px !important; }
          .tbl th:first-child, .tbl td:first-child { padding-left: 4px !important; }
          .tbl th:last-child, .tbl td:last-child { padding-right: 4px !important; }
          .card, .m-btn { width: calc(100% - 8px) !important; margin-left: 4px !important; margin-right: 4px !important; box-sizing: border-box !important; }
          .cards-grid { width: calc(100% - 8px) !important; margin-left: 4px !important; margin-right: 4px !important; }
          .compact-totals { width: calc(100% - 4px) !important; margin-left: 2px !important; margin-right: 2px !important; gap: 4px !important; }
          .card { border-radius: 8px !important; padding: 12px !important; margin-bottom: 8px !important; }
          .summary-c { margin-left: 0 !important; margin-right: 0 !important; border-radius: 6px !important; width: 100% !important; }
          .c-kutu { border-radius: 4px !important; padding: 6px 2px !important; }
          .truncate-text-td { max-width: 65px !important; }
        }

        @media print {
          @page { margin: 0; size: 58mm auto; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; overflow: visible !important; width: auto !important; max-width: none !important; }
          .main-content-area, header, footer { display: none !important; }
          .print-modal-wrapper { position: static !important; display: block !important; background: transparent !important; padding: 0 !important; }
          .print-modal-content { max-width: 100% !important; border-radius: 0 !important; box-shadow: none !important; }
          #print-receipt { border: none !important; padding: 0 !important; width: 55mm; margin: 0 auto; display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
