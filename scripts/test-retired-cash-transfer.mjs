import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const current = fs.readFileSync('src/App.tsx', 'utf8');
const previous = execFileSync('git', ['show', '776e53f:src/App.tsx'], { encoding: 'utf8' });
const extract = source => source.slice(source.indexOf('const fisPersonelDevirMi ='), source.indexOf('const fisTahsilatMi ='));
const normalizeUsername = s => (s || '').trim().toLowerCase().replace('@sistem.local', '');
const calculator = source => {
  const scope = {
    normalizeUsername, adminMi: s => normalizeUsername(s) === 'admin',
    odemeTurunuNormalizeEt: s => (s || '').toLocaleUpperCase('tr-TR'),
    fisDonemDevirMi: f => ['DEVIR', 'DEVİR'].includes(f.odeme_turu),
  };
  vm.runInNewContext(ts.transpileModule(extract(source) + '\nglobalThis.calculate = personelBakiyeleriniHesapla;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, scope);
  return scope.calculate;
};
// Üretim verilerini sadece okur; hiçbir kaydı, migration'ı veya devri değiştirmez.
const python = `
from pathlib import Path
import psycopg,json
from psycopg.rows import dict_row
cfg=dict(l.split('=',1) for l in Path('HESAPLAR.env').read_text(encoding='utf-8').splitlines() if '=' in l and not l.lstrip().startswith('#'))
with psycopg.connect(cfg['SUPABASE_DB_URL'].strip().strip(chr(34)), row_factory=dict_row, options='-c default_transaction_read_only=on') as c:
 with c.cursor() as q:
  q.execute('select * from satis_fisleri order by tarih,id')
  receipts=q.fetchall()
  q.execute('select * from giderler order by tarih,id')
  expenses=q.fetchall()
  print(json.dumps(dict(receipts=receipts,expenses=expenses),default=str,ensure_ascii=True))
`;
const data = JSON.parse(execFileSync('python', ['-c', python], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const oldCalc = calculator(previous);
const newCalc = calculator(current);
const months = [...new Set(data.receipts.map(f => f.tarih.slice(0, 7)))].sort();
for (const month of months) {
  const receipts = data.receipts.filter(f => f.tarih.slice(0, 7) <= month);
  const expenses = data.expenses.filter(g => g.tarih.slice(0, 7) <= month);
  assert.equal(JSON.stringify(newCalc(receipts, expenses)), JSON.stringify(oldCalc(receipts, expenses)), `historical balances: ${month}`);
}
// Özetteki hesap ve satış neti birebir aynı kalmalı.
for (const [start, end] of [
  ['  const personelOzetleri = useMemo', '  const sekmeSecenekleri ='],
  ['  const tKasayaDevir = useMemo', '  const fFisList = useMemo'],
]) {
  const block = s => s.slice(s.indexOf(start), s.indexOf(end)).replace(/\r\n/g, '\n');
  assert.equal(block(current), block(previous), start);
}
const sales = fs.readFileSync('src/components/SatisPanel.tsx', 'utf8');
for (const removed of ['digerModalConfig', 'digerForm', 'handleKasaDevir', 'onOpenNewKasaDevir', 'kasa_devir']) {
  assert.ok(!current.includes(removed) && !sales.includes(removed), `retired flow: ${removed}`);
}
assert.ok(!sales.includes('KASA DEVİR') && !sales.includes('tKasayaDevir'));
assert.ok(current.includes('!fisKasayaDevirMi(f)')); // eski kayıt satış/tahsilat sayılmaz
// Gerçek satış bileşenini render et: buton/filtre/mini kart görünmemeli.
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(sales, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module, exports: module.exports, require: createRequire(import.meta.url) });
const noop = () => {};
const html = renderToStaticMarkup(React.createElement(module.exports.SatisPanel, {
  aktifDonem: '2026-10', satisFiltreTip: 'tumu', setSatisFiltreTip: noop,
  satisFiltreKisi: 'herkes', setSatisFiltreKisi: noop,
  fFisList: [], periodSatisList: [], satisVerisiYukleniyor: false,
  satisFisToplamBorcMap: {}, fisSort: { key: 'tarih', direction: 'desc' }, setFisSort: noop,
  fisFiltre: { bayiler: [], baslangic: '', bitis: '' }, setFisFiltre: noop,
  tFisToplam: 100, tFisTahsilatRaw: 80, tKullaniciGider: 10, tNetTahsilat: 70, tFisKalan: 20,
  bugun: '2026-10-03', dun: '2026-10-02', temaRengi: '#0f766e', bayiler: [],
  actions: { onOpenNewFis: noop, onOpenNewTahsilat: noop }, visibility: {},
  helpers: { fSayiNoDec: value => String(value) },
}));
assert.ok(!/kasa|kasaya/i.test(html));
assert.ok(html.includes('NET') && html.includes('TAHSİLAT') && html.includes('70'));
console.log(`PASS: retired UI/save flow absent; live historical balances identical across ${months.length} periods; summary and sales net unchanged`);
