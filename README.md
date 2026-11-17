# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fallingkuromaguro/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fallingkuromaguro/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## What it is

A radar over one sealed snapshot of 758 DeFi protocols (DefiLlama, fetched 2026-11-14). It ranks the protocols that record no token by the market value a token they could issue would carry, and gives each row a farm plan: what to do with the protocol, what it costs and how long it takes. A protocol that records no token may still issue one, and a value here is this radar's estimate from the snapshot's own figures, not a forecast or a price.

## The radar-2 model

The model learns from the protocols in the snapshot that already have a listed token: 119 of them, excluding exchanges.

1. **Smoothed TVL.** One week's change is partly a spike, so each protocol's TVL is the mean of this week's figure and last week's, back-solved from its 7-day change (clamped to −60% to +120%).
2. **Comparable line.** A least-squares fit over those 119 protocols gives log10(market cap) = 3.351 + 0.475 × log10(smoothed TVL). The slope below 1 means a larger TVL earns a smaller cap per dollar. The scatter around the line is ±0.90 dex.
3. **Category family.** Each family's median residual is shrunk by n ÷ (n + 5), so a thin family moves the estimate little. Trading and derivatives (n = 22) sits at +96%; lending and credit (n = 22) at −24%.
4. **Chain reach.** A slope on the number of chains, capped at 10, is effectively zero in this snapshot (−0.003 dex per chain).
5. **Not ranked.** Bridges, wrapped and staked products, liquid staking, exchanges and versioned pools are left off the board, since the house rule treats them as products of a token that already trades. A soft set (restaking, staking pools, BTC wrappers) stays ranked at half weight.

The 50% range on each row is the comparables' scatter (±0.67 standard deviations). Record age sets the confidence label and the length of the farm plan's hold. Age and 7-day growth show no usable effect on the value once TVL is smoothed (correlations −0.11 and −0.06).

**The board.** 197 protocols are ranked: all 40 from the house watchlist and 157 more. A further 145 protocols are listed as not ranked, with reasons, and 258 record a ticker without a listing. The top five by implied value are Bittensor dTAO ($53.6M, range $13.3M to $216M), Sentora Curator ($51.5M), Steakhouse Financial ($50.1M), Polymarket International ($49.0M) and Symbiotic ($41.0M). Every row carries a 7–8 step farm plan with costs and times.

## Running it

Node 22.18 or later is needed. Nothing is installed.

```sh
MAKEFUN_INPUT_DIR=<directory holding snapshot.json> MAKEFUN_OUTPUT_DIR=<output directory> node main.ts
```

This writes `board.json`, the dashboard's data, the dashboard, its screenshots and `dossier.json` into the output directory. The run is deterministic: two runs write the same bytes. The dashboard is static, with no network access: a sortable, filterable board (category, chain, value band, watchlist), a detail view per protocol with its valuation arithmetic, nearest tokened comparables and farm plan, and Live tokens, Not ranked and Method views.

To take the screenshots again, build the output and run `node tools/shoot.mjs <output directory> screenshots`, which drives headless Chrome.

---

Entered on [make.fun](https://make.fun/?ref=szxhrrem&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
