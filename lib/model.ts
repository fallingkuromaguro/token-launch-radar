// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// A protocol's implied value is what a token it could issue would be worth if its record stayed as it
// is: its market cap, estimated from the market caps of protocols in this same snapshot that DO have a
// token. Everything comes from the snapshot's own fields; no protocol name is special-cased.
//
//   1. Smoothed TVL. A 7-day change is partly a spike, so the TVL is valued at the mean of this week's
//      TVL and last week's, last week's being TVL / (1 + change_7d). Growth is clamped to [-60, 120].
//   2. Comparable line. Over the tokened protocols (market cap above zero, not an exchange), a least-
//      squares line gives log10(market cap) = a + b * log10(smoothed TVL). The fitted b is below 1: a
//      larger TVL earns a smaller market cap per dollar, and the line learns that from the data.
//   3. Category family. Each family's median residual from that line is shrunk toward zero by its size
//      (adj = n * median / (n + 5)), so a family with three comparables moves the estimate little.
//   4. Chain reach. A slope fitted on the residuals after step 3, against the number of chains (capped
//      at 10), relative to the comparables' mean reach.
//   5. Wrappers. A protocol whose category or name says it may be a wrapped, staked or bridged product
//      of a token that already trades is halved (log10 0.5), because it may have no token of its own.
//
//   log10(implied) = a + b * log10(smoothed TVL) + family adj + chain adj + wrapper adj
//
// The band is the 50% scatter of the comparables around the line (0.6745 standard deviations each way).
// Age (how long DefiLlama has tracked a protocol) does not move the value: across the tokened set its
// correlation with the residual is -0.11, too weak to act on at this sample size (the 5% line is near
// 0.18 for 119 comparables). It sets the record's confidence and the farm plan's hold instead. The raw
// 7-day change correlates -0.06 with the residual once TVL is smoothed, so smoothing absorbs the growth.

import { FAMILIES, FAMILY_LABEL, familyOf, isHardProduct, isSoftProduct, type Family } from './families.ts';
import { capitalFor, farmPlan } from './farm.ts';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export const CONSTANTS = {
  growth_floor: -60,
  growth_cap: 120,
  prior_weight: 5,
  chain_cap: 10,
  wrapper_factor: 0.5,
  band_z: 0.6745,
  nearest: 4,
} as const;

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** One tokened protocol the model learned from. */
export interface Comparable {
  slug: string;
  name: string;
  category: string | null;
  family: Family;
  chains: number;
  tvl_usd: number;
  smoothed_tvl_usd: number;
  mcap_usd: number;
  /** Market cap over TVL, as the snapshot states both. */
  ratio: number;
  residual: number;
}

/** The fitted comparable line and its family and chain terms. */
export interface Calibration {
  a: number;
  b: number;
  sd_dex: number;
  n: number;
  families: Record<Family, { n: number; median_ratio: number | null; median_residual: number | null; adj: number }>;
  chain_slope: number;
  chain_mean: number;
  /** Pearson correlation of 7-day change, and of record age, with the residual: the evidence for the growth and age choices. */
  growth_corr: number;
  age_corr: number;
  comparables: Comparable[];
}

/** Pearson correlation; 0 when either side has no spread. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** A nearest comparable a board row cites in its reasoning. */
export interface NearComparable {
  name: string;
  slug: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  family: Family;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  age_days: number | null;
  gecko_id: null;
  symbol: null;
  token_status: 'records no token';
  watchlist: boolean;
  wrapper_type: boolean;
  implied_value_usd: number;
  band_low_usd: number;
  band_high_usd: number;
  confidence: 'low' | 'medium' | 'higher';
  reasoning: {
    growth_pct: number;
    smoothed_tvl_usd: number;
    comparable_base_usd: number;
    family_label: string;
    family_n: number;
    family_adj_pct: number;
    chain_count: number;
    chain_adj_pct: number;
    wrapper_adj_pct: number;
    capital_per_position_usd: number;
    nearest: NearComparable[];
  };
  farm_steps: string[];
}

/** The dashboard's whole dataset, written as data.js beside the page. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  constants: typeof CONSTANTS;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  ticker_only_size: number;
  calibration: {
    comparables: number;
    slope_b: number;
    intercept_a: number;
    sd_dex: number;
    chain_slope_dex: number;
    chain_mean: number;
    growth_corr: number;
    age_corr: number;
    families: { key: Family; label: string; n: number; median_ratio: number | null; adj_pct: number }[];
  };
  rows: BoardRow[];
  live: { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number; ratio: number; change_7d: number | null }[];
  ticker_only: { slug: string; name: string; category: string | null; tvl_usd: number; symbol: string | null }[];
  not_ranked: { slug: string; name: string; category: string | null; tvl_usd: number; reason: string }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all: no market cap, no CoinGecko id and no ticker. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board ranks on its own: records no token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The TVL the model values: the mean of this week's TVL and last week's, back-solved from the 7-day change. */
