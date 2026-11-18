// Momentum-rider bot for make.fun btc-race-24h-20261118-1444.
//
// Idea: cbBTC on 1-minute bars is noisy (about 7 bps of noise a minute) while a full
// round trip costs about 30 bps, so most small moves are not worth trading. This bot
// waits for a real trend and rides it, then gets out when the trend turns.
//
//   - Entry: the close is at least 60 bps above the close 65 bars ago (a sustained
//     one-hour-plus up-move), and the bot holds no position. It buys with all its cash.
//   - Exit: the same 65-bar return turns below -20 bps (momentum has reversed), or the
//     price falls 100 bps from the highest close since entry (a trailing stop that caps
//     the loss on a sharp reversal). It sells the whole position.
//   - Otherwise it holds cash and does nothing.
//
// Why these numbers: on the frozen 24h dev window this rule makes one round trip,
// buying into the start of the long rally and selling near its top, for about +$6
// after all fees on $1,000 of paper money, with a maximum drawdown under 1%. The
// neighbouring settings (lookback 60-100 bars, entry 60-90 bps, exit -20 to -60 bps)
// are also positive on that window, so the result is not a single knife-edge point;
// the trailing stop never fires on the dev window and is there only to bound the
// loss if the race window turns sharply while the bot is holding.
//
// Every comparison is exact integer arithmetic on the bars' raw prices (no floats,
// no clock, no randomness), so two runs on the same data give the same orders.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars back for the momentum return. */
const LOOKBACK_BARS = 65;
/** Enter when the close is at least this many bps above the close LOOKBACK_BARS ago. */
const ENTRY_BPS = 60;
/** Exit when that same return falls below this many bps. */
const EXIT_BPS = -20;
/** Exit when the close falls this many bps below the highest close since entry. */
const TRAIL_BPS = 100;
/** Do not re-enter within this many bars of an exit, so a sell is not followed
 *  by an immediate re-buy into the same fading move (whipsaw). */
const REENTRY_COOLDOWN_BARS = 10;
/** The most an order may fill past the latest close (bps). */
const MAX_SLIPPAGE_BPS = 100;
const BPS = 10_000n;

/** The close of every batch so far, by seq (null when a batch carried no bar). */
const closes: (bigint | null)[] = [];
/** Highest close since the current entry, while holding. */
let peak: bigint | null = null;
/** Seq of the most recent exit, to enforce the re-entry cooldown. */
let lastExitSeq: number | null = null;

/** The LOOKBACK_BARS return in bps, as a cross-multiplied comparison: true when the
 *  close at seq is at least `bps` above the close LOOKBACK_BARS bars earlier. */
function returnAtLeast(seq: number, bps: number): boolean | null {
  const now = closes[seq];
  const then = closes[seq - LOOKBACK_BARS];
  if (now === null || now === undefined || then === null || then === undefined) return null;
  return now * BPS >= then * (BPS + BigInt(bps));
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // One entry per batch, aligned with its seq.
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    closes.push(bar === undefined ? null : BigInt(bar.c));
    if (state.warmingUp) return [];
    if (bar === undefined) return [];

    const held = state.positions.get(SYMBOL);
    if (held === undefined) {
      peak = null;
      const up = returnAtLeast(batch.seq, ENTRY_BPS);
      const cooled = lastExitSeq === null || batch.seq - lastExitSeq >= REENTRY_COOLDOWN_BARS;
      if (up === true && cooled) {
        const cash = state.cash;
        if (cash >= BigInt(state.hello.fees.min_notional_quote_units)) {
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Holding: track the peak and exit on a reversal or the trailing stop.
    const close = BigInt(bar.c);
    peak = peak === null || close > peak ? close : peak;
    const reversed = returnAtLeast(batch.seq, EXIT_BPS);
    const stopped = close * BPS <= peak * (BPS - BigInt(TRAIL_BPS));
    if (reversed === false || stopped) {
      peak = null;
      lastExitSeq = batch.seq;
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
