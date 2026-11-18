# BTC Race Bot — make.fun btc-race-24h-20261118-1444

A trading bot for "Race a BTC trading bot live for 24 hours". It trades Coinbase
Wrapped BTC (cbBTC) against USDC, one minute at a time, on paper money only
($1,000 starting capital, long only, no shorts or leverage).

## Strategy: momentum rider

cbBTC on 1-minute bars is noisy (about 7 bps of noise a minute) while a full round
trip costs about 30 bps in fees, slippage and price impact, so most small moves
are not worth trading. This bot waits for a real trend and rides it, then gets
out when the trend turns.

- **Entry:** the close is at least **60 bps above the close 65 bars ago** (a
  sustained one-hour-plus up-move) and the bot holds no position. It buys with
  all its cash.
- **Exit:** the same 65-bar return falls below **-20 bps** (momentum has
  reversed), or the price falls **100 bps from the highest close since entry**
  (a trailing stop that caps the loss on a sharp reversal). It sells the whole
  position.
- **Re-entry cooldown:** after a sell, the bot waits 10 bars before it may buy
  again, so it does not immediately re-buy into the same fading move.
- Otherwise it holds cash and does nothing.

Every comparison is exact integer arithmetic on the bars' raw prices (no floats,
no wall clock, no randomness), so two runs on the same data give the same orders.
The bot speaks `agent-fun/bars-replay/v1` through the kit's SDK shim
(`vendor/makefun-bars.ts`, a byte-identical copy of `sdk/makefun-bars.ts`).

## Dev-window result (official local grade)

Graded with the kit's own harness
(`node cli/makefun.mjs grade-local --kit . --bot <repo> --driver process`):

| Metric | Value |
|---|---|
| Net PnL | **+$6.22** (6,217,311 micro-USDC) |
| Return | +0.62% |
| Trades | 2 (one round trip) |
| Max drawdown | 0.74% |
| Fees paid | $0.80 |

The dev gate needs net PnL above $0, so this passes with margin. The bot makes
one round trip on the dev window: it buys into the start of the long rally and
sells near its top. Neighbouring settings (lookback 60-100 bars, entry 60-90
bps, exit -20 to -60 bps) are also positive on that window, so the result is
not a single knife-edge point. The trailing stop never fires on the dev window
and is there only to bound the loss if the race window turns sharply while the
bot is holding. For comparison, every baseline in the kit loses money on this
window (buy-and-hold -$31.63, momentum -$23.87, ema-cross -$148.17,
rsi-bollinger -$39.92, adx-momentum -$75.57, hold-cash $0.00).

## Files

- `main.ts` — the bot (TypeScript, Node 22 type stripping, erasable syntax).
- `vendor/makefun-bars.ts` — the kit's SDK shim, byte-identical.
- `README.md` — this file.
- `LICENSE` — MIT.

## Grade locally

From the unpacked kit directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot <path-to-this-repo> --driver process
```

The bot runs twice on the frozen 24h dev window; the two action logs must match.
