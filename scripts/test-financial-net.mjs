import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/utils/para.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { paraGirdisiniTemizle: temizle, paraGirdisiniSayiyaCevir: sayi } = context.exports;
for (const [input, expected] of [
  ['1.234,56', 1234.56], ['1234.56', 1234.56], ['12.5', 12.5],
  ['12,50', 12.5], ['-12,50', -12.5], ['1.234', 1234], ['1.234.567', 1234567],
  ['1000', 1000], ['', 0], ['0,05', 0.05], ['1234,', 1234], ['1.234.567,89', 1234567.89],
]) {
  assert.equal(sayi(input), expected, input);
  const state = temizle(input);
  assert.equal(temizle(state), state, `idempotent: ${input}`);
  assert.equal(sayi(state), expected, `form -> save: ${input}`);
}
assert.equal(temizle('12,'), '12.');

// Gercek ekran helper'i: acilis, kasa devri ve gider siralama regresyonu.
const app = fs.readFileSync('src/App.tsx', 'utf8');
// Satış tahsilatı, ayrı tahsilat ve kasa devrinin gerçek ortak input formatter'ı.
const formatterCode = app.slice(app.indexOf('  const paraGirdisiniFormatla ='), app.indexOf('  const hesaplaFisGosterimKg ='));
const formatterScope = { paraGirdisiniTemizle: temizle };
vm.runInNewContext(ts.transpileModule(formatterCode + '\nglobalThis.formatInput = paraGirdisiniFormatla;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, formatterScope);
for (const field of ['fisUst.tahsilat', 'tahsilatForm.miktar']) {
  assert.ok(app.includes(`value={paraGirdisiniFormatla(${field})}`), `input binding: ${field}`);
  for (const [typed, expected] of [['56500', 56500], ['10000', 10000], ['123456', 123456], ['56500,25', 56500.25], ['12,50', 12.5]]) {
    let state = '';
    for (const digit of typed) state = temizle(formatterScope.formatInput(state) + digit);
    assert.equal(sayi(state), expected, `${field} typing: ${typed}`);
  }
}
assert.equal(formatterScope.formatInput(''), '');
assert.equal(formatterScope.formatInput('56500'), '56500');
assert.equal(formatterScope.formatInput('12.50'), '12,50');

const normalizeUsername = s => (s || '').trim().toLowerCase().replace('@sistem.local', '');
// Satış kartının gerçek gider hesabı: tarih ve Benim/Herkes kapsamı.
const expenseExpression = app.slice(app.indexOf('  const tKullaniciGider = useMemo('), app.indexOf('  const tNetTahsilat ='));
const cardContext = {
  normalizeUsername, useMemo: fn => fn(), aktifKullaniciKisa: 'umit',
  satisFiltreKisi: 'benim', fisFiltre: { baslangic: '', bitis: '', bayiler: [] },
  periodGider: [
    { tarih: '2026-10-01', ekleyen: 'umit@sistem.local', tutar: 100 },
    { tarih: '2026-10-02', ekleyen: 'umit', tutar: 40 },
    { tarih: '2026-10-03', ekleyen: 'umit', tutar: 20 },
    { tarih: '2026-10-03', ekleyen: 'admin', tutar: 30 },
  ],
};
const cardScript = ts.transpileModule(expenseExpression + '\nglobalThis.cardExpense = tKullaniciGider;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const cardExpense = () => {
  const scope = { ...cardContext };
  vm.runInNewContext(cardScript, scope);
  return scope.cardExpense;
};
for (const [start, end, mine, everyone] of [
  ['', '', 160, 190], // Bu Ay
  ['2026-10-03', '2026-10-03', 20, 50], // Bugün
  ['2026-10-02', '2026-10-02', 40, 40], // Dün
  ['2026-10-02', '2026-10-03', 60, 90], // Özel aralık, sınırlar dahil
  ['2026-10-04', '', 0, 0],
  ['', '2026-10-01', 100, 100],
]) {
  cardContext.fisFiltre = { baslangic: start, bitis: end, bayiler: ['Örnek bayi'] };
  cardContext.satisFiltreKisi = 'benim';
  assert.equal(cardExpense(), mine, `Benim ${start}..${end}`);
  cardContext.satisFiltreKisi = 'herkes';
  assert.equal(cardExpense(), everyone, `Herkes ${start}..${end}`);
}
cardContext.aktifKullaniciKisa = 'admin';
cardContext.fisFiltre = { baslangic: '', bitis: '', bayiler: [] };
cardContext.satisFiltreKisi = 'benim';
assert.equal(cardExpense(), 30);
cardContext.satisFiltreKisi = 'herkes';
assert.equal(cardExpense(), 190);
const summaryBlock = app.slice(app.indexOf("  const personelOzetleri = useMemo"), app.indexOf("  const sekmeSecenekleri ="));
const summaryScope = {useMemo:fn=>fn(),normalizeUsername,aktifDonem:"2026-10",netBakiye:{donem:"2026-10",net:817365},
fisDevirMi:()=>false,fisSistemKaydiMi:()=>false,periodSatisFis:[{fis_no:"F1",ekleyen:"umit",toplam_tutar:100,tahsilat:80}],
periodSatisList:[],periodGider:[{ekleyen:"umit",tutar:10}],devredenBorcSatiriMi:()=>false,satisSatiriUrunAdiGetir:s=>s.urun};
const summaryJs=ts.transpileModule(summaryBlock+"\nglobalThis.summary=personelOzetleri;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(summaryJs,summaryScope);
assert.equal(summaryScope.summary[0].net,817365);
assert.equal(summaryScope.summary[0].satis,100);
assert.equal(summaryScope.summary[0].gider,10);
assert.ok(!("acikBakiye" in summaryScope.summary[0]));
const stale={...summaryScope,netBakiye:{donem:"2026-09",net:999}};
vm.runInNewContext(summaryJs,stale);assert.equal(stale.summary.length,0);
const panel = fs.readFileSync('src/components/GiderPanel.tsx', 'utf8');
// Gerçek input value ifadesi ile tuş tuş yazım; binlik ayırıcı yeniden parse edilmemeli.
const inputValue = panel.match(/inputMode="decimal" value=\{(.*?)\} onChange/)[1];
const inputDisplay = new Function('giderForm', `return ${inputValue};`);
for (const [typed, expected] of [['56500', 56500], ['1234567', 1234567], ['56500,25', 56500.25], ['12,50', 12.5]]) {
  let state = '';
  for (const digit of typed) state = temizle(inputDisplay({ tutar: state }) + digit);
  assert.equal(sayi(state), expected, `expense typing: ${typed}`);
}
assert.equal(inputDisplay({ tutar: 56500 }), '56500');
assert.equal(inputDisplay({ tutar: 12.5 }), '12,5');
assert.equal(sayi(temizle('56.500')), 56500);
const handler = panel.slice(panel.indexOf('  const handleGiderKaydet ='), panel.indexOf('  const handleGiderSil ='));
let updateBody;
let saves = 0;
let finish;
const savingRef = { current: false };
const formContext = {
  giderKaydediliyorRef: savingRef, setGiderKaydediliyor: () => {},
  giderForm: { tarih: '2026-10-01', tur: 'Genel Gider', tutar: '12.50', created_at: 'old-date', ekleyen: 'umit@sistem.local' },
  periodGider: [{ id: 42, ekleyen: 'umit@sistem.local' }], editingGiderId: 42,
  kaydiDuzenleyebilirMi: () => true, aktifDonemDisiKayitOnayMetni: () => '', aktifDonem: '2026-10',
  giderGorselMevcutYol: '', giderGorseliYukle: async () => null,
  aktifKullaniciEposta: 'admin@sistem.local', helpers: { paraGirdisiniSayiyaCevir: sayi },
  handleGiderModalKapat: () => {}, onRefreshGiderler: async () => {},
  alert: message => { throw new Error(message); },
  supabase: { from: () => ({ update: body => {
    updateBody = body; saves++;
    return { eq: () => new Promise(resolve => { finish = resolve; }) };
  } }) },
};
vm.runInNewContext(ts.transpileModule(handler + '\nglobalThis.save = handleGiderKaydet;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, formContext);
const firstSave = formContext.save();
await Promise.resolve();
await formContext.save();
assert.equal(saves, 1, 'double click');
assert.equal(updateBody.ekleyen, 'umit@sistem.local', 'admin must not take ownership');
assert.equal(updateBody.tutar, 12.5);
assert.equal('created_at' in updateBody, false);
finish({ error: null });
await firstSave;
assert.equal(savingRef.current, false);
console.log('PASS: money inputs, single Net summary, stale-period protection, expense ownership/double-submit');
