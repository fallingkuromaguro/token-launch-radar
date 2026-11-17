// Token launch radar: the entry's program (Node 22, standard library only, no install step).
//
// It reads the sealed snapshot from MAKEFUN_INPUT_DIR (default /input), scores every protocol with the
// radar-2 model in lib/model.ts, and writes into MAKEFUN_OUTPUT_DIR (default /output):
//   board.json      the ranked board, { rows: [...] }
//   data.js         the dashboard's dataset, read by dashboard/index.html
//   dashboard/      a copy of this repository's dashboard/
//   screenshots/    a copy of this repository's screenshots/
//   dossier.json    the judge's summary, from buildDossier in vendor/makefun-board.ts
//
// For a local run outside the grader, set the two variables, or pass --input and --output:
//   MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));

const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
const MIN_SCREENSHOTS = 3;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after a flag (`--flag value` or `--flag=value`), or undefined. */
function optionValue(flag: string): string | undefined {
  const argv = process.argv.slice(2);
  const at = argv.indexOf(flag);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1];
  const joined = argv.find((a) => a.startsWith(`${flag}=`));
  return joined === undefined ? undefined : joined.slice(flag.length + 1);
}

function die(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputSetting = optionValue('--input') ?? process.env.MAKEFUN_INPUT_DIR ?? '/input';
const snapshotFile = inputSetting.endsWith('.json') ? inputSetting : join(inputSetting, 'snapshot.json');
const outputDir = optionValue('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

if (!existsSync(snapshotFile)) die(`no snapshot at ${snapshotFile}: set MAKEFUN_INPUT_DIR or pass --input`, 2);

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const refusal = boardIssue(board, snapshot);
if (refusal !== null) die(`the model wrote a board the gate refuses: ${refusal}`, 1);

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

/** The regular files directly inside `from` (dot-names skipped), copied into `to`; returns their names. */
function copyPlainFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    names.push(name);
  }
  return names;
}

copyPlainFiles(join(repoDir, 'dashboard'), join(outputDir, 'dashboard'));
const screenshotNames = copyPlainFiles(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'));
if (screenshotNames.length < MIN_SCREENSHOTS) {
  die(`screenshots/ holds ${screenshotNames.length} images: hand in ${MIN_SCREENSHOTS}, the board, a detail view and a filtered view`, 1);
}
for (const name of screenshotNames) {
  if (!IMAGE_NAME.test(name)) die(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
}

// Written last: the scorer rebuilds the dossier from this output directory and compares bytes.
writeFileSync(join(outputDir, 'dossier.json'), buildDossier(outputDir, DOSSIER_CAPS));

const watchlistRows = board.filter((row) => row.watchlist).length;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows ranked ` +
    `(${radar.early_size} beyond the watchlist, ${radar.live_size} tokened comparables set aside, ${watchlistRows} watchlist rows)\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${3} files), screenshots/ (${screenshotNames.length} images) and dossier.json in ${outputDir}\n`,
);
