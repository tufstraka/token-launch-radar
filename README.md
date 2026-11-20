# TOKEN RADAR

[![make.fun token radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/tufstraka/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/tufstraka/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

**A pre-token launch radar for the make.fun “Build the best token launch radar” bounty.**

TOKEN RADAR reads a sealed DefiLlama snapshot and ranks protocols that **record no token** by an
implied launch value derived only from the snapshot's own figures. It covers all 40 watchlist
protocols and adds the 160 highest-TVL pre-token protocols below the $50M floor, for a 200-row
board. Protocols whose token already trades are listed separately under **Already trading** with
their market caps and their own mcap/TVL ratio; they are never mixed into the ranking.

The value model is learned from the snapshot, not from a hand-set category table. For every protocol
whose token trades and whose TVL is positive, the model computes `mcap_usd / tvl_usd`. Each
category's median is shrunk toward the global median with five pseudo-peers:

```text
benchmark(cat) = (n × median_cat + 5 × global_median) / (n + 5)   clamped to [0.05, 6]
implied = round(tvl_usd × benchmark × growth_factor × tenure_factor × breadth_factor)
```

Every row stores its benchmark, the number of live peers behind it, and each factor, so the page can
show the arithmetic rather than assert the result. A category with no live peer uses the global
median. Only the protocol's `category` selects a benchmark — never its name or slug.

- `growth_factor = 1 + clamp(change_7d, -50, 150) / 100 × 0.35` (`null` change = 1)
- `tenure_factor = min(1.25, (0.90 + 0.30 × min(age_days, 1095) / 1095)
                    × (1 + 0.10 × log10(1 + age_days / 180)))`, `null` age = 365 days
- `breadth_factor = 1 + 0.03 × min(chains.length, 6)`

A **launch score** is the rounded percentile of implied value across the board. Confidence is high
at two years of record or more, medium at six months, low otherwise.

The page is static: vanilla HTML, CSS and JavaScript with no framework, no external fonts, no images
and no network. It has search, category / chain / minimum-TVL filters, a watchlist toggle, sortable
headers including the benchmark column, a live result count, a detail drawer with the full benchmark
breakdown and farm plan, a Method page with the formula and every category's benchmark and `n`, and
deterministic URL state for every view.

**Records no token, not proof it has none.** The snapshot is DefiLlama's record, and a protocol may
carry a token that record does not show. Implied value is this entry's model, not a price, and it
does not predict whether or when a token is issued.

## Run it

Requires Node.js 22.18 or later. No dependencies.

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

This writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and
`out/dossier.json`. Open `out/dashboard/index.html` directly in a browser; the page loads
`../data.js` and needs no server.

Useful deterministic views:

- `?view=board` — the full ranked board
- `?view=detail&slug=<slug>` — one protocol's benchmark breakdown and farm plan
- `?view=method` — the value model, formula and full category-benchmark table
- `?view=board&cat=Risk%20Curators&chain=Ethereum` — a filtered board
- `?view=live` — protocols whose token already trades, with mcap/TVL

## Layout

- `main.ts` — reads the snapshot, writes the board and dashboard data, copies static assets, writes the dossier.
- `lib/model.ts` — the benchmark model, board construction, confidence and farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`; the whole static page.
- `screenshots/` — three 1440×900 captures of the board, a detail view and a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier builder, unchanged.
