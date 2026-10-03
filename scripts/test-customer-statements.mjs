import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const block = (start, end) => {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return app.slice(a, b);
};
const data = JSON.parse(execFileSync('python', ['-c', `
from pathlib import Path
import json,psycopg
from psycopg.rows import dict_row
cfg=dict(l.split('=',1) for l in Path('HESAPLAR.env').read_text(encoding='utf-8').splitlines() if '=' in l and not l.lstrip().startswith('#'))
with psycopg.connect(cfg['SUPABASE_DB_URL'].strip().strip(chr(34)),options='-c default_transaction_read_only=on',row_factory=dict_row) as c:
 with c.cursor() as q:
  result={}
  for k,t in [('bayiler','bayiler'),('fisler','satis_fisleri'),('satirlar','satis_giris')]:
   q.execute('select * from '+t+' order by id');result[k]=q.fetchall()
  q.execute("select * from app_satis_account_balances('2026-11-01',null,null)")
  result['bakiyeler']=q.fetchall()
  print(json.dumps(result,default=str,ensure_ascii=True))
`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));

const scope = {
  useMemo: fn => fn(), useCallback: fn => fn,
  bayiler: data.bayiler, urunler: [], bayiGrupSecimModal: null,
  musteriBakiyeList: data.bakiyeler, tumSatisFisList: data.fisler,
  sayiDegeri: x => Number(x) || 0, gorunenFisNoOlustur: f => f.fis_no,
  fisSistemKaydiMi: f => f.bayi === 'SİSTEM İŞLEMİ',
  birOncekiDonemiGetir: month => {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  },
};
const source = [
  block('const satisFisleriniSirala =', 'const donemSatisEtiketiGetir ='),
  block('  const masterKayitIsminiNormalizeEt =', '  const eslesenKayitIdBul ='),
  block('  const tumBayiler =', '  const satisSatiriBayiAnahtariGetir ='),
  block('  const hesaplaMusteriBakiyeleri =', '  const bayiSecimModalAc ='),
  block('  const bayiBorclari =', '  const musteriBakiyeMap ='),
  block('  const musteriEkstreHesapla =', '  const handleMusteriEkstreAc ='),
  'globalThis.result={bayiBorclari,calculate:musteriEkstreHesapla,key:hesapAnahtariOlustur};',
].join('\n');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
const { result } = scope;
let tested = 0;
for (const customer of result.bayiBorclari) {
  const statement = result.calculate(customer.anahtar, customer.isim, '2026-10', data.satirlar);
  assert.ok(statement.hareketler.length || Math.abs(statement.devredenBorc) > 0.01, `Empty statement: ${customer.isim}`);
  const balance = statement.devredenBorc + statement.hareketler.reduce((n, f) => n + f.fistenKalanBorc, 0);
  assert.ok(Math.abs(balance - customer.borc) < 0.01, `Balance mismatch: ${customer.isim}: ${balance} / ${customer.borc}`);
  tested++;
}
const idris = result.bayiBorclari.find(x => x.isim === 'Cizre Bayi İdris');
assert.ok(idris);
const statement = result.calculate(idris.anahtar, idris.isim, '2026-10', data.satirlar);
assert.equal(statement.devredenBorc, 55000);
assert.equal(statement.hareketler.length, 0);
assert.ok(statement.oncekiDonemDetayiVar);

// Future labels/SQL key formats cannot choose a different key for the debt-list button.
for (const label of ['İDRİS', 'IŞIK', 'Şahin Et Oğlaklı', 'Çığ Köyü', 'Ürün Ödemesi', ' İdris  Market ', 'i\u0307dris']) {
  const extraScope = { ...scope, musteriBakiyeList: [{account_key:'hesap:unrelated-server-key',account_label:label,balance:1}] };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, extraScope);
  assert.equal(extraScope.result.bayiBorclari[0].anahtar, extraScope.result.key(label));
}
for (const month of ['2026-11', '2027-01', '2028-02']) {
  const label = 'İDRİS ŞUBE', group = 'İDRİS GRUBU';
  const nextScope = { ...scope,
    bayiler: [{id:'future-member',isim:label,hesap_grubu:group}],
    musteriBakiyeList: [{account_key:'hesap:i\u0307dri\u0307s grubu',account_label:group,balance:57500}],
    tumSatisFisList: [
      {id:1,tarih:`${month}-01`,bayi:group,bayi_id:null,odeme_turu:'DEVİR',kalan_bakiye:55000},
      {id:2,tarih:`${month}-02`,bayi:label,bayi_id:'future-member',fis_no:'FUTURE',odeme_turu:'PEŞİN',toplam_tutar:3000,tahsilat:500,kalan_bakiye:2500},
    ],
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, nextScope);
  const customer = nextScope.result.bayiBorclari[0];
  const futureStatement = nextScope.result.calculate(customer.anahtar,customer.isim,month,[]);
  assert.equal(futureStatement.devredenBorc,55000);
  assert.equal(futureStatement.hareketler.length,1);
  assert.equal(futureStatement.devredenBorc+futureStatement.hareketler[0].fistenKalanBorc,57500);
}
console.log(`PASS: real statement code, ${tested} live debtor accounts with matching balances; Idris opening 55000; Turkish/future labels use one key; database read-only`);
