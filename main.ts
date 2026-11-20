// TOKEN RADAR: build the pre-token board and the static dashboard a reader uses.
//
// This entry is a Node 22 program with no dependencies. It reads the sealed snapshot from
// /input/snapshot.json (or --input <file|directory>), scores every pre-token protocol with the
// name-agnostic model in lib/model.ts, and writes:
//
//   /output/board.json      every ranked row, its factors and its farm plan
//   /output/data.js         the same dataset as one script beside dashboard/
//   /output/dashboard/      index.html, app.css and app.js (static, no network)
//   /output/screenshots/    three captures of that dashboard
//   /output/dossier.json    buildDossier()'s summary of the dashboard and the images
//
// The model and the page share the row shape, so the number in the table is the number board.json
// carries. Run it outside the grader with:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's caps: dashboard files, screenshots and the dossier's source text. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// 1. Read and score the snapshot. parseSnapshot refuses a document the model cannot rank.
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// 2. A board is only useful if it carries both the watchlist and the early rows below the floor.
if (board.length < 100) {
  process.stderr.write(`token radar: only ${board.length} rows: the gate needs at least 100\n`);
  process.exit(1);
}
if (radar.watchlist_size !== snapshot.watchlist.length) {
  process.stderr.write('token radar: the radar lost a watchlist slug\n');
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

// Clear the copied asset directories first: a rerun must produce the same tree, not a union with the
// previous run's files (a stale screenshot would otherwise push the dossier past its image cap).
for (const dir of ['dashboard', 'screenshots']) rmSync(join(out, dir), { recursive: true, force: true });
const dashboard = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
for (const name of ['index.html', 'app.css', 'app.js']) {
  if (!dashboard.includes(name)) {
    process.stderr.write(`token radar: dashboard/${name} is missing: the page cannot render\n`);
    process.exit(1);
  }
}

const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// 3. The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: ${radar.aged_two_years} rows aged 2y+, median TVL $${radar.median_tvl_usd.toLocaleString('en-US')}, total implied $${radar.total_implied_usd.toLocaleString('en-US')}\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${dashboard.length} files), screenshots/ (${shots.length} images) and dossier.json to ${out}\n`,
);
