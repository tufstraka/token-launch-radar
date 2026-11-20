// TOKEN RADAR: the benchmark-driven pre-token value model and the ranked board.
//
// Every protocol is scored by one name-agnostic function of the snapshot's own figures:
//
//   implied = round(tvl_usd x benchmark x growth_factor x tenure_factor x breadth_factor)
//
// The category benchmark is not a hand-set table. It is learned from the protocols in this
// snapshot whose token already trades, by market cap over TVL:
//
//   ratio(category) = median(mcap_usd / tvl_usd) over live-token protocols in that category
//   benchmark(cat)  = (n x median_cat + 5 x global_median) / (n + 5), clamped to [0.05, 6]
//
// Five pseudo-peers shrink a thin category toward the whole live market; a category with no live
// peer takes the global median. The protocol's `category` alone selects the row, never its name or
// slug. Growth, tenure and breadth then adjust that market multiple:
//
//   growth_factor  = 1 + clamp(change_7d, -50, 150) / 100 x 0.35      (null change = 1)
//   tenure_factor  = min(1.25, (0.90 + 0.30 x min(age_days, 1095) / 1095)
//                              x (1 + 0.10 x log10(1 + age_days / 180)))  (null age = 365 days)
//   breadth_factor = 1 + 0.03 x min(chains.length, 6)
//
// Longer time with no token raises tenure: the protocol is launch-ready and has survived. The board
// holds every watchlist slug plus the 160 highest-TVL pre-token protocols below the floor, so it is
// 200 rows on this snapshot. Protocols whose token already trades are kept in a separate `live` list
// with their market caps and their own mcap/TVL ratio; they are never mixed into the ranked board.

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

/** The model's constants, stated in the dashboard and used by every row. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_base: number;
  tenure_range: number;
  tenure_days: number;
  tenure_bonus: number;
  tenure_bonus_cap: number;
  tenure_bonus_days: number;
  breadth_weight: number;
  breadth_cap: number;
  unknown_age_days: number;
  shrink_prior: number;
  benchmark_floor: number;
  benchmark_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 150,
  tenure_base: 0.9,
  tenure_range: 0.3,
  tenure_days: 1095,
  tenure_bonus: 0.1,
  tenure_bonus_cap: 1.25,
  tenure_bonus_days: 180,
  breadth_weight: 0.03,
  breadth_cap: 6,
  unknown_age_days: 365,
  shrink_prior: 5,
  benchmark_floor: 0.05,
  benchmark_cap: 6,
};

/** One category's learned multiple, with the live peers behind it. */
export interface CategoryBenchmark {
  category: string;
  benchmark: number;
  n: number;
  median_mcap_tvl: number;
}

/** The benchmark block: the global anchor, its sample and every category row. */
export interface BenchmarkModel {
  global_median_mcap_tvl: number;
  sample_size: number;
  shrink_prior: number;
  benchmarks: CategoryBenchmark[];
}

/** The model's version label. */
export const MODEL_VERSION = 'radar-3.0-benchmark';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the "Already trading" view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  launch_score: number;
  confidence: 'high' | 'medium' | 'low';
  model: {
    benchmark: number;
    category_n: number;
    global_median_mcap_tvl: number;
    growth_pct: number;
    growth_factor: number;
    tenure_factor: number;
    tenure_bonus: number;
    breadth_factor: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact row: the same numbers board.json carries, plus the plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  launch_score: number;
  confidence: 'high' | 'medium' | 'low';
  watchlist: boolean;
  factors: {
    benchmark: number;
    category_n: number;
    growth_pct: number;
    growth_factor: number;
    tenure_factor: number;
    tenure_bonus: number;
    breadth_factor: number;
  };
  farm_steps: string[];
}

/** A live-token protocol: its token trades, so its market cap is a fact, not a model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_tvl_ratio: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median_mcap_tvl: number;
  benchmark_sample_size: number;
  benchmarks: CategoryBenchmark[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_tvl_usd: number;
  aged_two_years: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty numeric list; the mean of the two middle values when even. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The bucket key a protocol's category sorts into; a null category is "Other". */
export function categoryKey(category: string | null): string {
  return category === null || category === '' ? 'Other' : category;
}

/**
 * Learn the benchmark table from the snapshot's own live-token protocols. Only protocols with a
 * market cap and a positive TVL carry a ratio. The protocol's category is the only key.
 */
