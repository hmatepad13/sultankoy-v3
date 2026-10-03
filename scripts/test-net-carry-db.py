"""Production-connected transaction test. ALWAYS rolls back, including DDL.

python scripts/test-net-carry-db.py [--installed]
Without --installed also tests the migration before applying it permanently.
"""
from pathlib import Path
from decimal import Decimal
import json
import re
import sys
import psycopg
from psycopg.rows import dict_row

cfg = dict(line.split('=', 1) for line in Path('HESAPLAR.env').read_text(encoding='utf-8').splitlines()
           if '=' in line and not line.lstrip().startswith('#'))
c = psycopg.connect(cfg['SUPABASE_DB_URL'].strip().strip('"'), row_factory=dict_row)
try:
    with c.cursor() as q:
        q.execute('lock table public.satis_fisleri,public.satis_giris,public.giderler in share mode')

        def fingerprints():
            result = {}
            for table in ['satis_fisleri', 'satis_giris', 'giderler', 'personel_net_mutabakatlari', 'personel_hesap_kapanislari']:
                q.execute("select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) hash from public." + table + ' t')
                result[table] = q.fetchone()['hash']
            return result

        initial = fingerprints()
        q.execute("select account_key,balance from app_satis_account_balances('2026-11-01',null,null) order by account_key")
        customer_balances = q.fetchall()
        migration = Path('supabase/migrations/20261003140000_carry_net_after_expenses.sql').read_text(encoding='utf-8')
        if '--installed' not in sys.argv:
            q.execute(migration)
            assert fingerprints() == initial, 'Migration changed financial records'
            q.execute(migration)
            assert fingerprints() == initial, 'Migration is not idempotent'
            retirement = Path('supabase/migrations/20261003150000_retire_personnel_open_balance.sql').read_text(encoding='utf-8')
            q.execute(retirement)
            q.execute(retirement)
            assert fingerprints() == initial, 'Personnel retirement changed historical records'

        q.execute("select id,username from profiles where app_normalize_username(username)='umit'")
        actor = q.fetchone()
        assert actor, 'Umit profile missing'
        q.execute("select * from satis_fisleri where tarih<'2026-11-01' order by tarih,id")
        rows = q.fetchall()
        q.execute("select * from giderler where tarih<'2026-11-01' order by tarih,id")
        expenses = q.fetchall()
        norm = lambda s: (s or '').strip().lower().replace('@sistem.local', '')
        events = []
        for r in rows:
            reset = r['odeme_turu'] in ('PERSONEL DEVIR', 'PERSONEL DEVİR') and r['bayi'] == 'SİSTEM İŞLEMİ'
            owner = norm(re.search(r'\((.*?)\)', r['aciklama']).group(1)) if reset else norm(r['ekleyen'])
            if owner == 'umit':
                events.append((r['tarih'], 0 if reset else 1, r['id'], reset, r))
        for g in expenses:
            if norm(g['ekleyen']) == 'umit':
                events.append((g['tarih'], 2, g['id'], False, g))
        expected = Decimal(0)
        for _, kind, _, reset, r in sorted(events, key=lambda e: e[:3]):
            if kind == 2:
                expected -= r['tutar']
            elif reset:
                expected = r['toplam_tutar']
            elif r['odeme_turu'] in ('KASAYA DEVIR', 'KASAYA DEVİR'):
                expected -= r['tahsilat']
            elif r['odeme_turu'] not in ('DEVIR', 'DEVİR'):
                expected += r['tahsilat']
        q.execute("select net_balance from app_personel_net_after_expenses('2026-11-01') where personel_key='umit'")
        assert q.fetchone()['net_balance'] == expected
        q.execute("select toplam_tutar from satis_fisleri where tarih='2026-10-01' and aciklama='2026-09 Personel Devir (umit)'")
        opening = q.fetchone()['toplam_tutar']
        assert opening == Decimal('828547'), 'Reconciled October opening changed'

        def carries():
            q.execute("select tarih,toplam_tutar,kalan_bakiye,aciklama from satis_fisleri where odeme_turu='PERSONEL DEVİR' and tarih>='2026-11-01' order by tarih,aciklama")
            result = q.fetchall()
            assert all(r['kalan_bakiye'] == 0 for r in result), 'Retired personnel open balance carried forward'
            return result

        # Exact normal authorized wrapper, not just privileged core.
        q.execute('savepoint authenticated_close')
        q.execute("select set_config('request.jwt.claim.sub',%s,true),set_config('request.jwt.claims',%s,true)",
                  (str(actor['id']), json.dumps({'sub': str(actor['id']), 'email': actor['username'], 'role': 'authenticated'})))
        q.execute('set local role authenticated')
        q.execute("select app_close_period('2026-10')")
        assert q.fetchone()['app_close_period']['ok']
        q.execute('reset role')
        assert carries()[0]['toplam_tutar'] == expected
        q.execute("select app_close_period_core('2026-10',%s,%s)", (actor['id'], actor['username']))
        assert carries()[0]['toplam_tutar'] == expected, 'Repeated close deducted expenses twice'
        q.execute("select app_close_period_core('2026-11',%s,%s)", (actor['id'], actor['username']))
        assert all(row['toplam_tutar'] == expected for row in carries())
        q.execute("select account_key,balance from app_satis_account_balances('2026-12-01',null,null) order by account_key")
        assert q.fetchall() == customer_balances, 'Customer debt changed with personnel carry'

        # Expense edit -> automatic refresh of BOTH future carries.
        target = next(g for g in expenses if str(g['tarih']).startswith('2026-10') and norm(g['ekleyen']) == 'umit')
        q.execute('set local role authenticated')
        q.execute('update giderler set tutar=tutar+1000 where id=%s', (target['id'],))
        q.execute('reset role')
        assert all(row['toplam_tutar'] == expected-1000 for row in carries())
        # First-day expense is after the carry; move month and delete exercise OLD/NEW dates.
        q.execute("insert into giderler(tarih,tur,aciklama,tutar,ekleyen,created_by) values('2026-11-01','Genel Gider','ROLLBACK ONLY NET TEST',12.50,%s,%s) returning id", (actor['username'], actor['id']))
        added_id = q.fetchone()['id']
        assert carries()[0]['toplam_tutar'] == expected-1000
        assert carries()[1]['toplam_tutar'] == expected-1000-Decimal('12.5')
        q.execute("update giderler set tarih='2026-10-01' where id=%s", (added_id,))
        assert all(row['toplam_tutar'] == expected-1000-Decimal('12.5') for row in carries())
        q.execute('delete from giderler where id=%s', (added_id,))
        assert all(row['toplam_tutar'] == expected-1000 for row in carries())
        q.execute('update giderler set tutar=%s where id=%s', (target['tutar'], target['id']))
        assert all(row['toplam_tutar'] == expected for row in carries())
        q.execute('rollback to savepoint authenticated_close')
        assert fingerprints() == initial, 'Financial data changed after test rollback'

        # Legacy September close must keep the corrected October opening.
        q.execute('savepoint legacy_close')
        q.execute("select app_close_period_core('2026-09',%s,%s)", (actor['id'], actor['username']))
        q.execute("select toplam_tutar from satis_fisleri where tarih='2026-10-01' and aciklama='2026-09 Personel Devir (umit)'")
        assert q.fetchone()['toplam_tutar'] == opening
        q.execute('rollback to savepoint legacy_close')
        assert fingerprints() == initial

        for role in ['anon', 'authenticated']:
            for signature in ['app_close_period_core(text,uuid,text)', 'app_close_period_before_202610_core(text,uuid,text)', 'app_recalculate_future_devirs_for_satis_date(date,uuid,text)']:
                q.execute('select has_function_privilege(%s,%s,\'execute\') allowed', (role, signature))
                assert not q.fetchone()['allowed'], (role, signature)
        print('PASS: migration/idempotence, frontend parity, authorized close, repeat close, two-month carry, expense edit/insert/date move/delete, legacy reconciliation, internal RPC permissions')
        print('CURRENT_NET', expected, 'OCTOBER_OPENING', opening)
finally:
    c.rollback()
    c.close()
    print('ALL TEST CHANGES ROLLED BACK')
