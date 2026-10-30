// Descarga la tabla ARGENFOODS (UNLu), genera un reporte para revisar y, con --load, la carga
// al catálogo compartido (`foods`, source = 'ar_seed'). Los datos se guardan en .local/ (ignorado
// por Git): sus condiciones de uso no permiten redistribuirlos en el repo. Ver docs/argenfoods.md.
//
// Uso:
//   pnpm db:load-argenfoods                    # descarga y escribe el reporte (no toca la base)
//   pnpm db:load-argenfoods -- --load          # además carga los alimentos sin avisos
//   opciones: --refresh (ignora la caché) · --include-flagged (también carga los que tienen avisos)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  ARGENFOODS_BASE_URL,
  decodeArgenfoodsHtml,
  parseFoodPage,
  parseIndexLetters,
  parseIndexPage,
  toArgenfoodsFood,
} from '../src/lib/foods/argenfoods.ts';
import { catalogFoodToRow } from '../src/lib/foods/repository.ts';

const args = new Set(process.argv.slice(2));
const LOAD = args.has('--load');
const REFRESH = args.has('--refresh');
const INCLUDE_FLAGGED = args.has('--include-flagged');

const CACHE_DIR = '.local/argenfoods';
const REPORT_PATH = '.local/argenfoods-report.csv';
const USER_AGENT = 'Macritos/0.1 (uso personal sin fines comerciales)';
const CONCURRENCY = 4;
const BATCH_SIZE = 100;

async function fetchPage(path) {
  const cachePath = join(CACHE_DIR, path);
  if (!REFRESH) {
    try {
      return decodeArgenfoodsHtml(await readFile(cachePath));
    } catch {
      // No está en caché: se descarga.
    }
  }

  const url = `${ARGENFOODS_BASE_URL}/${path}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, bytes);
      return decodeArgenfoodsHtml(bytes);
    } catch (error) {
      if (attempt === 3) throw new Error(`${url}: ${error.message}`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  return null;
}

/** Ejecuta `task` sobre cada item con concurrencia limitada, conservando el orden. */
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

async function main() {
  const indexHtml = await fetchPage('Varios/Indice.htm');
  if (!indexHtml) throw new Error('No se pudo leer el índice de ARGENFOODS');
  const letters = parseIndexLetters(indexHtml);
  console.log(`Índice: ${letters.length} páginas alfabéticas`);

  const letterPages = await mapLimit(letters, CONCURRENCY, (letter) =>
    fetchPage(`Varios/${letter}.htm`),
  );
  const codes = [
    ...new Set(letterPages.flatMap((html) => (html ? parseIndexPage(html) : []))),
  ].sort((a, b) => a - b);
  console.log(`Alimentos en el índice: ${codes.length}`);

  const results = await mapLimit(codes, CONCURRENCY, async (code, i) => {
    if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${codes.length}`);
    const html = await fetchPage(`Codigo/${code}.htm`);
    const parsed = html ? parseFoodPage(html, code) : null;
    return parsed
      ? toArgenfoodsFood(parsed)
      : { status: 'skipped', reason: 'unreadable_page', code, name: '' };
  });

  const ok = results.filter((r) => r.status === 'ok');
  const flagged = ok.filter((r) => r.flags.length > 0);
  const clean = ok.filter((r) => r.flags.length === 0);
  const withNotes = clean.filter((r) => r.notes.length > 0);
  const skipped = results.filter((r) => r.status === 'skipped');

  const header =
    'codigo,nombre,estado,motivo,notas,kcal,proteina_g,carbohidratos_g,grasa_g,fibra_g,sodio_mg,url';
  const lines = results.map((r) => {
    const code = r.status === 'ok' ? Number(r.food.sourceId) : r.code;
    const n = r.status === 'ok' ? r.food.per100g : {};
    const state = r.status === 'skipped' ? 'omitido' : r.flags.length > 0 ? 'revisar' : 'ok';
    const reason = r.status === 'skipped' ? r.reason : r.flags.join(' ');
    const notes = r.status === 'ok' ? r.notes.join(' ') : '';
    const name = r.status === 'ok' ? r.food.name : r.name;
    return [
      code,
      name,
      state,
      reason,
      notes,
      n.kcal,
      n.protein_g,
      n.carbs_g,
      n.fat_g,
      n.fiber_g,
      n.sodium_mg,
      `${ARGENFOODS_BASE_URL}/Codigo/${code}.htm`,
    ]
      .map(csvCell)
      .join(',');
  });
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${[header, ...lines].join('\n')}\n`);

  const reasons = {};
  for (const r of skipped) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  console.log(
    `\nSe cargan: ${clean.length} (${withNotes.length} con notas en el reporte) · ` +
      `Para revisar: ${flagged.length} · Omitidos: ${skipped.length}`,
  );
  console.log('Motivos de omisión:', reasons);
  console.log(`Reporte: ${REPORT_PATH}`);

  if (!LOAD) {
    console.log('\nNo se cargó nada (falta --load).');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');

  const toLoad = (INCLUDE_FLAGGED ? ok : clean).map((r) => catalogFoodToRow(r.food));
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  for (let i = 0; i < toLoad.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('foods')
      .upsert(toLoad.slice(i, i + BATCH_SIZE), { onConflict: 'source,source_id' });
    if (error) throw new Error(`No se pudo cargar el lote ${i / BATCH_SIZE + 1}: ${error.message}`);
  }
  console.log(`\nCargados ${toLoad.length} alimentos como ar_seed.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
