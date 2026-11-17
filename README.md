# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fallingkuromaguro/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fallingkuromaguro/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar built from a sealed snapshot of 758 DeFi protocols. It ranks the protocols that record no token by the value of a token they could issue, and gives concrete steps to farm each one ahead of a launch.

## The model

The implied-value model is fitted on the snapshot itself, over the 119 protocols in it that do have listed tokens (exchanges excluded): log10(market cap) = 3.351 + 0.475 × log10(smoothed TVL), where smoothed TVL averages this week's TVL with last week's (back-solved from the 7-day change). Category-family adjustments are shrunk medians; the scatter of the comparables (±0.90 dex) sets each row's 50% range. Bridges, wrappers, liquid staking, CEX and versioned pools are not ranked. The board ranks 197 protocols — all 40 from the house watchlist plus 157 more the data supports — and lists 145 further protocols as not ranked, with reasons.

Top of the board by implied value: Bittensor dTAO ($53.6M), Sentora Curator ($51.5M), Steakhouse Financial ($50.1M), Polymarket International ($49.0M), Symbiotic ($41.0M). Every row carries a 7–8 step farm plan with costs and times.

## Run it

```sh
MAKEFUN_INPUT_DIR=<snapshot dir> MAKEFUN_OUTPUT_DIR=<output dir> node main.ts
```

This writes `board.json`, the dashboard data, the dashboard itself, the screenshots and `dossier.json` into the output directory. The dashboard is fully static: a sortable, filterable board (category, chain, value band, watchlist), a detail view per protocol showing the valuation arithmetic and its nearest tokened comparables, plus Live tokens, Not ranked and Method views.

---

<sub>Entered on [make.fun](https://make.fun/?ref=szxhrrem&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
