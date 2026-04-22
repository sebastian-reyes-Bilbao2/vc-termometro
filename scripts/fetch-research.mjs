#!/usr/bin/env node
// ============================================================================
// vc-termometro — fetch-research.mjs
// ----------------------------------------------------------------------------
// Corre en la máquina del usuario (Node 18+). Hace todo el trabajo de red que
// el sandbox de Cowork bloquea por allowlist:
//   1. Lee config.json con la API key de Firecrawl.
//   2. Ejecuta N queries contra https://api.firecrawl.dev/v1/search.
//   3. Guarda la respuesta cruda de cada query en raw/YYYY-MM-DD-HHMM/.
//   4. Consolida los resultados en findings.json (el scheduler lo lee después).
//
// Uso:
//   node scripts/fetch-research.mjs                 # corrida automática
//   node scripts/fetch-research.mjs --run morning   # forzar etiqueta
//   node scripts/fetch-research.mjs --dry           # no escribe nada
// ============================================================================

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const DRY = flag('--dry');
const forcedRun = argVal('--run'); // "morning" | "afternoon"

// ---------------------------------------------------------------------------
// Queries — 13 por corrida, mezcla EN/ES/PT, todas últimas 24h
// ---------------------------------------------------------------------------
const QUERIES = {
  us: [
    'AI startup funding round Series A this week',
    'venture capital AI infrastructure deal announcement',
    'defense tech dual-use startup funding',
    'biotech GLP-1 obesity funding round',
    'vertical AI agents funding late stage',
  ],
  latam: [
    'startup Latinoamérica levantó ronda inversión',
    'fintech B2B Brasil México Colombia funding',
    'startup Colombia Series A seed round',
    'rodada investimento Brasil startup fintech',
    'venture capital LATAM últimas noticias',
  ],
  macro: [
    'venture capital market sentiment 2026',
    'IPO tech late stage valuation comeback',
    'global startup funding trends weekly',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function nowLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad(Math.abs(offsetMin) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`
  );
}

function runLabel() {
  if (forcedRun) return forcedRun;
  const h = new Date().getHours();
  return h < 12 ? 'morning' : 'afternoon';
}

function runStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

async function readJSON(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

async function writeJSON(p, obj) {
  if (DRY) {
    console.log(`[dry] would write ${p}`);
    return;
  }
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Firecrawl client
// ---------------------------------------------------------------------------
async function firecrawlSearch({ apiKey, query, limit, tbs, scrapeOptions }) {
  const body = {
    query,
    limit,
    tbs,
    ...(scrapeOptions ? { scrapeOptions } : {}),
  };

  const started = Date.now();
  let res;
  try {
    res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `network: ${err.message}`,
      query,
      elapsed_ms: Date.now() - started,
    };
  }

  const elapsed = Date.now() - started;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 2000) };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json?.error || text.slice(0, 500),
      query,
      elapsed_ms: elapsed,
    };
  }

  return {
    ok: true,
    status: res.status,
    query,
    elapsed_ms: elapsed,
    raw: json,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('[vc-termometro] starting research run…');

  const configPath = join(ROOT, 'config.json');
  const config = await readJSON(configPath);
  const apiKey = config?.firecrawl?.api_key;
  if (!apiKey) {
    console.error('ERROR: config.firecrawl.api_key missing in config.json');
    process.exit(2);
  }

  const runCfg = config.run_config || {};
  const limit = runCfg.results_per_query ?? 8;
  const tbs = runCfg.recency_window ?? 'qdr:d';
  const formats = runCfg.formats ?? ['markdown'];
  const onlyMainContent = runCfg.only_main_content ?? true;
  const scrapeOptions = { formats, onlyMainContent };

  const stamp = runStamp();
  const rawDir = join(ROOT, 'raw', stamp);
  if (!DRY) await mkdir(rawDir, { recursive: true });

  const allQueries = [
    ...QUERIES.us.map((q) => ({ q, bucket: 'us' })),
    ...QUERIES.latam.map((q) => ({ q, bucket: 'latam' })),
    ...QUERIES.macro.map((q) => ({ q, bucket: 'macro' })),
  ];

  const findings = {
    meta: {
      started_at: nowLocalISO(),
      run: runLabel(),
      run_stamp: stamp,
      raw_dir: rawDir,
      source: 'firecrawl',
      config_snapshot: { limit, tbs, formats, onlyMainContent },
    },
    stats: {
      total_queries: allQueries.length,
      ok: 0,
      failed: 0,
      unique_urls: 0,
      elapsed_ms: 0,
    },
    results: [],
    errors: [],
  };

  const seenUrls = new Set();
  const t0 = Date.now();

  for (let i = 0; i < allQueries.length; i++) {
    const { q, bucket } = allQueries[i];
    const idx = String(i + 1).padStart(2, '0');
    process.stdout.write(`  [${idx}/${allQueries.length}] (${bucket}) "${q}" … `);

    const r = await firecrawlSearch({
      apiKey,
      query: q,
      limit,
      tbs,
      scrapeOptions,
    });

    // guardar el crudo SIEMPRE (aun en error, sirve para debug)
    const rawFile = join(rawDir, `query${idx}.json`);
    if (!DRY) {
      await writeFile(
        rawFile,
        JSON.stringify({ bucket, ...r }, null, 2),
        'utf8',
      );
    }

    if (!r.ok) {
      console.log(`FAIL (${r.status}) ${r.error?.slice?.(0, 60) || ''}`);
      findings.errors.push({
        query: q,
        bucket,
        status: r.status,
        error: r.error,
      });
      findings.stats.failed++;
      continue;
    }

    // Firecrawl devuelve { success, data: [...] } o { data: [...] } según versión
    const items = r.raw?.data || r.raw?.results || [];
    const slim = items.map((it) => {
      const url = it.url || it.link || null;
      if (url) seenUrls.add(url);
      return {
        title: it.title || it.metadata?.title || null,
        url,
        description: it.description || it.metadata?.description || null,
        published: it.publishedDate || it.date || it.metadata?.publishedTime || null,
        source: it.source || it.metadata?.sourceURL || null,
        // primeros ~2k chars del markdown — el LLM usa esto para extraer citas
        markdown: (it.markdown || it.content || '').slice(0, 2500) || null,
      };
    });

    console.log(`ok (${items.length} items, ${r.elapsed_ms}ms)`);
    findings.results.push({
      query: q,
      bucket,
      item_count: items.length,
      items: slim,
    });
    findings.stats.ok++;
  }

  findings.stats.elapsed_ms = Date.now() - t0;
  findings.stats.unique_urls = seenUrls.size;
  findings.meta.finished_at = nowLocalISO();

  const findingsPath = join(ROOT, 'findings.json');
  await writeJSON(findingsPath, findings);

  console.log('');
  console.log('[vc-termometro] done.');
  console.log(`  queries ok:    ${findings.stats.ok}/${findings.stats.total_queries}`);
  console.log(`  queries fail:  ${findings.stats.failed}`);
  console.log(`  unique urls:   ${findings.stats.unique_urls}`);
  console.log(`  elapsed:       ${findings.stats.elapsed_ms}ms`);
  console.log(`  findings:      ${findingsPath}`);
  console.log(`  raw dir:       ${rawDir}`);

  // Si TODO falló, salí con código 1 — el scheduler detecta y cae a fallback
  if (findings.stats.ok === 0) {
    console.error('[vc-termometro] FATAL: 0 successful queries. Firecrawl unreachable or key invalid.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[vc-termometro] uncaught:', err);
  process.exit(3);
});