export function computeBenchmarks(snapshot: Snapshot, model: ModelConstants = MODEL): BenchmarkModel {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio)) continue;
    all.push(ratio);
    const key = categoryKey(p.category);
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [ratio]);
    else list.push(ratio);
  }
  const global = median(all);
  const clamp = (v: number): number => Math.min(model.benchmark_cap, Math.max(model.benchmark_floor, v));
  const benchmarks: CategoryBenchmark[] = [];
  for (const [category, values] of ratios) {
    const n = values.length;
    const catMedian = median(values);
    const shrunk = (n * catMedian + model.shrink_prior * global) / (n + model.shrink_prior);
    benchmarks.push({
      category,
      benchmark: round4(clamp(shrunk)),
      n,
      median_mcap_tvl: round4(catMedian),
    });
  }
  benchmarks.sort((a, b) => b.n - a.n || b.benchmark - a.benchmark || (a.category < b.category ? -1 : 1));
  return {
    global_median_mcap_tvl: round4(global),
    sample_size: all.length,
    shrink_prior: model.shrink_prior,
    benchmarks,
  };
}

/** A category's learned benchmark; a category with no live peer takes the global median. */
export function benchmarkFor(category: string | null, bench: BenchmarkModel, model: ModelConstants = MODEL): { benchmark: number; n: number } {
  const key = categoryKey(category);
  for (const b of bench.benchmarks) if (b.category === key) return { benchmark: b.benchmark, n: b.n };
  return { benchmark: Math.min(model.benchmark_cap, Math.max(model.benchmark_floor, bench.global_median_mcap_tvl)), n: 0 };
}

/** Whole days from `listed_at` to `as_of`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** One protocol's factors and implied value under `model` and the learned `bench`.
 *  Returns `stage` = tvl x benchmark so the page can show the arithmetic in order. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  bench: BenchmarkModel,
  model: ModelConstants = MODEL,
): {
  implied: number;
  age: number | null;
  benchmark: number;
  categoryN: number;
  stage: number;
  growthPct: number;
  growthFactor: number;
  tenureFactor: number;
  tenureBonus: number;
  breadthFactor: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d === null ? 0 : finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthFactor = protocol.change_7d === null ? 1 : 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const tenureBase = model.tenure_base + (Math.min(Math.max(ageForModel, 0), model.tenure_days) / model.tenure_days) * model.tenure_range;
  const tenureBonus = 1 + model.tenure_bonus * Math.log10(1 + Math.max(ageForModel, 0) / model.tenure_bonus_days);
  const tenureFactor = Math.min(model.tenure_bonus_cap, tenureBase * tenureBonus);
  const breadthFactor = 1 + model.breadth_weight * Math.min(protocol.chains.length, model.breadth_cap);
  const local = benchmarkFor(protocol.category, bench, model);
  const stage = protocol.tvl_usd * local.benchmark;
  const implied = Math.max(1, Math.round(stage * growthFactor * tenureFactor * breadthFactor));
  return {
    implied,
    age,
    benchmark: local.benchmark,
    categoryN: local.n,
    stage,
    growthPct,
    growthFactor,
    tenureFactor,
    tenureBonus,
    breadthFactor,
  };
}

/** Whether a protocol records no token at all. The snapshot's record is not proof it has none. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A release marker in a name means a versioned pool of another protocol, not a launch candidate. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol may be ranked: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Confidence from age alone: high at two years, medium at six months, low otherwise. */
function confidenceFor(age: number | null): 'high' | 'medium' | 'low' {
  if (age === null) return 'low';
  return age >= 730 ? 'high' : age >= 180 ? 'medium' : 'low';
}

/** The board's protocols, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const bench = computeBenchmarks(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isPreToken(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, bench, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const values = scored.map((s) => s.implied).sort((a, b) => a - b);
  const n = scored.length;
  // Percentile of implied value: the share of the board a row beats, 0..100.
  const percentile = (value: number): number => {
    if (n <= 1) return 100;
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid]! < value) lo = mid + 1;
      else hi = mid;
    }
    return Math.round((lo / (n - 1)) * 100);
  };
  const watch = new Set(snapshot.watchlist);

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watch.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    launch_score: Math.min(100, Math.max(0, percentile(s.implied))),
    confidence: confidenceFor(s.age),
    model: {
      benchmark: round4(s.benchmark),
      category_n: s.categoryN,
      global_median_mcap_tvl: bench.global_median_mcap_tvl,
      growth_pct: round4(s.growthPct),
      growth_factor: round4(s.growthFactor),
      tenure_factor: round4(s.tenureFactor),
      tenure_bonus: round4(s.tenureBonus),
      breadth_factor: round4(s.breadthFactor),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A chain name for the plan. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Gas guidance from the first chain's family, not from the protocol's name. */