export function smoothedTvl(p: SnapshotProtocol): { tvl: number; growth: number } {
  const growth = Math.min(CONSTANTS.growth_cap, Math.max(CONSTANTS.growth_floor, finite(p.change_7d, 0)));
  const lastWeek = p.tvl_usd / (1 + growth / 100);
  return { tvl: (p.tvl_usd + lastWeek) / 2, growth };
}

/** The median of a list (the mean of the middle two when even). */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Least squares y = a + b x, with the residual standard deviation. */
function ols(xs: number[], ys: number[]): { a: number; b: number; sd: number; residuals: number[] } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const residuals = xs.map((x, i) => ys[i]! - (a + b * x));
  const sd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  return { a, b, sd, residuals };
}

/** Fit the comparable line, the family terms and the chain slope on the snapshot's tokened protocols. */
export function calibrate(snapshot: Snapshot): Calibration {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  const smooth = comps.map((p) => smoothedTvl(p).tvl);
  const fit = ols(
    smooth.map((t) => Math.log10(t)),
    comps.map((p) => Math.log10(p.mcap_usd!)),
  );

  const families = {} as Calibration['families'];
  const famAdj = new Map<Family, number>();
  for (const f of FAMILIES) {
    const idx = comps.map((p, i) => i).filter((i) => familyOf(comps[i]!.category) === f);
    const res = idx.map((i) => fit.residuals[i]!);
    const ratios = idx.map((i) => comps[i]!.mcap_usd! / comps[i]!.tvl_usd);
    const n = idx.length;
    const med = n > 0 ? median(res) : 0;
    const adj = n > 0 ? (n * med) / (n + CONSTANTS.prior_weight) : 0;
    famAdj.set(f, adj);
    families[f] = { n, median_ratio: n > 0 ? median(ratios) : null, median_residual: n > 0 ? med : null, adj };
  }

  // Chain reach against the residuals left after the family terms.
  const chainCount = comps.map((p) => Math.min(CONSTANTS.chain_cap, Math.max(1, p.chains.length)));
  const left = comps.map((p, i) => fit.residuals[i]! - famAdj.get(familyOf(p.category))!);
  const chainFit = ols(chainCount, left);
  const chainMean = chainCount.reduce((s, c) => s + c, 0) / Math.max(1, chainCount.length);

  const comparables: Comparable[] = comps.map((p, i) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    family: familyOf(p.category),
    chains: p.chains.length,
    tvl_usd: p.tvl_usd,
    smoothed_tvl_usd: smooth[i]!,
    mcap_usd: p.mcap_usd!,
    ratio: p.mcap_usd! / p.tvl_usd,
    residual: fit.residuals[i]!,
  }));

  const growthPairs = comps.map((p, i) => [p.change_7d, fit.residuals[i]!] as const).filter((q): q is readonly [number, number] => q[0] !== null);
  const agePairs = comps.map((p, i) => [ageDays(snapshot.as_of, p.listed_at), fit.residuals[i]!] as const).filter((q): q is readonly [number, number] => q[0] !== null);
  const growth_corr = pearson(growthPairs.map((q) => q[0]), growthPairs.map((q) => q[1]));
  const age_corr = pearson(agePairs.map((q) => q[0]), agePairs.map((q) => q[1]));

  return { a: fit.a, b: fit.b, sd_dex: fit.sd, n: comps.length, families, chain_slope: chainFit.b, chain_mean: chainMean, growth_corr, age_corr, comparables };
}

/** The comparables a protocol is measured against: its family first, then the nearest in smoothed TVL. */
function nearestTo(p: SnapshotProtocol, tvl: number, cal: Calibration): NearComparable[] {
  const f = familyOf(p.category);
  const target = Math.log10(tvl);
  const pool = cal.comparables.filter((c) => c.slug !== p.slug);
  const sameFamily = pool.filter((c) => c.family === f);
  const source = sameFamily.length >= CONSTANTS.nearest ? sameFamily : pool;
  return [...source]
    .sort((x, y) => {
      const dx = Math.abs(Math.log10(x.smoothed_tvl_usd) - target);
      const dy = Math.abs(Math.log10(y.smoothed_tvl_usd) - target);
      return dx - dy || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0);
    })
    .slice(0, CONSTANTS.nearest)
    .map((c) => ({ name: c.name, slug: c.slug, category: c.category, tvl_usd: c.tvl_usd, mcap_usd: c.mcap_usd, ratio: round3(c.ratio) }));
}

const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (dex: number): number => round1((10 ** dex - 1) * 100);

