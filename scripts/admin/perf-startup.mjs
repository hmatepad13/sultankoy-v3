import {
  formatMs,
  loadAdminEnv,
  nowIsoMinusDays,
  percentile,
  requireConfig,
  supabaseRestFetch,
} from "./admin-env.mjs";

try {
  const config = loadAdminEnv();
  requireConfig(config, "supabaseUrl");
  requireConfig(config, "supabaseServiceRoleKey");

  const daysArg = Number(process.argv[2] || "2");
  const days = Number.isFinite(daysArg) && daysArg > 0 ? Math.min(14, Math.round(daysArg)) : 2;
  const since = nowIsoMinusDays(days);

  const fetchTumKayitlar = async (queryBase) => {
    const tumKayitlar = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const query = `${queryBase}&limit=${limit}&offset=${offset}`;
      const kayitlar = await supabaseRestFetch(config, query);
      if (!Array.isArray(kayitlar) || kayitlar.length === 0) break;
      tumKayitlar.push(...kayitlar);
      if (kayitlar.length < limit) break;
      offset += limit;
    }

    return tumKayitlar;
  };

  const firstInteractive = await fetchTumKayitlar(
    `client_logs?source=eq.startup.first_interactive&created_at=gte.${encodeURIComponent(since)}&select=created_at,user_email,session_id,details&order=created_at.desc`,
  );
  const startupEvents = await fetchTumKayitlar(
    `client_logs?source=in.(startup.fetch_table,startup.fetch_all,startup.first_interactive)&created_at=gte.${encodeURIComponent(since)}&select=created_at,source,session_id,details`,
  );

  const sureler = firstInteractive.map((satir) => Number(satir?.details?.duration_ms || 0)).filter((deger) => Number.isFinite(deger));
  const fetchSureleri = firstInteractive.map((satir) => Number(satir?.details?.fetch_ms || 0)).filter((deger) => Number.isFinite(deger));
  const renderSureleri = firstInteractive.map((satir) => Number(satir?.details?.post_fetch_render_ms || 0)).filter((deger) => Number.isFinite(deger));

  const ortalama = (liste) => (liste.length ? liste.reduce((toplam, item) => toplam + item, 0) / liste.length : 0);

  const sessionPatternMap = new Map();
  for (const event of startupEvents) {
    const sessionId = String(event.session_id || "");
    if (!sessionId) continue;
    const pattern = sessionPatternMap.get(sessionId) || {
      fetch_table: 0,
      fetch_all: 0,
      first_interactive: 0,
    };
    if (event.source === "startup.fetch_table") pattern.fetch_table += 1;
    if (event.source === "startup.fetch_all") pattern.fetch_all += 1;
    if (event.source === "startup.first_interactive") pattern.first_interactive += 1;
    sessionPatternMap.set(sessionId, pattern);
  }

  const patternSayaci = new Map();
  for (const pattern of sessionPatternMap.values()) {
    const anahtar = `${pattern.fetch_table} tablo / ${pattern.fetch_all} toplam / ${pattern.first_interactive} final`;
    patternSayaci.set(anahtar, (patternSayaci.get(anahtar) || 0) + 1);
  }

  const fetchTableEvents = startupEvents.filter((event) => event.source === "startup.fetch_table");
  const tableMap = new Map();
  for (const event of fetchTableEvents) {
    const table = String(event?.details?.table || "");
    if (!table) continue;
    const kayit = tableMap.get(table) || { durations: [], rows: [] };
    kayit.durations.push(Number(event?.details?.duration_ms || 0));
    kayit.rows.push(Number(event?.details?.row_count || 0));
    tableMap.set(table, kayit);
  }

  const tableOzetleri = [...tableMap.entries()]
    .map(([table, value]) => ({
      table,
      sampleCount: value.durations.length,
      avgMs: ortalama(value.durations),
      p95Ms: percentile(value.durations, 0.95),
      avgRows: ortalama(value.rows),
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 6);

  console.log(`Startup performans ozeti (${days} gun)`);
  console.log(`Oturum sayisi: ${firstInteractive.length}`);
  console.log(`Ortalama: ${formatMs(ortalama(sureler))}`);
  console.log(`Medyan: ${formatMs(percentile(sureler, 0.5))}`);
  console.log(`P95: ${formatMs(percentile(sureler, 0.95))}`);
  console.log(`En kotu: ${formatMs(Math.max(0, ...sureler))}`);
  console.log(`Fetch ort.: ${formatMs(ortalama(fetchSureleri))}`);
  console.log(`Render ort.: ${formatMs(ortalama(renderSureleri))}`);
  console.log("");
  console.log("Fetch desenleri:");
  for (const [pattern, count] of [...patternSayaci.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`- ${pattern}: ${count} oturum`);
  }

  console.log("");
  console.log("En agir tablolar:");
  for (const row of tableOzetleri) {
    console.log(`- ${row.table}: ort ${formatMs(row.avgMs)}, p95 ${formatMs(row.p95Ms)}, ort satir ${Math.round(row.avgRows)}`);
  }

  console.log("");
  console.log("Son oturumlar:");
  for (const satir of firstInteractive.slice(0, 5)) {
    console.log(
      `- ${satir.created_at} | ${satir.user_email || "-"} | toplam ${formatMs(Number(satir?.details?.duration_ms || 0))} | fetch ${formatMs(Number(satir?.details?.fetch_ms || 0))}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