function gasNote(chain: string): { low: string; high: string } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { low: '$6–15 of gas', high: '$25–60 across setup and claims' };
  if (c === 'bitcoin' || c.includes('babylon')) return { low: '$2–5 of network fees', high: '$10–20 across setup and claims' };
  return { low: 'under $2 of gas', high: '$5–12 across setup and claims' };
}

/** Capital for one farm position, scaled to the protocol's TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 500;
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 25_000_000) return 75;
  return 50;
}

/** Hold length: younger protocols need a longer record to look durable. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's concrete action. It reads `category` and the chain list, never the protocol's name. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('allocator')) return `Deposit $${capital} of USDC into one of ${name}'s curated vaults on ${chain}, confirm the vault's curator and fee before you sign, and keep the vault shares.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name} on ${chain}, open its hedged basis position, and leave the hedge on until you withdraw.`;
  if (c.includes('lending') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, borrow a small amount against it if the market allows, and keep both positions open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, range it around the current price, and keep the LP position open.`;
  if (c.includes('perp') || c.includes('derivative') || c.includes('synthetic')) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedge so the position stays active without leverage.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of ${chain}'s staking asset through ${name}, keep the receipt token, and do not re-stake it elsewhere.`;
  if (c.includes('rwa')) return `Mint or buy $${capital} of ${name}'s yield asset on ${chain}, hold it in the same wallet, and keep the issuance record.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep the position for the full hold.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain}, keep the policy document, and renew only from the protocol's own page.`;
  if (c.includes('payment') || c.includes('card')) return `Move $${capital} of USDC through ${name}'s payment flow on ${chain}, settle once, and keep the receipt.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}'s canonical route and use the funds in ${name}'s own app.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then complete one swap or deposit on the destination chain.`;
  if (c.includes('governance') || c.includes('launchpad')) return `Lock $${capital} of the protocol's eligible asset with ${name} on ${chain} and vote on one live proposal.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open for the full hold.`;
}

/**
 * A protocol's farm plan: six concrete steps, each with an explicit cost and time. It derives from the
 * protocol's own record (category, chains, TVL, age); no name is special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  const action = actionFor(p, capital, chain);
  const steps = [
    `Create a fresh wallet for this position alone, fund it with $${capital + 20} of USDC on ${chain}, and store the seed phrase offline. Cost: ${gas.low}. Time: 10 minutes.`,
    action + ` Cost: $${capital} of capital plus ${gas.low}. Time: 15–20 minutes.`,
    `Record the position in a farm log with the date, the wallet address, the amount and the transaction hash, then repeat one qualifying action every week. Cost: under $2 of gas a week. Time: 10 minutes a week.`,
    `Sybil and risk check: keep one wallet per person, never fund it from an exchange account shared with other farmers, and do not move the position between wallets to fake volume. Cost: nothing. Time: 10 minutes.`,
    `Hold for at least ${hold} days so activity lands in more than one protocol snapshot; check ${p.name}'s own site and social account for a points page before you withdraw, and claim only from the link the protocol publishes. Cost: the $${capital} stays locked; never pay to claim. Time: ${hold} days.`,
    `Withdraw in one transaction, keep ${gas.high} available for gas, and reconcile the farm log against the wallet's history. Cost: ${gas.high}. Time: 20 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s.length < 20 ? `${s} Hold and review.` : s));
}

/** The live-token protocols by market cap, for the separate "Already trading" view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_tvl_ratio: p.tvl_usd > 0 && p.mcap_usd !== null ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    launch_score: row.launch_score,
    confidence: row.confidence,
    watchlist: row.watchlist,
    factors: {
      benchmark: row.model.benchmark,
      category_n: row.model.category_n,
      growth_pct: row.model.growth_pct,
      growth_factor: row.model.growth_factor,
      tenure_factor: row.model.tenure_factor,
      tenure_bonus: row.model.tenure_bonus,
      breadth_factor: row.model.breadth_factor,
    },
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, computed from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const bench = computeBenchmarks(snapshot, model);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const tvls = board.map((r) => r.tvl_usd).sort((a, b) => a - b);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median_mcap_tvl: bench.global_median_mcap_tvl,
    benchmark_sample_size: bench.sample_size,
    benchmarks: bench.benchmarks,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    median_tvl_usd: median(tvls),
    aged_two_years: board.filter((r) => (r.age_days ?? 0) >= 730).length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

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

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
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