/** One protocol's implied value and its band, with the terms that make it. */
export function estimate(p: SnapshotProtocol, cal: Calibration) {
  const { tvl, growth } = smoothedTvl(p);
  const f = familyOf(p.category);
  const wrapper = isSoftProduct(p.category);
  const chains = Math.min(CONSTANTS.chain_cap, Math.max(1, p.chains.length));
  const logBase = cal.a + cal.b * Math.log10(tvl);
  const famAdj = cal.families[f].adj;
  const chainAdj = cal.chain_slope * (chains - cal.chain_mean);
  const wrapAdj = wrapper ? Math.log10(CONSTANTS.wrapper_factor) : 0;
  const logV = logBase + famAdj + chainAdj + wrapAdj;
  const clampUsd = (v: number): number => Math.min(100_000_000_000_000, Math.max(1, Math.round(v)));
  return {
    implied: clampUsd(10 ** logV),
    low: clampUsd(10 ** (logV - CONSTANTS.band_z * cal.sd_dex)),
    high: clampUsd(10 ** (logV + CONSTANTS.band_z * cal.sd_dex)),
    growth,
    tvl,
    base: 10 ** logBase,
    family: f,
    famN: cal.families[f].n,
    famAdjPct: pct(famAdj),
    chainAdjPct: pct(chainAdj),
    wrapAdjPct: wrapper ? pct(wrapAdj) : 0,
    wrapper,
    chains: p.chains.length,
  };
}

/** The confidence a record's age earns: a young record is a thin one. */
function confidenceOf(age: number | null): 'low' | 'medium' | 'higher' {
  if (age === null || age < 180) return 'low';
  if (age < 365) return 'medium';
  return 'higher';
}

/** The board: every watchlist protocol and every rankable pre-token protocol, strongest first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, cal: Calibration = calibrate(snapshot)): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const pool = snapshot.protocols.filter((p) => watch.has(p.slug) || (isRankable(p) && !isHardProduct(p.category, p.name)));
  const scored = pool.map((p) => ({ p, e: estimate(p, cal), age: ageDays(snapshot.as_of, p.listed_at) }));
  scored.sort((a, b) => b.e.implied - a.e.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, e, age }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    family: e.family,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: null,
    listed_at: p.listed_at,
    age_days: age,
    gecko_id: null,
    symbol: null,
    token_status: 'records no token',
    watchlist: watch.has(p.slug),
    wrapper_type: e.wrapper,
    implied_value_usd: e.implied,
    band_low_usd: e.low,
    band_high_usd: e.high,
    confidence: confidenceOf(age),
    reasoning: {
      growth_pct: round1(e.growth),
      smoothed_tvl_usd: Math.round(e.tvl),
      comparable_base_usd: Math.round(e.base),
      family_label: FAMILY_LABEL[e.family],
      family_n: e.famN,
      family_adj_pct: e.famAdjPct,
      chain_count: e.chains,
      chain_adj_pct: e.chainAdjPct,
      wrapper_adj_pct: e.wrapAdjPct,
      capital_per_position_usd: capitalFor(p.tvl_usd),
      nearest: nearestTo(p, e.tvl, cal),
    },
    farm_steps: farmPlan(p, age),
  }));
}

/** Compatibility name: the board's rows, as main.ts writes them. */
export const buildRadar = (snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } => {
  const cal = calibrate(snapshot);
  const board = buildBoard(snapshot, cal);
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: round3(p.mcap_usd! / p.tvl_usd),
      change_7d: p.change_7d,
    }));
  const tickerOnly = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd === null && p.gecko_id === null && p.symbol !== null)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, symbol: p.symbol }));
  const watch = new Set(snapshot.watchlist);
  const notRanked = snapshot.protocols
    .filter((p) => isPreToken(p) && !watch.has(p.slug) && (!isRankable(p) || isHardProduct(p.category, p.name)))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      reason: p.category === 'CEX' ? 'an exchange' : isHardProduct(p.category, p.name) ? 'a bridged, wrapped or staked product' : 'a versioned pool of another protocol',
    }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    constants: CONSTANTS,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    ticker_only_size: tickerOnly.length,
    calibration: {
      comparables: cal.n,
      slope_b: round3(cal.b),
      intercept_a: round3(cal.a),
      sd_dex: round3(cal.sd_dex),
      chain_slope_dex: round3(cal.chain_slope),
      chain_mean: round3(cal.chain_mean),
      growth_corr: round3(cal.growth_corr),
      age_corr: round3(cal.age_corr),
      families: FAMILIES.map((f) => ({
        key: f,
        label: FAMILY_LABEL[f],
        n: cal.families[f].n,
        median_ratio: cal.families[f].median_ratio === null ? null : round3(cal.families[f].median_ratio),
        adj_pct: pct(cal.families[f].adj),
      })),
    },
    rows: board,
    live,
    ticker_only: tickerOnly,
    not_ranked: notRanked,
  };
  return { board, radar };
};

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 the gate requires`;
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not a snapshot protocol`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const ordered = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.implied_value_usd > ordered[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && ordered[0]!.implied_value_usd === ordered[ordered.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of ordered) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
