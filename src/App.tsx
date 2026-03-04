import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

// --- TİP TANIMLAMALARI ---
interface Ciftlik { id: string; isim: string; }
interface Bayi { id: string; isim: string; }
interface Urun { id: string; isim: string; fiyat?: number | string; }
interface SutGiris { id?: string; tarih: string; ciftlik: string; kg: number | string; fiyat: number | string; toplam_tl?: number; aciklama: string; ekleyen?: string; }
interface SatisGiris { id?: string; fis_no?: string; tarih: string; bayi: string; urun: string; adet: number | string; fiyat: number | string; toplam_kg?: number; bos_kova?: number | string; tutar?: number; aciklama: string; birim?: number; ekleyen?: string; }
interface SatisFis { id?: string; fis_no: string; tarih: string; bayi: string; toplam_tutar: number; tahsilat: number; kalan_bakiye: number; odeme_turu: string; aciklama: string; ekleyen?: string; }
interface Gider { id?: string; tarih: string; tur: string; aciklama: string; tutar: number | string; ekleyen?: string; }
interface Uretim { id?: string; tarih: string; cig_sut: number | string; sut_fiyat: number | string; sut_tozu: number | string; sut_tozu_fiyat: number | string; tereyag: number | string; tereyag_fiyat: number | string; katki_kg: number | string; katki_fiyat: number | string; su: number | string; kova_3_adet: number | string; kova_3_fiyat: number | string; kova_5_adet: number | string; kova_5_fiyat: number | string; cikti_3kg: number | string; satis_3_fiyat: number | string; cikti_5kg: number | string; satis_5_fiyat: number | string; toplam_kg?: number; toplam_maliyet?: number; kar?: number; aciklama: string; ekleyen?: string; }

