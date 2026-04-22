# vc-termometro · scripts locales

Este folder contiene el código Node que corre **en tu máquina** para hacer toda
la investigación vía Firecrawl. Existe porque el sandbox del scheduler de
Cowork bloquea `api.firecrawl.dev` por allowlist, así que la parte de red la
delegamos a Node local.

## Flujo

```
fetch-research.mjs  →  raw/<stamp>/queryNN.json    ← respuestas crudas
                   →  findings.json                ← consolidado (lo lee el scheduler)
```

El scheduler de Cowork después:
1. Ejecuta este script con `node scripts/fetch-research.mjs`.
2. Lee `findings.json`.
3. Redacta el post, actualiza `data.json`, artifact y `index.html`.

## Cómo correrlo a mano

Requisitos: Node 18 o superior.

```powershell
cd C:\Users\sebas\OneDrive\Escritorio\Sandbox-Claude\vc-termometro\scripts
node fetch-research.mjs
```

Opcionales:

```powershell
node fetch-research.mjs --run morning     # forzar etiqueta de corrida
node fetch-research.mjs --run afternoon
node fetch-research.mjs --dry             # no escribe archivos (debug)
```

Salida esperada:

```
[vc-termometro] starting research run…
  [01/13] (us) "AI startup funding round Series A this week" … ok (8 items, 1240ms)
  [02/13] (us) "venture capital AI infrastructure deal announcement" … ok (8 items, 980ms)
  ...
[vc-termometro] done.
  queries ok:    13/13
  queries fail:  0
  unique urls:   74
  elapsed:       14320ms
  findings:      C:\Users\sebas\OneDrive\Escritorio\Sandbox-Claude\vc-termometro\findings.json
```

## Archivos generados

- `vc-termometro/findings.json` — el consolidado que lee el scheduler.
- `vc-termometro/raw/YYYY-MM-DD-HHMM/queryNN.json` — una carpeta por corrida con
  el JSON crudo de cada query (útil para auditar o reprocesar después).

## Config

El script lee `vc-termometro/config.json`:

```json
{
  "firecrawl": {
    "api_key": "fc-..."
  },
  "run_config": {
    "results_per_query": 8,
    "recency_window": "qdr:d",
    "formats": ["markdown"],
    "only_main_content": true
  }
}
```

Cambiá `results_per_query`, `recency_window` (ej: `qdr:w` para última semana)
o los formatos ahí — el script los respeta en el próximo run.

## Queries

Están hardcodeadas en `fetch-research.mjs` bajo `QUERIES`. Son 13: 5 de USA,
5 de LATAM, 3 macro. Si querés agregar/quitar temas, editá esa constante.

## Códigos de salida

- `0` — todo ok.
- `1` — 0 queries exitosas (Firecrawl no está alcanzable o la key falló). El
  scheduler detecta este código y cae a WebSearch como fallback.
- `2` — falta `config.firecrawl.api_key`.
- `3` — error no manejado.

## Troubleshooting

**"fetch failed" o timeout** — ¿tu máquina tiene acceso a
`api.firecrawl.dev:443`? Probá:
```powershell
curl.exe -I https://api.firecrawl.dev/
```

**HTTP 401** — key inválida o revocada. Rotala en `config.json`.

**HTTP 429** — rate limit. El plan free de Firecrawl tiene límites diarios;
esperá o pasá al plan pago.

**"0 successful queries"** — revisá la primera entrada en `findings.errors[]`.
Te dice el status y el error exacto.
