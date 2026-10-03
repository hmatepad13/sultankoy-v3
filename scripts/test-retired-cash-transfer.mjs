import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const current = fs.readFileSync('src/App.tsx', 'utf8');
const sales=fs.readFileSync("src/components/SatisPanel.tsx","utf8");
for(const removed of ["fisKasayaDevirMi","personelBakiyeleriniHesapla","tKasayaDevir","kasa_devir","kasayaDevir","acikBakiye"]) assert.ok(!current.includes(removed)&&!sales.includes(removed),removed);
assert.ok(current.includes('supabase.rpc("app_net_balance"'));
assert.ok(!current.includes("personelDevirFisleri"));
assert.ok(!fs.existsSync("src/lib/backup.ts"));
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
console.log("PASS: legacy calculation paths absent; real sales UI keeps Net without retired controls");
