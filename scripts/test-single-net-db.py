"""Production-connected validation; all changes ALWAYS rolled back. --apply commits migration only."""
from pathlib import Path
from decimal import Decimal
import json
import sys
import psycopg

cfg = dict(l.split('=', 1) for l in Path('HESAPLAR.env').read_text(encoding='utf-8').splitlines() if '=' in l and not l.lstrip().startswith('#'))
c = psycopg.connect(cfg['SUPABASE_DB_URL'].strip().strip('"'))
try:
    with c.cursor() as q:
        q.execute('lock table satis_fisleri,satis_giris,giderler in share mode')
        def records():
            result = []
            for t in ['satis_fisleri', 'satis_giris', 'giderler', 'sut_giris', 'uretim', 'bayiler']:
                q.execute("select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from " + t + ' t')
                result.append(q.fetchone()[0])
            return result
        def customers():
            q.execute("select d,account_key,balance from generate_series('2026-04-01'::date,'2026-11-01'::date,'1 month') d cross join lateral app_satis_account_balances(d::date,null,null) order by d,account_key")
            return q.fetchall()
        original = records()
        debts = customers()
        q.execute("select net_balance from app_personel_net_after_expenses('2026-11-01') where personel_key='umit'")
        expected = q.fetchone()[0]
        q.execute("select p.id,u.email from profiles p join auth.users u on p.id=u.id where app_normalize_username(p.username)='umit'")
        actor, email = q.fetchone()
        if '--installed' not in sys.argv:
            migration = Path('supabase/migrations/20261003170000_single_net_baseline.sql').read_text(encoding='utf-8')
            q.execute(migration)
            q.execute(migration)
        assert records() == original, 'Migration changed original financial records'
        assert customers() == debts, 'Customer balances changed'
        q.execute("select net_balance from app_personel_net_after_expenses('2026-11-01')")
        assert q.fetchone()[0] == expected, 'Current Net changed'
        if '--apply' in sys.argv:
            c.commit()
            print('APPLIED: records, customer balances and current Net unchanged', expected)
            sys.exit(0)
        q.execute('savepoint workflow')
        q.execute("select set_config('request.jwt.claim.sub',%s,true),set_config('request.jwt.claims',%s,true)", (str(actor), json.dumps({'sub': str(actor), 'email': email, 'role': 'authenticated'})))
        q.execute('set local role authenticated')
        q.execute("select net_balance from app_net_balance('2026-11-01')")
        assert q.fetchone()[0] == expected
        q.execute("select app_close_period('2026-10')")
        q.execute("select app_close_period('2026-11')")
        q.execute('reset role')
        def carries(amount):
            q.execute("select toplam_tutar,kalan_bakiye from satis_fisleri where tarih>='2026-11-01' and bayi='SİSTEM İŞLEMİ' and odeme_turu='PERSONEL DEVİR' order by tarih")
            result = q.fetchall()
            assert len(result) == 2 and all(r == (amount, Decimal(0)) for r in result), result
        carries(expected)
        q.execute('set local role authenticated')
        q.execute("insert into giderler(tarih,tur,tutar,ekleyen,created_by) values('2026-10-03','Genel Gider',12.5,%s,%s) returning id", (email, actor))
        gid = q.fetchone()[0]
        q.execute('reset role')
        carries(expected - Decimal('12.5'))
        q.execute('set local role authenticated')
        q.execute('update giderler set tutar=20 where id=%s', (gid,))
        q.execute('reset role')
        carries(expected - 20)
        q.execute('delete from giderler where id=%s', (gid,))
        carries(expected)
        q.execute("select app_close_period_core('2026-09',%s,%s)", (actor, email))
        carries(expected)
        assert customers() == debts, 'Workflow changed customer balances'
        # Old-client insert must fail at the database, without changing anything.
        q.execute('savepoint forbidden')
        q.execute('set local role authenticated')
        try:
            q.execute("insert into satis_fisleri(fis_no,tarih,bayi,toplam_tutar,tahsilat,kalan_bakiye,odeme_turu,ekleyen,created_by) values('AUDIT-'||gen_random_uuid()::text,'2026-10-03','SİSTEM İŞLEMİ',0,1,0,'KASAYA DEVİR',%s,%s)", (email, actor))
            raise AssertionError('Retired operation accepted')
        except psycopg.errors.RaiseException:
            q.execute('rollback to savepoint forbidden')
        q.execute('reset role')
        # SECURITY DEFINER save RPC must not bypass the archived-system guard.
        q.execute('savepoint forbidden_rpc')
        q.execute('set local role authenticated')
        try:
            q.execute("select * from app_save_satis_fisi(p_tarih=>'2026-10-03',p_bayi=>'SİSTEM İŞLEMİ',p_tahsilat=>1,p_odeme_turu=>'KASAYA DEVİR',p_detaylar=>'[{\"urun\":\"AUDIT\",\"tutar\":0}]'::jsonb)")
            raise AssertionError('RPC bypassed retired-operation guard')
        except psycopg.errors.RaiseException:
            q.execute('rollback to savepoint forbidden_rpc')
        q.execute('reset role')
        q.execute('rollback to savepoint workflow')
        assert records() == original
        assert customers() == debts
        print('PASS: idempotence, fingerprints, customer balances, unchanged Net, authenticated RPC, two-month carry, expenses, archived close, retired insert denied; Net', expected)
finally:
    c.rollback()
    c.close()
    print('Test changes rolled back (unless --apply explicitly committed migration).')
