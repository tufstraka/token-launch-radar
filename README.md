# TOKEN RADAR

[![make.fun token radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/tufstraka/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/tufstraka/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

**A pre-token launch radar for the make.fun “Build the best token launch radar” bounty.**

TOKEN RADAR reads a sealed DefiLlama snapshot and ranks protocols that **record no token** by an
implied launch value derived only from the snapshot's own figures: TVL, seven-day TVL growth, time
since the protocol was first listed, chain breadth and category. It covers all 40 watchlist protocols
and adds the 160 highest-TVL pre-token protocols below the $50M floor, for a 200-row board. Protocols
whose token already trades are listed separately under **Already trading** and are never mixed into
the ranking.

Every row carries:

- a **launch score** (percentile of implied value on the board) and a **confidence** label;
- the full factor breakdown — TVL × base × category × growth × tenure × breadth = implied value;
- a concrete, category- and chain-aware **farm plan** with an explicit cost and time on every step.

The page is static: vanilla HTML, CSS and JavaScript with no framework, no external fonts, no images
and no network. It has search, category / chain / minimum-TVL filters, a watchlist toggle, sortable
headers and a sort select, a detail drawer for every protocol, a Method section with the full category
table, and deterministic URL state for every view.

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
- `?view=detail&slug=<slug>` — one protocol's factor breakdown and farm plan
- `?view=board&cat=Risk%20Curators&chain=Ethereum` — a filtered board
- `?view=live` — protocols whose token already trades

## How the value model works

```text
implied = round(tvl_usd × 0.30 × category_factor
          × growth_factor × tenure_factor × breadth_factor)
```

- `growth_factor = 1 + clamp(change_7d, -50, 150) / 100 × 0.35` (`null` change = 1)
- `tenure_factor = (0.85 + 0.35 × min(age_days, 1095) / 1095)
                 × min(1.20, 1 + 0.12 × log10(1 + age_days / 180))`
- `breadth_factor = 1 + 0.03 × min(chains.length, 6)`
- `category_factor` comes from a fixed, documented table keyed on the protocol's `category` only —
  never on a protocol name or slug. Any unlisted category uses `0.75`.

Launch score is the rounded percentile of implied value across the board. Confidence is high at two
years of record or more, medium at six months, low otherwise; a missing seven-day change caps high at
medium.

**Records no token, not proof it has none.** The snapshot is DefiLlama's record, and a protocol may
carry a token that record does not show. Implied value is this entry's model, not a price, and it does
not predict whether or when a token is issued.

## Layout

- `main.ts` — reads the snapshot, writes the board and dashboard data, copies static assets, writes the dossier.
- `lib/model.ts` — the name-agnostic value model, board construction, confidence and farm plans.
- `dashboard/` — `index.html`, `app.css`, `app.js`; the whole static page.
- `screenshots/` — three 1440×900 captures of the board, a detail drawer and a filtered view.
- `vendor/makefun-board.ts` — the kit's dossier builder, unchanged.