// --- SUPABASE BAĞLANTISI ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// YEREL TARİH BULUCU
const getLocalDateString = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("satis");

  // DÖNEM YÖNETİMİ
  const [aktifDonem, setAktifDonem] = useState<string>(() => getLocalDateString().substring(0, 7));
  const [isDonemModalOpen, setIsDonemModalOpen] = useState(false);
  const [donemOnay, setDonemOnay] = useState(false);

  // VERİ LİSTELERİ
  const [tedarikciler, setTedarikciler] = useState<Ciftlik[]>([]);
  const [bayiler, setBayiler] = useState<Bayi[]>([]);
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [sutList, setSutList] = useState<SutGiris[]>([]);
  const [satisFisList, setSatisFisList] = useState<SatisFis[]>([]); 
  const [satisList, setSatisList] = useState<SatisGiris[]>([]); 
  const [giderList, setGiderList] = useState<Gider[]>([]);
  const [uretimList, setUretimList] = useState<Uretim[]>([]);

  // AYARLAR VE UI STATE'LERİ
  const temaRengi = "#2563eb"; 
  const [fontSize, setFontSize] = useState<number>(13); 
  const [detayNot, setDetayNot] = useState<any>(null);
  
  // AÇILIR MENÜLER (3 Nokta & Filtreler)
  const [openDropdown, setOpenDropdown] = useState<{type: string, id: string} | null>(null);
  const [isDigerUstOpen, setIsDigerUstOpen] = useState(false); // Buton alanı
  const [isDigerFiltreOpen, setIsDigerFiltreOpen] = useState(false); // Sekme alanı

  // DİĞER İŞLEMLER (BORÇ EKLE, GİDER DÜŞ, KASAYA DEVİR)
  const [digerModalConfig, setDigerModalConfig] = useState<{isOpen: boolean, type: 'borc'|'gider_dus'|'kasa_devir'|null}>({isOpen: false, type: null});
  const [digerForm, setDigerForm] = useState({tarih: getLocalDateString(), tutar: "", aciklama: ""});

  // YENİ AYARLAR STATE'İ
  const [activeAyarTab, setActiveAyarTab] = useState<"musteriler" | "urunler" | "ciftlikler">("musteriler");
  const [yeniAyarDeger, setYeniAyarDeger] = useState("");
  const [yeniUrunFiyat, setYeniUrunFiyat] = useState("");

  const bugun = getLocalDateString();

  // --- SÜT STATE'LERİ ---
  const [isSutModalOpen, setIsSutModalOpen] = useState<boolean>(false);
  const [editingSutId, setEditingSutId] = useState<any>(null);
  const [sutForm, setSutForm] = useState<SutGiris>({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" });
  const [sutFiltre, setSutFiltre] = useState<{ ciftlikler: string[], baslangic: string, bitis: string }>({ ciftlikler: [], baslangic: "", bitis: "" });
  const [sutSort, setSutSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- SATIŞ STATE'LERİ ---
  const [satisFiltreKisi, setSatisFiltreKisi] = useState<"benim" | "herkes">("benim");
  const [satisFiltreTip, setSatisFiltreTip] = useState<"tumu" | "satis" | "tahsilat" | "borc" | "gider_dus" | "kasa_devir">("tumu");
  
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
  const [fisSort, setFisSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- ANALİZ STATE'LERİ ---
  const [analizFiltre, setAnalizFiltre] = useState<{bayiler: string[], urunler: string[], baslangic: string, bitis: string}>({ bayiler: [], urunler: [], baslangic: "", bitis: "" });
  const [analizSort, setAnalizSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  // --- GİDER STATE'LERİ ---
  const [giderFiltreKisi, setGiderFiltreKisi] = useState<"benim" | "tumu">("benim");
  const [isGiderModalOpen, setIsGiderModalOpen] = useState<boolean>(false);
  const [editingGiderId, setEditingGiderId] = useState<any>(null);
  const [giderForm, setGiderForm] = useState<Gider>({ tarih: bugun, tur: "Genel Gider", aciklama: "", tutar: "" });
  const [giderSort, setGiderSort] = useState<any>({ key: 'tarih', direction: 'desc' });
  const giderTurleri = ["Araç Yakıt", "Süt Ödemesi", "Yemek", "Sarf Malzeme", "Genel Gider", "Nakliye", "Maaş", "Araç Bakım", "Elektrik Ödemesi", "Süt Katkıları", "Tamirat Tadilat", "Katı Yakacak", "Sermaye Girişi", "Kar Paylaşımı", "Kova Satışı", "süt nakliye", "yoğurt nakliye", "tahsilat", "banka kesintisi"];

  // --- ÜRETİM STATE'LERİ ---
  const [isUretimModalOpen, setIsUretimModalOpen] = useState<boolean>(false);
  const [uretimDetayData, setUretimDetayData] = useState<any>(null);
  const [editingUretimId, setEditingUretimId] = useState<any>(null);
  const [uretimForm, setUretimForm] = useState<Uretim>({ tarih: bugun, cig_sut: "", sut_fiyat: "", sut_tozu: "", sut_tozu_fiyat: "", tereyag: "", tereyag_fiyat: "", katki_kg: "", katki_fiyat: "", su: "", kova_3_adet: "", kova_3_fiyat: "", kova_5_adet: "", kova_5_fiyat: "", cikti_3kg: "", satis_3_fiyat: "", cikti_5kg: "", satis_5_fiyat: "", aciklama: "" });
  const [uretimSort, setUretimSort] = useState<any>({ key: 'tarih', direction: 'desc' });

  const [activeFilterModal, setActiveFilterModal] = useState<'sut_ciftlik' | 'fis_bayi' | 'analiz_bayi' | 'analiz_urun' | 'sut_tarih' | 'fis_tarih' | 'analiz_tarih' | null>(null);

  const closeAllDropdowns = () => {
    setOpenDropdown(null);
    setIsDigerUstOpen(false);
    setIsDigerFiltreOpen(false);
  };

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

  async function verileriGetir(hedef: "hepsi" | "satis" | "sut" | "gider" | "uretim" | "ayar" = "hepsi") {
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

      if (hedef === "hepsi" || hedef === "gider") {
        const { data: g } = await supabase.from("giderler").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (g) setGiderList(g);
      }

      if (hedef === "hepsi" || hedef === "uretim") {
        const { data: ur } = await supabase.from("uretim").select("*").order("tarih", { ascending: true }).order("id", { ascending: true });
        if (ur) setUretimList(ur);
      }

    } catch (error) { console.error(error); }
  }

  // DÖNEM GEÇİŞ LİSTESİ OLUŞTURUCU (Tüm mevcut verilerden YYYY-MM çeker)
  const aylar = useMemo(() => {
     const set = new Set<string>();
     [...sutList, ...satisFisList, ...giderList, ...uretimList].forEach(item => {
         if(item.tarih) set.add(item.tarih.substring(0, 7)); 
     });
     set.add(getLocalDateString().substring(0, 7)); // Her zaman bu ayı ekle
     set.add(aktifDonem); // Her zaman seçili ayı ekle
     return Array.from(set).sort().reverse(); 
  }, [sutList, satisFisList, giderList, uretimList, aktifDonem]);

  const handleDonemKapat = () => {
     if(!donemOnay) return;
     const [yyyy, mm] = aktifDonem.split('-');
     let nextM = parseInt(mm) + 1;
     let nextY = parseInt(yyyy);
     if(nextM > 12) { nextM = 1; nextY++; }
     const nextDonem = `${nextY}-${nextM.toString().padStart(2, '0')}`;
     
     setAktifDonem(nextDonem);
     setIsDonemModalOpen(false);
     setDonemOnay(false);
  }

  // --- DÖNEM İZOLASYONLARI (TÜM VERİLER SEÇİLİ AYA GÖRE FİLTRELENİR) ---
  const periodSatisFis = useMemo(() => satisFisList.filter(f => f.tarih.startsWith(aktifDonem)), [satisFisList, aktifDonem]);
  const periodSut = useMemo(() => sutList.filter(s => s.tarih.startsWith(aktifDonem)), [sutList, aktifDonem]);
  const periodSatisList = useMemo(() => satisList.filter(s => s.tarih.startsWith(aktifDonem)), [satisList, aktifDonem]);
  const periodGider = useMemo(() => giderList.filter(g => g.tarih.startsWith(aktifDonem)), [giderList, aktifDonem]);
  const periodUretim = useMemo(() => uretimList.filter(u => u.tarih.startsWith(aktifDonem)), [uretimList, aktifDonem]);


  const fSayi = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(num) || 0).replace(/,00$/, '');
  const fSayiNoDec = (num: any) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(num) || 0);

  const renderNot = (not: any) => {
    if (!not) return "";
    return not.length <= 15 ? not : <span onClick={(e) => { e.stopPropagation(); setDetayNot(not); }} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8", color: "#3b82f6" }}>{not.substring(0, 15)}...</span>;
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

  const handleAyarEkle = () => {
      if (!yeniAyarDeger.trim()) return;
      const tabloAdi = activeAyarTab === 'musteriler' ? 'bayiler' : activeAyarTab === 'urunler' ? 'urunler' : 'ciftlikler';
      ayarIslem(tabloAdi, yeniAyarDeger, "ekle", null, setYeniAyarDeger);
  };

  const topluMusteriler = [
    "Batman Bayi", "Cizre Bayi", "Silopi Bayi", "Elazığ Bayi", "Siirt Bayi", "Mardin Bayi",
    "Alkan et", "Aras Peynircilik", "Aren seyrantepe", "Aren winston", "Armola", "Aspava",
    "Aydar Peynircilik", "Aziz", "Bademci fabrika", "Bademci sultan", "Bademci winston",
    "Banvit kasap", "Bereket", "Big Gross", "Cengiz bakkal bağlar", "Cengiz market bağcılar",
    "Deniz bakkal", "Ecrin market", "Erdi kahve", "Ersoy gross", "Esin Market", "Gündüz Şarküteri",
    "Güneydoğu peynircilik", "İade imha", "Kadir Market", "Lop Et", "Mekke baharat", "Nero Gross",
    "Perakende", "Polat şarküteri", "Sayar et", "Serhat", "Seyran gross", "Surkent", "Şahin et",
    "Şerif Market", "Tatvan Şarküteri", "Tunç Şarküteri", "Umut market", "Yeşilbahçe baharat",
    "Yıldız market", "Yunomar Diclekent", "Yunomar Havaalanı"
  ];

  const handleTopluMusteriEkle = async () => {
      const mevcutİsimler = bayiler.map(b => b.isim);
      const eklenecekler = topluMusteriler.filter(m => !mevcutİsimler.includes(m)).map(isim => ({ isim }));
      if(eklenecekler.length > 0) {
          const { error } = await supabase.from("bayiler").insert(eklenecekler);
          if(error) alert("Hata: " + error.message);
          else {
              alert(`${eklenecekler.length} müşteri başarıyla eklendi!`);
              verileriGetir("ayar");
          }
      } else {
          alert("Bu listedeki tüm müşteriler zaten ekli.");
      }
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

  const handleSortClick = (sortKey: string, currentSort: any, setSort: any) => {
      if (currentSort.key === sortKey) {
          setSort({ key: sortKey, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' });
      } else {
          setSort({ key: sortKey, direction: 'desc' });
      }
  };

  const Th = ({ label, sortKey, currentSort, setSort, align="left", filterType = null, isAnaliz = false }: any) => (
    <th style={{ textAlign: align }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => handleSortClick(sortKey, currentSort, setSort)}>
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

  // --- KAYIT İŞLEMLERİ ---
  async function handleSutKaydet() {
    if (!sutForm.ciftlik || !sutForm.kg || !sutForm.fiyat) return alert("Çiftlik, KG ve Fiyat alanları zorunludur!");
    const p = { ...sutForm, kg: Number(sutForm.kg), fiyat: Number(sutForm.fiyat), toplam_tl: Number(sutForm.kg) * Number(sutForm.fiyat), ekleyen: username };
    const { error } = editingSutId ? await supabase.from("sut_giris").update(p).eq("id", editingSutId) : await supabase.from("sut_giris").insert(p);
    if (error) return alert("Hata: " + error.message);
    setSutForm({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" }); 
    setEditingSutId(null); setIsSutModalOpen(false); verileriGetir("sut"); 
  }

  async function handleGiderKaydet() {
    if (!giderForm.tarih || !giderForm.tur || !giderForm.tutar) return alert("Tarih, Tür ve Tutar zorunludur!");
    const p = { ...giderForm, tutar: Number(giderForm.tutar), ekleyen: username };
    const { error } = editingGiderId ? await supabase.from("giderler").update(p).eq("id", editingGiderId) : await supabase.from("giderler").insert(p);
    if (error) return alert("Hata: " + error.message);
    setGiderForm({ tarih: bugun, tur: "Genel Gider", aciklama: "", tutar: "" });
    setEditingGiderId(null); setIsGiderModalOpen(false); verileriGetir("gider");
  }

  const uretimSonFiyatlar = useMemo(() => {
    if (uretimList.length === 0) return { sut: "", toz: "", yag: "", katki: "", kova3: "", kova5: "", satis3: "", satis5: "" };
    const sonKayit = [...uretimList].sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
    return { 
        sut: sonKayit.sut_fiyat || "", toz: sonKayit.sut_tozu_fiyat || "", 
        yag: sonKayit.tereyag_fiyat || "", katki: sonKayit.katki_fiyat || "",
        kova3: sonKayit.kova_3_fiyat || "", kova5: sonKayit.kova_5_fiyat || "",
        satis3: sonKayit.satis_3_fiyat || "", satis5: sonKayit.satis_5_fiyat || ""
    };
  }, [uretimList]);

  async function handleUretimKaydet() {
    if (!uretimForm.tarih) return alert("Tarih zorunludur!");
    
    const maliyet = (Number(uretimForm.cig_sut||0) * Number(uretimForm.sut_fiyat||0)) +
                    (Number(uretimForm.sut_tozu||0) * Number(uretimForm.sut_tozu_fiyat||0)) +
                    (Number(uretimForm.tereyag||0) * Number(uretimForm.tereyag_fiyat||0)) +
                    (Number(uretimForm.katki_kg||0) * Number(uretimForm.katki_fiyat||0)) +
                    (Number(uretimForm.kova_3_adet||0) * Number(uretimForm.kova_3_fiyat||0)) +
                    (Number(uretimForm.kova_5_adet||0) * Number(uretimForm.kova_5_fiyat||0));

    const satisDegeri = (Number(uretimForm.cikti_3kg||0) * Number(uretimForm.satis_3_fiyat||0)) +
                        (Number(uretimForm.cikti_5kg||0) * Number(uretimForm.satis_5_fiyat||0));

    const hesaplananKar = satisDegeri - maliyet;
    const topKg = Number(uretimForm.cig_sut||0) + Number(uretimForm.sut_tozu||0) + Number(uretimForm.tereyag||0) + Number(uretimForm.katki_kg||0) + Number(uretimForm.su||0);

    const p = { 
        ...uretimForm, 
        cig_sut: Number(uretimForm.cig_sut||0), sut_fiyat: Number(uretimForm.sut_fiyat||0),
        sut_tozu: Number(uretimForm.sut_tozu||0), sut_tozu_fiyat: Number(uretimForm.sut_tozu_fiyat||0),
        tereyag: Number(uretimForm.tereyag||0), tereyag_fiyat: Number(uretimForm.tereyag_fiyat||0),
        katki_kg: Number(uretimForm.katki_kg||0), katki_fiyat: Number(uretimForm.katki_fiyat||0),
        su: Number(uretimForm.su||0),
        kova_3_adet: Number(uretimForm.kova_3_adet||0), kova_3_fiyat: Number(uretimForm.kova_3_fiyat||0),
        kova_5_adet: Number(uretimForm.kova_5_adet||0), kova_5_fiyat: Number(uretimForm.kova_5_fiyat||0),
        cikti_3kg: Number(uretimForm.cikti_3kg||0), satis_3_fiyat: Number(uretimForm.satis_3_fiyat||0),
        cikti_5kg: Number(uretimForm.cikti_5kg||0), satis_5_fiyat: Number(uretimForm.satis_5_fiyat||0),
        toplam_kg: topKg,
        toplam_maliyet: maliyet,
        kar: hesaplananKar,
        ekleyen: username
    };

    const { error } = editingUretimId ? await supabase.from("uretim").update(p).eq("id", editingUretimId) : await supabase.from("uretim").insert(p);
    if (error) return alert("Hata: " + error.message);
    
    setUretimForm({ tarih: bugun, cig_sut: "", sut_fiyat: uretimSonFiyatlar.sut, sut_tozu: "", sut_tozu_fiyat: uretimSonFiyatlar.toz, tereyag: "", tereyag_fiyat: uretimSonFiyatlar.yag, katki_kg: "", katki_fiyat: uretimSonFiyatlar.katki, su: "", kova_3_adet: "", kova_3_fiyat: uretimSonFiyatlar.kova3, kova_5_adet: "", kova_5_fiyat: uretimSonFiyatlar.kova5, cikti_3kg: "", satis_3_fiyat: uretimSonFiyatlar.satis3, cikti_5kg: "", satis_5_fiyat: uretimSonFiyatlar.satis5, aciklama: "" });
    setEditingUretimId(null); setIsUretimModalOpen(false); verileriGetir("uretim");
  }

  async function handleTahsilatKaydet() {
    if (!tahsilatForm.bayi || !tahsilatForm.miktar) return alert("Bayi ve miktar alanları zorunludur!");
    if (!bayiler.some(b => b.isim === tahsilatForm.bayi)) return alert("Lütfen listeden geçerli bir Bayi/Müşteri seçin! Kendiniz rastgele isim giremezsiniz.");

    const tMiktar = Number(tahsilatForm.miktar);
    if (tMiktar <= 0) return alert("Geçerli bir tahsilat tutarı girin.");

    const fNo = `T-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`;
    const fData = {
        fis_no: fNo,
        tarih: tahsilatForm.tarih,
        bayi: tahsilatForm.bayi,
        toplam_tutar: 0,
        tahsilat: tMiktar,
        kalan_bakiye: -tMiktar,
        odeme_turu: tahsilatForm.odeme_turu,
        aciklama: tahsilatForm.aciklama ? `[Sadece Tahsilat] - ${tahsilatForm.aciklama}` : `[Sadece Tahsilat]`,
        ekleyen: username
    };

    const { error } = await supabase.from("satis_fisleri").insert(fData);
    if (error) return alert("Hata: " + error.message);

    setTahsilatForm({ tarih: bugun, bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" });
    setIsTahsilatModalOpen(false);
    verileriGetir("satis");
  }

  async function handleDigerIslemKaydet() {
    if (!digerForm.tutar || Number(digerForm.tutar) <= 0) return alert("Geçerli bir tutar girin.");

    const fNo = `D-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`;
    let tahsilat = 0;
    let kalan = 0;
    let toplam = 0;

    // Gider düş veya kasaya devir işlemi, tahsilatı eksiltir
    if (digerModalConfig.type === 'gider_dus' || digerModalConfig.type === 'kasa_devir') {
        tahsilat = Number(digerForm.tutar); // Kendi türüyle kaydedip ekranda düşeceğiz
    } else if (digerModalConfig.type === 'borc') {
        toplam = Number(digerForm.tutar);
        kalan = Number(digerForm.tutar);
    }

    const tipMetni = digerModalConfig.type === 'gider_dus' ? 'GİDER DÜŞ' : (digerModalConfig.type === 'kasa_devir' ? 'KASAYA DEVİR' : 'BORÇ EKLE');

    const fData = {
        fis_no: fNo,
        tarih: digerForm.tarih,
        bayi: "SİSTEM İŞLEMİ",
        toplam_tutar: toplam,
        tahsilat: tahsilat,
        kalan_bakiye: kalan,
        odeme_turu: tipMetni,
        aciklama: digerForm.aciklama,
        ekleyen: username
    };

    const { error } = await supabase.from("satis_fisleri").insert(fData);
    if (error) return alert("Hata: " + error.message);

    setDigerModalConfig({isOpen: false, type: null});
    setDigerForm({tarih: getLocalDateString(), tutar: "", aciklama: ""});
    verileriGetir("satis");
  }

  const handleBayiSecimi = (secilenBayi: string) => {
    if (!secilenBayi) return;
    const yeniDetay = { ...fisDetay };
    
    urunler.forEach(u => {
      const bayiSatislari = periodSatisList.filter(s => s.bayi === secilenBayi && s.urun === u.isim);
      let hafizaFiyat = u.fiyat || "";
      if (bayiSatislari.length > 0) {
        const sonSatis = bayiSatislari.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        hafizaFiyat = sonSatis.fiyat;
      }
      if (!editingFisId) yeniDetay[u.id] = { adet: fisDetay[u.id]?.adet || "", kg: fisDetay[u.id]?.kg || "", fiyat: String(hafizaFiyat) };
    });

    const bayiIadeler = periodSatisList.filter(s => s.bayi === secilenBayi && s.urun === "İade");
    let hafizaIadeFiyat = "15";
    if (bayiIadeler.length > 0) {
        const sonIade = bayiIadeler.sort((a,b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())[0];
        hafizaIadeFiyat = String(Math.abs(Number(sonIade.fiyat)));
    }
    
    const bayiKovalar = periodSatisList.filter(s => s.bayi === secilenBayi && s.urun === "Boş Kova");
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
  // Güncel bakiye bulma (SADECE AKTİF DÖNEM İÇİN - ESKİ BAKİYELER SIFIRLANIR)
  const eskiBorc = useMemo(() => {
      if (!aktifBayi) return 0;
      const bayiFisleri = periodSatisFis.filter(f => f.bayi === aktifBayi && f.id !== editingFisId && f.bayi !== "SİSTEM İŞLEMİ");
      return bayiFisleri.reduce((toplam, f) => toplam + Number(f.kalan_bakiye || 0), 0);
  }, [aktifBayi, periodSatisFis, editingFisId]);

  const fisCanliToplam = useMemo(() => {
    let urunToplami = urunler.reduce((toplam, u) => {
      const adet = Number(fisDetay[u.id]?.adet) || 0;
      const kg = Number(fisDetay[u.id]?.kg) || 0;
      const fiyat = Number(fisDetay[u.id]?.fiyat) || 0;
      const isKova = u.isim.match(/(3|4|5)\s*kg/i);
      const miktar = isKova ? adet : (kg > 0 ? kg : adet); 
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

    const ortakFisNo = editingFisNo || `F-${Date.now().toString().slice(-6)}${Math.floor(Math.random()*1000)}`;
    const tahsilat = Number(fisUst.tahsilat) || 0;
    const kalanBakiye = fisCanliToplam - tahsilat;
    
    const genelNot = [
        fisUst.teslim_alan ? `[Teslim Alan: ${fisUst.teslim_alan}]` : '',
        `[Ödeme: ${fisUst.odeme_turu}]`, 
        fisUst.aciklama
    ].filter(Boolean).join(" - ");

    const fisMaster = { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, toplam_tutar: fisCanliToplam, tahsilat: tahsilat, kalan_bakiye: kalanBakiye, odeme_turu: fisUst.odeme_turu, aciklama: genelNot, ekleyen: username };

    let savedFisId = editingFisId;

    if (editingFisId) {
      const eskiDetaylar = satisList.filter(s => s.fis_no === ortakFisNo);
      const { error: errFisUpd } = await supabase.from("satis_fisleri").update(fisMaster).eq("id", editingFisId);
      if (errFisUpd) return alert("Güncelleme Hatası: " + errFisUpd.message);
      
      await supabase.from("satis_giris").delete().eq("fis_no", ortakFisNo);

      const insertArray = eklenecekUrunler.map((u) => {
        const adet = Number(fisDetay[u.id].adet), kg = Number(fisDetay[u.id].kg), fiyat = Number(fisDetay[u.id].fiyat);
        const kgEslesme = u.isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
        const isKova = u.isim.match(/(3|4|5)\s*kg/i);
        
        const hesaplananKg = isKova ? (adet * Number(isKova[1])) : (kg > 0 ? kg : (kgEslesme ? Number(kgEslesme[1]) * adet : adet));
        const miktar = isKova ? adet : (kg > 0 ? kg : adet);
        const tutar = miktar * fiyat;

        return { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: adet, fiyat: fiyat, birim: kgEslesme ? Number(kgEslesme[1]) : 1, toplam_kg: hesaplananKg, tutar: tutar, bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username };
      });

      if (iadeMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "İade", adet: iadeAdet, fiyat: -iadeFiyat, birim: 1, toplam_kg: iadeKg, tutar: -(iadeMiktar * iadeFiyat), bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username });
      }

      if (kovaMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "Boş Kova", adet: kovaAdet, fiyat: -kovaFiyat, birim: 1, toplam_kg: kovaKg, tutar: -(kovaMiktar * kovaFiyat), bos_kova: kovaAdet, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username });
      }

      const { error: errDetay } = await supabase.from("satis_giris").insert(insertArray);
      if (errDetay) {
        alert("Detaylar kaydedilirken hata oluştu! Eski verileriniz geri yükleniyor...");
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
        const kgEslesme = u.isim.match(/(\d+(?:\.\d+)?)\s*(kg|lt|l|gr)\b/i);
        const isKova = u.isim.match(/(3|4|5)\s*kg/i);
        
        const hesaplananKg = isKova ? (adet * Number(isKova[1])) : (kg > 0 ? kg : (kgEslesme ? Number(kgEslesme[1]) * adet : adet));
        const miktar = isKova ? adet : (kg > 0 ? kg : adet);
        const tutar = miktar * fiyat;

        return { fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: u.isim, adet: adet, fiyat: fiyat, birim: kgEslesme ? Number(kgEslesme[1]) : 1, toplam_kg: hesaplananKg, tutar: tutar, bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username };
      });

      if (iadeMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "İade", adet: iadeAdet, fiyat: -iadeFiyat, birim: 1, toplam_kg: iadeKg, tutar: -(iadeMiktar * iadeFiyat), bos_kova: 0, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username });
      }

      if (kovaMiktar > 0) {
        insertArray.push({ fis_no: ortakFisNo, tarih: fisUst.tarih, bayi: fisUst.bayi, urun: "Boş Kova", adet: kovaAdet, fiyat: -kovaFiyat, birim: 1, toplam_kg: kovaKg, tutar: -(kovaMiktar * kovaFiyat), bos_kova: kovaAdet, aciklama: `Bağlı Fiş: ${ortakFisNo}`, ekleyen: username });
      }

      const { error: errDetay } = await supabase.from("satis_giris").insert(insertArray);
      if (errDetay && savedFisId) {
          await supabase.from("satis_fisleri").delete().eq("id", savedFisId);
          return alert("Sistemsel Hata: Detaylar kaydedilemediği için Fiş tamamen iptal edildi. Lütfen tekrar deneyin. Hata: " + errDetay.message);
      }
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
         const isKova = u.isim.match(/(3|4|5)\s*kg/i);
         const miktar = isKova ? adet : (kg > 0 ? kg : adet);
         return { isim: u.isim, adet: adet, kg: kg, fiyat: fiyat, tutar: miktar * fiyat };
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

    const iadeUrun = periodSatisList.find(s => s.fis_no === fis.fis_no && s.urun === "İade");
    const kovaUrun = periodSatisList.find(s => s.fis_no === fis.fis_no && (s.urun === "İade Kova" || s.urun === "Boş Kova"));
    
    let iadeAdetStr = iadeUrun?.adet ? String(iadeUrun.adet) : "";
    let iadeKgStr = iadeUrun?.toplam_kg && Number(iadeUrun.toplam_kg) > 0 ? String(iadeUrun.toplam_kg) : "";
    let iadeFiyatStr = iadeUrun ? String(Math.abs(Number(iadeUrun.fiyat))) : "";

    let kovaAdetStr = kovaUrun?.adet ? String(kovaUrun.adet) : "";
    let kovaKgStr = kovaUrun?.toplam_kg && Number(kovaUrun.toplam_kg) > 0 ? String(kovaUrun.toplam_kg) : "";
    let kovaFiyatStr = kovaUrun ? String(Math.abs(Number(kovaUrun.fiyat))) : "";

    setFisUst({ tarih: fis.tarih, bayi: fis.bayi, aciklama: safAciklama, odeme_turu: fis.odeme_turu || "PEŞİN", tahsilat: fis.tahsilat > 0 ? String(fis.tahsilat) : "", bos_kova: "", teslim_alan: tAlan });
    
    const ilgiliUrunler = periodSatisList.filter(s => s.fis_no === fis.fis_no);
    const dolanDetay: any = {};
    urunler.forEach(u => {
      const buUrun = ilgiliUrunler.find(s => s.urun === u.isim);
      let calculatedKg = "";
      if (buUrun) {
          const adetNum = Number(buUrun.adet);
          const tutarNum = Number(buUrun.tutar);
          const fiyatNum = Number(buUrun.fiyat);
          const isKova = u.isim.match(/(3|4|5)\s*kg/i);
          if (fiyatNum !== 0 && !isKova && Math.abs(tutarNum - (adetNum * fiyatNum)) > 0.01) {
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
    const ilgiliUrunler = periodSatisList.filter(s => s.fis_no === fis.fis_no && s.urun !== "İade Kova" && s.urun !== "Boş Kova" && s.urun !== "İade");
    const iadeUrun = periodSatisList.find(s => s.fis_no === fis.fis_no && s.urun === "İade");
    const kovaUrun = periodSatisList.find(s => s.fis_no === fis.fis_no && (s.urun === "İade Kova" || s.urun === "Boş Kova"));
    
    const bayiFisleri = periodSatisFis.filter(f => f.bayi === fis.bayi && f.bayi !== "SİSTEM İŞLEMİ" && (f.tarih < fis.tarih || (f.tarih === fis.tarih && Number(f.id) < Number(fis.id))));
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
          const isKova = String(u.urun).match(/(3|4|5)\s*kg/i);
          if (f !== 0 && !isKova && Math.abs(t - (a * f)) > 0.01) calculatedKg = t / f;
          return { isim: u.urun, adet: a, kg: calculatedKg, fiyat: f, tutar: t };
      }), 
      ekstraIndirimler,
      genelToplam: fis.toplam_tutar, tahsilat: fis.tahsilat, kalanBakiye: fis.kalan_bakiye, odeme: fis.odeme_turu || "Bilinmiyor",
      eskiBorc: oGunkuEskiBorc, genelBorc: oGunkuEskiBorc + fis.kalan_bakiye,
      gosterBakiye: false 
    });
  };

  async function handleFisSil(fis: any) {
    if (!confirm(`Bu işlemi (${fis.fis_no || fis.id}) silmek istediğinize emin misiniz?`)) return;
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

  // --- PERFORMANS ODAKLI FİLTRELEME VE TOPLAM HESAPLAMALARI ---
  // 1. AŞAMA: İlgili tarih, bayi ve kişi bazında tüm fişleri alıyoruz
  const filteredForTotals = useMemo(() => periodSatisFis.filter((f: any) => {
    const isBayiMatch = fisFiltre.bayiler.length === 0 || fisFiltre.bayiler.includes(f.bayi);
    const isTarihMatch = (!fisFiltre.baslangic || f.tarih >= fisFiltre.baslangic) && (!fisFiltre.bitis || f.tarih <= fisFiltre.bitis);
    const isKisiMatch = satisFiltreKisi === 'herkes' || f.ekleyen === username;
    return isBayiMatch && isTarihMatch && isKisiMatch;
  }), [periodSatisFis, fisFiltre, satisFiltreKisi, username]);

  // 2. AŞAMA: Özet kutuları için genel toplamları hesaplıyoruz (Tip filtresinden etkilenmez)
  const tFisToplam = useMemo(() => filteredForTotals.filter(f => f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR').reduce((a: number, b: any) => a + Number(b.toplam_tutar), 0), [filteredForTotals]);
  const tFisTahsilatRaw = useMemo(() => filteredForTotals.filter(f => f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR' && f.odeme_turu !== 'BORÇ EKLE').reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tFisKalan = useMemo(() => filteredForTotals.filter(f => f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR').reduce((a: number, b: any) => a + Number(b.kalan_bakiye), 0), [filteredForTotals]);

  // Ekstra Kasa ve Gider Hesapları
  const tGiderDus = useMemo(() => filteredForTotals.filter(f => f.odeme_turu === 'GİDER DÜŞ').reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tKasayaDevir = useMemo(() => filteredForTotals.filter(f => f.odeme_turu === 'KASAYA DEVİR').reduce((a: number, b: any) => a + Number(b.tahsilat), 0), [filteredForTotals]);
  const tNetTahsilat = tFisTahsilatRaw - tGiderDus - tKasayaDevir;

  // 3. AŞAMA: Tabloda listelenecek verileri TİP filtresine göre sınırla
  const fFisList = useMemo(() => sortData(filteredForTotals.filter((f: any) => {
    if (satisFiltreTip === 'tumu') return !['GİDER DÜŞ', 'KASAYA DEVİR', 'BORÇ EKLE'].includes(f.odeme_turu); 
    if (satisFiltreTip === 'borc') return f.odeme_turu === 'BORÇ EKLE';
    if (satisFiltreTip === 'gider_dus') return f.odeme_turu === 'GİDER DÜŞ';
    if (satisFiltreTip === 'kasa_devir') return f.odeme_turu === 'KASAYA DEVİR';
    if (satisFiltreTip === 'tahsilat') return f.toplam_tutar === 0 && f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR' && f.odeme_turu !== 'BORÇ EKLE';
    if (satisFiltreTip === 'satis') return f.toplam_tutar > 0 && f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR' && f.odeme_turu !== 'BORÇ EKLE';
    return true;
  }), fisSort), [filteredForTotals, satisFiltreTip, fisSort]);

  const fSutList = useMemo(() => sortData(periodSut.filter((s: any) => 
    (sutFiltre.ciftlikler.length === 0 || sutFiltre.ciftlikler.includes(s.ciftlik)) && 
    (!sutFiltre.baslangic || s.tarih >= sutFiltre.baslangic) && (!sutFiltre.bitis || s.tarih <= sutFiltre.bitis)
  ), sutSort), [periodSut, sutFiltre, sutSort]);
  const tSutKg = useMemo(() => fSutList.reduce((a: number, b: any) => a + Number(b.kg), 0), [fSutList]);
  const tSutTl = useMemo(() => fSutList.reduce((a: number, b: any) => a + Number(b.toplam_tl), 0), [fSutList]);

  const fAnalizList = useMemo(() => sortData(periodSatisList.filter((s: any) => 
    (analizFiltre.bayiler.length === 0 || analizFiltre.bayiler.includes(s.bayi)) && 
    (analizFiltre.urunler.length === 0 || analizFiltre.urunler.includes(s.urun)) && 
    (!analizFiltre.baslangic || s.tarih >= analizFiltre.baslangic) && (!analizFiltre.bitis || s.tarih <= analizFiltre.bitis)
  ), analizSort), [periodSatisList, analizFiltre, analizSort]);
  const tAnalizKg = useMemo(() => fAnalizList.reduce((a: number, b: any) => a + Number(b.toplam_kg), 0), [fAnalizList]);
  const tAnalizTutar = useMemo(() => fAnalizList.reduce((a: number, b: any) => a + Number(b.tutar), 0), [fAnalizList]);

  const fGiderList = useMemo(() => sortData(periodGider.filter((g: any) => 
    giderFiltreKisi === 'tumu' || g.ekleyen === username
  ), giderSort), [periodGider, giderSort, giderFiltreKisi, username]);
  const fGTutarNormal = useMemo(() => fGiderList.reduce((a: number, b: any) => a + Number(b.tutar), 0), [fGiderList]);

  const tGiderNormal = useMemo(() => periodGider.reduce((a: number, b: any) => a + Number(b.tutar), 0), [periodGider]);
  const tUretimMaliyet = useMemo(() => periodUretim.reduce((a: number, b: any) => a + Number(b.toplam_maliyet), 0), [periodUretim]);
  const genelToplamGider = tGiderNormal + tUretimMaliyet;

  // Tüm Fişlerden Müşteri Borç Durumu Hesaplama
  const bayiBorclari = useMemo(() => {
    const borclar: Record<string, number> = {};
    periodSatisFis.forEach(f => {
        if (f.bayi === "SİSTEM İŞLEMİ") return;
        if(!borclar[f.bayi]) borclar[f.bayi] = 0;
        borclar[f.bayi] += Number(f.kalan_bakiye);
    });
    return Object.keys(borclar)
        .map(k => ({ isim: k, borc: borclar[k] }))
        .filter(b => Math.abs(b.borc) > 0.01)
        .sort((a,b) => b.borc - a.borc);
  }, [periodSatisFis]);
  const bayiNetDurum = bayiBorclari.reduce((a, b) => a + b.borc, 0);

  const renderOzet = () => (
    <div className="tab-fade-in main-content-area">
      <div className="cards-grid">
        <div className="card summary-c" style={{ borderLeft: `5px solid #059669` }}><small>Toplam Satış</small><h2 style={{ margin: "5px 0", color: "#059669", fontSize: "20px" }}>{fSayiNoDec(tFisToplam)} ₺</h2></div>
        <div className="card summary-c" style={{ borderLeft: "5px solid #dc2626" }}><small>Toplam Gider</small><h2 style={{ margin: "5px 0", color: "#dc2626", fontSize: "20px" }}>{fSayiNoDec(genelToplamGider)} ₺</h2></div>
        <div className="card summary-c" style={{ borderLeft: "5px solid #2563eb" }}><small>Tahsilat</small><h2 style={{ margin: "5px 0", color: "#2563eb", fontSize: "20px" }}>{fSayiNoDec(tFisTahsilatRaw)} ₺</h2></div>
        <div className="card summary-c" style={{ borderLeft: "5px solid #f59e0b" }}><small>Bayi Açık Hesap (Net)</small><h2 style={{ margin: "5px 0", color: "#f59e0b", fontSize: "20px" }}>{fSayiNoDec(bayiNetDurum)} ₺</h2></div>
      </div>
      <div className="card" style={{marginTop: "5px"}}>
        <h4 style={{ margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Müşteri Borç Durumları</h4>
        <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '5px'}}>
            {bayiBorclari.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <b className="truncate-text" style={{fontSize: "13px"}}>{b.isim}</b>
                    <b style={{color: b.borc > 0 ? '#dc2626' : (b.borc < 0 ? '#059669' : '#64748b')}}>{fSayi(b.borc)} ₺</b>
                </div>
            ))}
            {bayiBorclari.length === 0 && <div style={{color: '#94a3b8', fontSize: '12px'}}>Açık hesap bulunmuyor.</div>}
        </div>
      </div>
    </div>
  );

  const renderSut = () => (
    <div className="tab-fade-in main-content-area">
      <button onClick={() => { setSutForm({ tarih: bugun, ciftlik: "", kg: "", fiyat: "", aciklama: "" }); setEditingSutId(null); setIsSutModalOpen(true); }} className="btn-anim m-btn blue-btn">➕ YENİ SÜT GİRİŞİ</button>
      <div className="compact-totals">
        <div className="c-kutu" style={{ borderLeftColor: temaRengi }}><span>SÜT</span><b style={{ color: temaRengi, fontSize: "16px" }}>{fSayi(tSutKg)} KG</b></div>
        <div className="c-kutu" style={{ borderLeftColor: temaRengi }}><span>T. TUTAR</span><b style={{ color: temaRengi, fontSize: "16px" }}>{fSayiNoDec(tSutTl)} ₺</b></div>
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
            <td className="actions-cell" style={{position: 'relative'}}>
               {renderNot(s.aciklama)}
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'sut', id: s.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'sut' && openDropdown.id === s.id && (
                  <div className="dropdown-menu">
                     <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingSutId(s.id); setSutForm(s as any); setIsSutModalOpen(true); }}>✏️</button>
                     <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={async () => { setOpenDropdown(null); if(confirm("Sil?")){ await supabase.from("sut_giris").delete().eq("id", s.id); verileriGetir("sut"); } }}>🗑️</button>
                  </div>
               )}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderSatis = () => (
    <div className="tab-fade-in main-content-area">
      {/* ÜST BUTONLAR */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
         <button onClick={handleYeniFisAc} className="btn-anim m-btn green-btn" style={{ margin: 0, flex: 2, fontSize: '13px' }}>➕ YENİ SATIŞ FİŞİ</button>
         <button onClick={() => { setTahsilatForm({ tarih: bugun, bayi: "", miktar: "", odeme_turu: "PEŞİN", aciklama: "" }); setIsTahsilatModalOpen(true); }} className="btn-anim m-btn blue-btn" style={{ margin: 0, flex: 1.2, fontSize: '13px', background: '#3b82f6' }}>💸 TAHSİLAT</button>
         
         <div style={{position: 'relative', flex: 1}}>
           <button onClick={(e) => { e.stopPropagation(); setIsDigerUstOpen(!isDigerUstOpen); setIsDigerFiltreOpen(false); }} className="btn-anim m-btn" style={{ margin: 0, fontSize: '13px', background: '#64748b', width: '100%', padding: '12px 0' }}>DİĞER ▼</button>
           {isDigerUstOpen && (
             <div className="dropdown-menu-list" style={{top: '110%', width: '100%', left: 0}}>
               <button className="dropdown-item" onClick={() => { setIsDigerUstOpen(false); setDigerModalConfig({isOpen: true, type: 'borc'}); }}>📝 Borç Ekle</button>
               <button className="dropdown-item" onClick={() => { setIsDigerUstOpen(false); setDigerModalConfig({isOpen: true, type: 'gider_dus'}); }}>💸 Gider Düş</button>
               <button className="dropdown-item" onClick={() => { setIsDigerUstOpen(false); setDigerModalConfig({isOpen: true, type: 'kasa_devir'}); }}>🏦 Kasaya Devir</button>
             </div>
           )}
         </div>
      </div>

      {/* FİLTRE SEKMELERİ */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
         <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', overflow: 'visible', flex: 2 }}>
            <button onClick={() => setSatisFiltreTip('tumu')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', borderRadius: '6px 0 0 6px', background: satisFiltreTip==='tumu'?'#059669':'transparent', color: satisFiltreTip==='tumu'?'#fff':'#475569' }}>Tümü</button>
            <button onClick={() => setSatisFiltreTip('satis')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreTip==='satis'?'#059669':'transparent', color: satisFiltreTip==='satis'?'#fff':'#475569' }}>Satış</button>
            <button onClick={() => setSatisFiltreTip('tahsilat')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreTip==='tahsilat'?'#059669':'transparent', color: satisFiltreTip==='tahsilat'?'#fff':'#475569' }}>Tahsilat</button>
            
            <div style={{position: 'relative', flex: 1, display: 'flex'}}>
               <button onClick={(e) => { e.stopPropagation(); setIsDigerFiltreOpen(!isDigerFiltreOpen); setIsDigerUstOpen(false); }} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', borderRadius: '0 6px 6px 0', background: ['borc', 'gider_dus', 'kasa_devir'].includes(satisFiltreTip)?'#059669':'transparent', color: ['borc', 'gider_dus', 'kasa_devir'].includes(satisFiltreTip)?'#fff':'#475569' }}>
                   {satisFiltreTip === 'borc' ? 'Borç' : satisFiltreTip === 'gider_dus' ? 'G. Düş' : satisFiltreTip === 'kasa_devir' ? 'K. Devir' : 'Diğer'} ▼
               </button>
               {isDigerFiltreOpen && (
                   <div className="dropdown-menu-list" style={{top: '110%', width: '100%', right: 0}}>
                       <button className="dropdown-item" onClick={() => { setSatisFiltreTip('borc'); setIsDigerFiltreOpen(false); }}>Borç Ekle</button>
                       <button className="dropdown-item" onClick={() => { setSatisFiltreTip('gider_dus'); setIsDigerFiltreOpen(false); }}>Gider Düş</button>
                       <button className="dropdown-item" onClick={() => { setSatisFiltreTip('kasa_devir'); setIsDigerFiltreOpen(false); }}>Kasaya Devir</button>
                   </div>
               )}
            </div>
         </div>
         <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden', flex: 1 }}>
            <button onClick={() => setSatisFiltreKisi('benim')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreKisi==='benim'?'#2563eb':'transparent', color: satisFiltreKisi==='benim'?'#fff':'#475569' }}>Benim</button>
            <button onClick={() => setSatisFiltreKisi('herkes')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: satisFiltreKisi==='herkes'?'#2563eb':'transparent', color: satisFiltreKisi==='herkes'?'#fff':'#475569' }}>Herkes</button>
         </div>
      </div>

      <div className="compact-totals">
        <div className="c-kutu" style={{ borderLeftColor: "#059669" }}><span>TOPLAM SATIŞ</span><b style={{ color: "#059669", fontSize: "16px" }}>{fSayi(tFisToplam)} ₺</b></div>
        
        <div className="c-kutu" style={{ borderLeftColor: "#2563eb", position: 'relative', paddingBottom: '2px' }}>
            <span>TAHSİLAT</span>
            <b style={{ color: "#2563eb", fontSize: "16px", marginBottom: '4px' }}>{fSayi(tFisTahsilatRaw)} ₺</b>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: '2px' }}>
                <span title="Aktarılan">Akt: {fSayiNoDec(tKasayaDevir)}</span>
                <span title="Gider">Gid: {fSayiNoDec(tGiderDus)}</span>
                <span title="Net Tahsilat" style={{fontWeight:'bold', color:'#0f172a'}}>Net: {fSayiNoDec(tNetTahsilat)}</span>
            </div>
        </div>
        
        <div className="c-kutu" style={{ borderLeftColor: "#dc2626" }}><span>AÇIK HESAP</span><b style={{ color: "#dc2626", fontSize: "16px" }}>{fSayi(tFisKalan)} ₺</b></div>
      </div>

      <div className="table-wrapper"><table className="tbl tbl-satis">
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={fisSort} setSort={setFisSort} filterType="fis_tarih" />
          <Th label={['borc', 'gider_dus', 'kasa_devir'].includes(satisFiltreTip) ? "AÇIKLAMA" : "BAYİ"} sortKey={['borc', 'gider_dus', 'kasa_devir'].includes(satisFiltreTip) ? "aciklama" : "bayi"} currentSort={fisSort} setSort={setFisSort} filterType="fis_bayi" />
          <Th label="TUTAR" sortKey="toplam_tutar" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="TAHS." sortKey="tahsilat" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="KALAN" sortKey="kalan_bakiye" currentSort={fisSort} setSort={setFisSort} align="right" />
          <Th label="KİŞİ" sortKey="ekleyen" currentSort={fisSort} setSort={setFisSort} align="center" />
          <th></th>
        </tr></thead>
        <tbody>{fFisList.map(f => (
          <tr key={f.id}>
            <td>{f.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold", minWidth: "120px", color: f.toplam_tutar === 0 && f.odeme_turu !== 'GİDER DÜŞ' && f.odeme_turu !== 'KASAYA DEVİR' ? "#8b5cf6" : (f.bayi === "SİSTEM İŞLEMİ" ? "#475569" : "inherit") }} className="truncate-text-td">
               {f.bayi === "SİSTEM İŞLEMİ" ? `${f.aciklama || f.odeme_turu}` : f.bayi}
            </td>
            <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{f.toplam_tutar === 0 ? "-" : fSayi(f.toplam_tutar)}</td>
            <td style={{ textAlign: "right", color: (f.odeme_turu === 'GİDER DÜŞ' || f.odeme_turu === 'KASAYA DEVİR') ? "#dc2626" : "#2563eb", fontWeight: "bold" }}>
               {(f.odeme_turu === 'GİDER DÜŞ' || f.odeme_turu === 'KASAYA DEVİR') && f.tahsilat > 0 ? "-" : ""}{fSayi(f.tahsilat)}
            </td>
            <td style={{ textAlign: "right", color: f.kalan_bakiye > 0 ? "#dc2626" : (f.kalan_bakiye < 0 ? "#059669" : "#64748b"), fontWeight: "bold" }}>{f.kalan_bakiye === 0 ? "-" : fSayi(f.kalan_bakiye)}</td>
            <td style={{ textAlign: "center", color: "#64748b" }}>{f.ekleyen || "-"}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'satis', id: f.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'satis' && openDropdown.id === f.id && (
                  <div className="dropdown-menu">
                     {f.bayi !== "SİSTEM İŞLEMİ" && <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); handleFisDetayGoster(f); }}>🔍</button>}
                     {f.bayi !== "SİSTEM İŞLEMİ" && <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); handleFisDuzenle(f); }}>✏️</button>}
                     <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={() => { setOpenDropdown(null); handleFisSil(f); }}>🗑️</button>
                  </div>
               )}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderAnaliz = () => (
    <div className="tab-fade-in main-content-area">
      <div className="compact-totals" style={{marginTop: "5px"}}>
        <div className="c-kutu" style={{ borderLeftColor: "#8b5cf6" }}><span>TOPLAM ADET/KG</span><b style={{ color: "#8b5cf6", fontSize: "16px" }}>{fSayi(tAnalizKg)}</b></div>
        <div className="c-kutu" style={{ borderLeftColor: "#8b5cf6" }}><span>TOPLAM TUTAR</span><b style={{ color: "#8b5cf6", fontSize: "16px" }}>{fSayi(tAnalizTutar)} ₺</b></div>
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

  const renderGider = () => (
    <div className="tab-fade-in main-content-area">
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
         <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden', flex: 1 }}>
            <button onClick={() => setGiderFiltreKisi('benim')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: giderFiltreKisi==='benim'?'#dc2626':'transparent', color: giderFiltreKisi==='benim'?'#fff':'#475569' }}>Benim</button>
            <button onClick={() => setGiderFiltreKisi('tumu')} style={{ flex: 1, padding: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', background: giderFiltreKisi==='tumu'?'#dc2626':'transparent', color: giderFiltreKisi==='tumu'?'#fff':'#475569' }}>Tümü</button>
         </div>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
        <button onClick={() => { setGiderForm({ tarih: bugun, tur: "Genel Gider", aciklama: "", tutar: "" }); setEditingGiderId(null); setIsGiderModalOpen(true); }} className="btn-anim m-btn" style={{background: "#dc2626", margin: 0, flex: 1, padding: "8px", fontSize: "13px", height: "36px"}}>➕ YENİ GİDER</button>
        <div className="c-kutu" style={{ borderLeftColor: "#dc2626", flex: 1.2, margin: 0, padding: "4px 8px", height: "36px", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{fontSize: "10px", margin: 0, color: "#64748b"}}>GÖSTERİLEN GİDER:</span>
          <b style={{ color: "#dc2626", fontSize: "16px" }}>{fSayi(fGTutarNormal)} ₺</b>
        </div>
      </div>
      <div className="table-wrapper"><table className="tbl" style={{borderTop: "3px solid #fca5a5"}}>
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="TÜR" sortKey="tur" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="TUTAR" sortKey="tutar" currentSort={giderSort} setSort={setGiderSort} align="right" />
          <Th label="AÇIKLAMA" sortKey="aciklama" currentSort={giderSort} setSort={setGiderSort} />
          <Th label="KİŞİ" sortKey="ekleyen" currentSort={giderSort} setSort={setGiderSort} align="center" />
          <th></th>
        </tr></thead>
        <tbody>{fGiderList.map(g => (
          <tr key={g.id}>
            <td>{g.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{ fontWeight: "bold" }}>{g.tur}</td>
            <td style={{ textAlign: "right", color: "#dc2626", fontWeight: "bold" }}>{fSayi(g.tutar)}</td>
            <td style={{ color: "#64748b" }} className="truncate-text-td">{g.aciklama}</td>
            <td style={{ textAlign: "center", color: "#64748b" }}>{g.ekleyen || "-"}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'gider', id: g.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'gider' && openDropdown.id === g.id && (
                  <div className="dropdown-menu">
                     <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingGiderId(g.id); setGiderForm(g as any); setIsGiderModalOpen(true); }}>✏️</button>
                     <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={async () => { setOpenDropdown(null); if(confirm("Sil?")){ await supabase.from("giderler").delete().eq("id", g.id); verileriGetir("gider"); } }}>🗑️</button>
                  </div>
               )}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const renderUretim = () => (
    <div className="tab-fade-in main-content-area">
      <div className="compact-totals" style={{marginBottom: "10px"}}>
         <div className="c-kutu" style={{ borderLeftColor: "#8b5cf6" }}><span>GİREN TOPLAM KG</span><b style={{ color: "#8b5cf6", fontSize: "16px" }}>{fSayi(periodUretim.reduce((a,b)=>a+Number(b.toplam_kg),0))} KG</b></div>
         <div className="c-kutu" style={{ borderLeftColor: "#dc2626" }}><span>MALİYET TOPLAM TL</span><b style={{ color: "#dc2626", fontSize: "16px" }}>{fSayi(tUretimMaliyet)} ₺</b></div>
      </div>
      
      <button onClick={() => { setUretimForm({ tarih: bugun, cig_sut: "", sut_fiyat: uretimSonFiyatlar.sut, sut_tozu: "", sut_tozu_fiyat: uretimSonFiyatlar.toz, tereyag: "", tereyag_fiyat: uretimSonFiyatlar.yag, katki_kg: "", katki_fiyat: uretimSonFiyatlar.katki, su: "", kova_3_adet: "", kova_3_fiyat: uretimSonFiyatlar.kova3, kova_5_adet: "", kova_5_fiyat: uretimSonFiyatlar.kova5, cikti_3kg: "", satis_3_fiyat: uretimSonFiyatlar.satis3, cikti_5kg: "", satis_5_fiyat: uretimSonFiyatlar.satis5, aciklama: "" }); setEditingUretimId(null); setIsUretimModalOpen(true); }} className="btn-anim m-btn" style={{background: "#8b5cf6"}}>➕ YENİ ÜRETİM GİRİŞİ</button>
      <div className="table-wrapper"><table className="tbl" style={{borderTop: "3px solid #c4b5fd"}}>
        <thead><tr>
          <Th label="TARİH" sortKey="tarih" currentSort={uretimSort} setSort={setUretimSort} />
          <Th label="GİREN (Özet)" sortKey="toplam_kg" currentSort={uretimSort} setSort={setUretimSort} />
          <Th label="3KG ÇIKTI" sortKey="cikti_3kg" currentSort={uretimSort} setSort={setUretimSort} align="center" />
          <Th label="5KG ÇIKTI" sortKey="cikti_5kg" currentSort={uretimSort} setSort={setUretimSort} align="center" />
          <Th label="MALİYET" sortKey="toplam_maliyet" currentSort={uretimSort} setSort={setUretimSort} align="right" />
          <Th label="KAR" sortKey="kar" currentSort={uretimSort} setSort={setUretimSort} align="right" />
          <Th label="AÇIKLAMA" sortKey="aciklama" currentSort={uretimSort} setSort={setUretimSort} />
          <th></th>
        </tr></thead>
        <tbody>{sortData(periodUretim, uretimSort).map(u => (
          <tr key={u.id}>
            <td>{u.tarih.split("-").reverse().slice(0, 2).join(".")}</td>
            <td style={{fontSize: "11px", color: "#1e293b", fontWeight: "bold"}}>
              {fSayi(u.toplam_kg)} KG
            </td>
            <td style={{ textAlign: "center", fontWeight: "bold" }}>{u.cikti_3kg} Ad</td>
            <td style={{ textAlign: "center", fontWeight: "bold" }}>{u.cikti_5kg} Ad</td>
            <td style={{ textAlign: "right", color: "#dc2626" }}>{fSayi(u.toplam_maliyet)} ₺</td>
            <td style={{ textAlign: "right", color: "#059669", fontWeight: "bold" }}>{fSayi(u.kar)} ₺</td>
            <td className="truncate-text-td" style={{maxWidth: "100px"}} onClick={(e) => { e.stopPropagation(); setUretimDetayData(u); }} title="Detay için tıklayın">{u.aciklama}</td>
            <td className="actions-cell" style={{position: 'relative'}}>
               <button onClick={(e) => { e.stopPropagation(); setOpenDropdown({ type: 'uretim', id: u.id as string }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 8px', color: '#64748b' }}>⋮</button>
               {openDropdown?.type === 'uretim' && openDropdown.id === u.id && (
                  <div className="dropdown-menu">
                     <button title="Görüntüle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setUretimDetayData(u); }}>🔍</button>
                     <button title="Düzenle" className="dropdown-item-icon" onClick={() => { setOpenDropdown(null); setEditingUretimId(u.id); setUretimForm(u as any); setIsUretimModalOpen(true); }}>✏️</button>
                     <button title="Sil" className="dropdown-item-icon" style={{ color: '#dc2626' }} onClick={async () => { setOpenDropdown(null); if(confirm("Sil?")){ await supabase.from("uretim").delete().eq("id", u.id); verileriGetir("uretim"); } }}>🗑️</button>
                  </div>
               )}
            </td>
          </tr>))}
        </tbody>
      </table></div>
    </div>
  );

  const aktifAyarListesi = activeAyarTab === 'musteriler' ? bayiler : (activeAyarTab === 'urunler' ? urunler : tedarikciler);
  const aktifTabloAdi = activeAyarTab === 'musteriler' ? 'bayiler' : (activeAyarTab === 'urunler' ? 'urunler' : 'ciftlikler');

  const renderAyarlar = () => (
    <div className="tab-fade-in main-content-area" style={{ display: "flex", gap: "15px", height: "calc(100vh - 160px)", minHeight: "400px" }}>
       {/* SOL MENÜ */}
       <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '110px', flexShrink: 0 }}>
          <button onClick={() => setActiveAyarTab('musteriler')} style={{ padding: '12px 8px', borderRadius: '8px', background: activeAyarTab==='musteriler'?'#0f172a':'#fff', color: activeAyarTab==='musteriler'?'#fff':'#475569', border: '1px solid #e2e8f0', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', fontSize: '12px', transition: 'all 0.2s' }}>Müşteriler</button>
          <button onClick={() => setActiveAyarTab('urunler')} style={{ padding: '12px 8px', borderRadius: '8px', background: activeAyarTab==='urunler'?'#0f172a':'#fff', color: activeAyarTab==='urunler'?'#fff':'#475569', border: '1px solid #e2e8f0', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', fontSize: '12px', transition: 'all 0.2s' }}>Ürünler</button>
          <button onClick={() => setActiveAyarTab('ciftlikler')} style={{ padding: '12px 8px', borderRadius: '8px', background: activeAyarTab==='ciftlikler'?'#0f172a':'#fff', color: activeAyarTab==='ciftlikler'?'#fff':'#475569', border: '1px solid #e2e8f0', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', fontSize: '12px', transition: 'all 0.2s' }}>Çiftlikler</button>
          
          <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
            <h4 style={{ margin: "0 0 5px", fontSize: '11px', color: '#64748b', textAlign: 'center' }}>Yazı Boyutu</h4>
            <input type="range" min="10" max="18" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: "100%", cursor: "pointer" }} />
          </div>
       </div>

       {/* SAĞ İÇERİK */}
       <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
             <input placeholder={`Yeni ${activeAyarTab.slice(0,-3)} ismi...`} value={yeniAyarDeger} onChange={e => setYeniAyarDeger(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px' }} />
             {activeAyarTab === 'urunler' && <input placeholder="Fiyat" type="number" value={yeniUrunFiyat} onChange={e=>setYeniUrunFiyat(e.target.value)} style={{ width: '70px', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px' }} />}
             <button onClick={handleAyarEkle} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '0 20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>Ekle</button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', paddingRight: '4px' }}>
             {aktifAyarListesi.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                   <span style={{ fontWeight: 'bold', color: '#475569', fontSize: '13px' }}>{item.isim} {activeAyarTab === 'urunler' && (item as Urun).fiyat ? `(${fSayi((item as Urun).fiyat)} ₺)` : ''}</span>
                   <button onClick={() => { if(confirm(`Silinecek: ${item.isim}`)) ayarIslem(aktifTabloAdi, null, "sil", item.id); }} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '4px', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '14px' }}>✕</button>
                </div>
             ))}
             {aktifAyarListesi.length === 0 && <div style={{textAlign: 'center', color: '#94a3b8', marginTop: '20px', fontSize: '13px'}}>Kayıt bulunamadı.</div>}

             {activeAyarTab === 'musteriler' && (
                <button onClick={handleTopluMusteriEkle} style={{background: '#8b5cf6', color: '#fff', padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginTop: '15px'}}>
                   📥 {topluMusteriler.length} Hazır Müşteriyi İçe Aktar
                </button>
             )}
          </div>
       </div>
    </div>
  );

  if (!session) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "20px", boxSizing: "border-box" }}>
        <form onSubmit={async (e) => { e.preventDefault(); const target = e.currentTarget as any; if (target.elements.remember.checked) localStorage.setItem('user', username); else localStorage.removeItem('user'); await supabase.auth.signInWithPassword({ email: username.includes("@") ? username : `${username}@sistem.local`, password }); }} style={{ background: "#fff", padding: "30px", borderRadius: "12px", width: "100%", maxWidth: "360px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
          <h2 style={{ margin: "0 0 8px", color: "#0f172a", textAlign: "center" }}>Sultanköy V4</h2><p style={{ margin: "0 0 24px", color: "#64748b", textAlign: "center", fontSize:"14px" }}>Yönetim Paneline Giriş Yapın</p>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Kullanıcı Adı" style={{ width: "100%", marginBottom: "16px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifre" style={{ width: "100%", marginBottom: "16px", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px", boxSizing: "border-box" }} />
          <label style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#64748b", cursor: "pointer", marginBottom: "20px" }}><input type="checkbox" id="remember" defaultChecked={!!localStorage.getItem('user')} /> Beni Hatırla</label>
          <button type="submit" style={{ width: "100%", padding: "12px", background: temaRengi, color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>Giriş Yap</button>
        </form>
      </div>
    );
  }
  
  return (
    <div className="app-container" style={{ fontSize: `${fontSize}px` }} onClick={closeAllDropdowns}>
      {/* YENİ HEADER TASARIMI */}
      <header className="header-style">
        <b style={{ color: temaRengi, fontSize: "18px", marginLeft: "10px" }}>SULTANKÖY V4</b>
        <div style={{display: 'flex', gap: '15px', alignItems: 'center', marginRight: '10px'}}>
           <select 
              value={aktifDonem} 
              onChange={e => {
                 if(e.target.value === "KAPAT") setIsDonemModalOpen(true);
                 else setAktifDonem(e.target.value);
              }} 
              className="m-inp" style={{padding: "2px 8px", height: "28px", fontSize: "12px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer"}}>
             {aylar.map(ay => <option key={ay} value={ay}>{ay.replace('-', ' / ')}</option>)}
             <option value="KAPAT">⚠️ Dönemi Kapat</option>
           </select>
           <span style={{fontSize: "13px", fontWeight: "bold", color: "#0f172a"}}>{username}</span>
           <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #fecaca", borderRadius: "50%", width: "32px", height: "32px", color: "#dc2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
             <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M7.5 1v7h1V1h-1z"/><path d="M3 8.812a4.999 4.999 0 0 1 2.578-4.375l-.485-.874A6 6 0 1 0 11 3.616l-.501.865A5 5 0 1 1 3 8.812z"/></svg>
           </button>
        </div>
      </header>

      <main className="main-content">
        {activeTab === "ozet" && renderOzet()}
        {activeTab === "sut" && renderSut()}
        {activeTab === "satis" && renderSatis()}
        {activeTab === "gider" && renderGider()}
        {activeTab === "uretim" && renderUretim()}
        {activeTab === "analiz" && renderAnaliz()}
        {activeTab === "ayarlar" && renderAyarlar()}

        {/* DÖNEM KAPAT MODALI */}
        {isDonemModalOpen && (
          <div style={{position: 'fixed', top:0, left:0, right:0, bottom:0, background: 'rgba(0,0,0,0.6)', zIndex: 1500, display:'flex', alignItems:'center', justifyContent:'center', padding: '10px'}}>
             <div style={{background:'#fff', padding:'20px', borderRadius:'10px', maxWidth:'300px', width:'100%', boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"}}>
                 <h3 style={{margin:'0 0 10px', color:'#dc2626', fontSize: '16px'}}>⚠️ Dönemi Kapat</h3>
                 <p style={{fontSize:'13px', color:'#475569', lineHeight:'1.4'}}>
                     Mevcut dönemi kapatıp yeni aya geçmek istediğinize emin misiniz?<br/><br/>
                     <span style={{fontSize: '11px', color: '#94a3b8'}}>(Yeni dönemde bakiyeler sıfırdan başlar, eski verilerinize üstteki menüden ulaşmaya devam edebilirsiniz.)</span>
                 </p>
                 <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', fontWeight:'bold', marginTop:'15px', cursor:'pointer', color: '#0f172a'}}>
                     <input type="checkbox" checked={donemOnay} onChange={e=>setDonemOnay(e.target.checked)} style={{width:'18px', height:'18px'}} />
                     Onaylıyorum
                 </label>
                 <div style={{display:'flex', gap:'8px', marginTop:'20px'}}>
                     <button onClick={()=>{setIsDonemModalOpen(false); setDonemOnay(false);}} style={{flex:1, padding:'10px', background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'6px', fontWeight:'bold', color:'#475569', cursor: 'pointer'}}>VAZGEÇ</button>
                     <button onClick={handleDonemKapat} disabled={!donemOnay} style={{flex:1, padding:'10px', background: donemOnay ? '#dc2626' : '#fca5a5', border:'none', borderRadius:'6px', fontWeight:'bold', color:'#fff', cursor: donemOnay ? 'pointer' : 'not-allowed'}}>EVET, KAPAT</button>
                 </div>
             </div>
          </div>
        )}

        {/* DİĞER İŞLEMLER MODALI (BORÇ/GİDER/KASA) */}
        {digerModalConfig.isOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px" }}>
            <div style={{ backgroundColor: "#fff", padding: "12px", borderRadius: "10px", width: "100%", maxWidth: "280px", display: "flex", flexDirection: "column", gap: "8px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: 0, color: "#0f172a", fontSize: "14px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>
                {digerModalConfig.type === 'gider_dus' ? '💸 Gider Düş' : digerModalConfig.type === 'borc' ? '📝 Borç Ekle' : '🏦 Kasaya Devir'}
              </h3>
              
              <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                <label style={{fontSize: '11px', color: '#64748b'}}>Tarih</label>
                <input type="date" value={digerForm.tarih} onChange={e => setDigerForm({...digerForm, tarih: e.target.value})} className="m-inp" style={{height: "28px", padding: "4px 8px"}} />
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                <label style={{fontSize: '11px', color: '#64748b'}}>Tutar (₺)</label>
                <input type="number" placeholder="0.00" value={digerForm.tutar} onChange={e => setDigerForm({...digerForm, tutar: e.target.value})} className="m-inp" style={{height: "28px", padding: "4px 8px", fontWeight: 'bold', color: '#0f172a'}} />
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                <label style={{fontSize: '11px', color: '#64748b'}}>Açıklama / Not</label>
                <input placeholder="Opsiyonel..." value={digerForm.aciklama} onChange={e => setDigerForm({...digerForm, aciklama: e.target.value})} className="m-inp" style={{height: "28px", padding: "4px 8px"}} />
              </div>

              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                 <button onClick={() => { setDigerModalConfig({isOpen: false, type: null}); setDigerForm({tarih: getLocalDateString(), tutar: "", aciklama: ""}); }} style={{ flex: 1, padding: "8px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "6px", color: "#475569", fontWeight: "bold", fontSize: "12px", cursor: 'pointer' }}>VAZGEÇ</button>
                 <button onClick={handleDigerIslemKaydet} style={{ flex: 1, padding: "8px", background: "#2563eb", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "bold", fontSize: "12px", cursor: 'pointer' }}>KAYDET</button>
              </div>
            </div>
          </div>
        )}

        {/* ÜRETİM DETAY MODALI */}
        {uretimDetayData && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1300, padding: "10px" }} onClick={() => setUretimDetayData(null)}>
            <div style={{ backgroundColor: "#f8fafc", borderRadius: "10px", width: "95vw", maxWidth: "360px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: "15px", textAlign: "center", borderBottom: "1px dashed #cbd5e1", background: "#fff", overflowY: "auto" }}>
                  <h3 style={{ margin: "0 0 5px", color: "#8b5cf6", fontSize: "16px" }}>🏭 Üretim Detayı</h3>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Tarih: {uretimDetayData.tarih.split("-").reverse().join(".")}</div>
                  
                  <div style={{textAlign: "left", marginTop: "15px"}}>
                     <h4 style={{fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0"}}>Giren Hammaddeler (Maliyet)</h4>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>Süt ({fSayi(uretimDetayData.cig_sut)} kg x {fSayi(uretimDetayData.sut_fiyat)})</span><b>{fSayi(Number(uretimDetayData.cig_sut)*Number(uretimDetayData.sut_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>Toz ({fSayi(uretimDetayData.sut_tozu)} kg x {fSayi(uretimDetayData.sut_tozu_fiyat)})</span><b>{fSayi(Number(uretimDetayData.sut_tozu)*Number(uretimDetayData.sut_tozu_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>Yağ ({fSayi(uretimDetayData.tereyag)} kg x {fSayi(uretimDetayData.tereyag_fiyat)})</span><b>{fSayi(Number(uretimDetayData.tereyag)*Number(uretimDetayData.tereyag_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>Katkı ({fSayi(uretimDetayData.katki_kg)} kg x {fSayi(uretimDetayData.katki_fiyat)})</span><b>{fSayi(Number(uretimDetayData.katki_kg)*Number(uretimDetayData.katki_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>Su ({fSayi(uretimDetayData.su)} kg)</span><b>-</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>3'lük Kova ({fSayi(uretimDetayData.kova_3_adet)} Ad x {fSayi(uretimDetayData.kova_3_fiyat)})</span><b>{fSayi(Number(uretimDetayData.kova_3_adet)*Number(uretimDetayData.kova_3_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>5'lik Kova ({fSayi(uretimDetayData.kova_5_adet)} Ad x {fSayi(uretimDetayData.kova_5_fiyat)})</span><b>{fSayi(Number(uretimDetayData.kova_5_adet)*Number(uretimDetayData.kova_5_fiyat))} ₺</b></div>
                  </div>

                  <div style={{textAlign: "left", marginTop: "15px"}}>
                     <h4 style={{fontSize: "12px", margin: "0 0 5px", color: "#475569", borderBottom: "1px solid #e2e8f0"}}>Çıkan Ürünler (Değer)</h4>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>3 KG Yoğurt ({uretimDetayData.cikti_3kg} Ad x {fSayi(uretimDetayData.satis_3_fiyat)})</span><b>{fSayi(Number(uretimDetayData.cikti_3kg)*Number(uretimDetayData.satis_3_fiyat))} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '3px 0'}}><span>5 KG Yoğurt ({uretimDetayData.cikti_5kg} Ad x {fSayi(uretimDetayData.satis_5_fiyat)})</span><b>{fSayi(Number(uretimDetayData.cikti_5kg)*Number(uretimDetayData.satis_5_fiyat))} ₺</b></div>
                  </div>

                  <div style={{textAlign: "left", marginTop: "15px", borderTop: "2px solid #e2e8f0", paddingTop: "10px"}}>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0', color: '#dc2626'}}><span>Toplam Maliyet:</span><b>{fSayi(uretimDetayData.toplam_maliyet)} ₺</b></div>
                     <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '3px 0', color: '#059669', fontWeight: 'bold'}}><span>Tahmini Kar:</span><b>{fSayi(uretimDetayData.kar)} ₺</b></div>
                  </div>
              </div>
              <div style={{ padding: "10px" }}>
                 <button onClick={() => setUretimDetayData(null)} style={{ width: "100%", padding: "10px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", fontWeight: "bold", color: "#475569", cursor: "pointer" }}>KAPAT</button>
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
        {[{ id: "ozet", i: "📊" }, { id: "sut", i: "🥛" }, { id: "uretim", i: "🏭" }, { id: "satis", i: "💰" }, { id: "gider", i: "💸" }, { id: "analiz", i: "📈" }, { id: "ayarlar", i: "⚙️" }].map(item => (
          <button key={item.id} onClick={() => { setActiveTab(item.id); setEditingSutId(null); setIsSutModalOpen(false); setIsFisModalOpen(false); setIsTahsilatModalOpen(false); setIsGiderModalOpen(false); setIsUretimModalOpen(false); setOpenDropdown(null); setIsDigerUstOpen(false); setIsDigerFiltreOpen(false); }} className={`n-item btn-anim ${activeTab === item.id ? 'active' : ''}`} style={activeTab === item.id ? { color: item.id === 'analiz' ? '#8b5cf6' : item.id === 'gider' ? '#dc2626' : item.id === 'uretim' ? '#8b5cf6' : temaRengi, borderTopColor: item.id === 'analiz' ? '#8b5cf6' : item.id === 'gider' ? '#dc2626' : item.id === 'uretim' ? '#8b5cf6' : temaRengi } : {}}>
            <span style={{ fontSize: "16px", marginBottom: "2px" }}>{item.i}</span><span style={{ fontSize: "9px", fontWeight: "bold" }}>{item.id.toUpperCase()}</span>
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
        
        /* ÖZEL İNCELTİLMİŞ INPUTLAR */
        .small-inp { padding: 2px 4px !important; font-size: 11px !important; height: 24px !important; }
        .micro-inp { text-align: center; }
        .micro-inp-right { text-align: right; }

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
        
        /* AÇILIR MENÜ (DROPDOWN) LİSTELERİ */
        .dropdown-menu-list { position: absolute; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 50; display: flex; flex-direction: column; padding: 4px; min-width: 100px; }
        .dropdown-menu-list .dropdown-item { padding: 8px 12px; text-align: left; background: none; border: none; font-size: 12px; font-weight: bold; color: #475569; cursor: pointer; width: 100%; border-radius: 4px; }
        .dropdown-menu-list .dropdown-item:hover { background: #f1f5f9; }

        /* YATAY İKONLU 3 NOKTA MENÜSÜ (Taşmayı Engellemek İçin) */
        .dropdown-menu { position: absolute; right: 30px; top: 50%; transform: translateY(-50%); background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); z-index: 100; display: flex; flex-direction: row; padding: 4px; gap: 8px; }
        .dropdown-item-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 6px; border-radius: 4px; transition: background 0.1s; display: flex; align-items: center; justify-content: center;}
        .dropdown-item-icon:hover { background: #f1f5f9; }

        .truncate-text-td { max-width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }

        .fixed-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 1000px; height: 60px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; z-index: 100; padding: 0 4px; }
        .n-item { flex: 1; border: none; background: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; border-top: 3px solid transparent; padding: 0 2px; }
        .n-item.active { background: #f8fafc; }
        .btn-anim { transition: transform 0.1s; } .btn-anim:active { transform: scale(0.95); }

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
          .n-item { padding: 0; }
          .n-item span:first-child { font-size: 14px !important; }
          .n-item span:last-child { font-size: 8px !important; letter-spacing: -0.5px; }
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
