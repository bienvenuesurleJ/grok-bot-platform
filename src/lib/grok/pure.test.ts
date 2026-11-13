import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFill,
  assessSafety,
  lastNightWindow,
  markedEquity,
  maxDrawdown,
  pnlFrom,
  positionSize,
  wantsBuy,
} from "./pure.ts";

test("safety blocks thin liquidity", () => {
  const s = assessSafety({ liquidityUsd: 1000, volumeH24: 100, changeH1: 1, changeH24: 2 });
  assert.equal(s.blocked, true);
});

test("safety passes a deep market", () => {
  const s = assessSafety({
    liquidityUsd: 2_000_000,
    volumeH24: 8_000_000,
    changeH1: 0.2,
    changeH24: -1,
  });
  assert.equal(s.blocked, false);
});

test("risk blocks buys when halted and still allows sells", () => {
  const base = {
    cash: 5000,
    equity: 10000,
    riskPerTradeBps: 100,
    maxPositionUsd: 500,
    maxExposureUsd: 4000,
    currentExposure: 0,
    maxOpen: 4,
    openCount: 0,
    dailyPnl: 0,
    dailyLossLimit: 300,
    stopLossBps: 600,
    sizeScale: 1,
    entriesHalted: true,
    emergency: false,
  };
  assert.equal(positionSize({ ...base, side: "buy" }).ok, false);
  assert.equal(positionSize({ ...base, side: "sell", emergency: true, entriesHalted: false }).ok, true);
});

test("buy size respects the position cap", () => {
  const r = positionSize({
    cash: 9000,
    equity: 10000,
    riskPerTradeBps: 500,
    maxPositionUsd: 200,
    maxExposureUsd: 4000,
    currentExposure: 0,
    maxOpen: 4,
    openCount: 0,
    dailyPnl: 0,
    dailyLossLimit: 300,
    stopLossBps: 500,
    sizeScale: 1,
    entriesHalted: false,
    emergency: false,
    side: "buy",
  });
  assert.equal(r.ok, true);
  assert.ok(r.usd <= 200);
});

test("paper fill charges fee and adverse slippage", () => {
  const buy = applyFill({ side: "buy", mark: 100, usd: 1000, slippageBps: 30, feeBps: 30 });
  assert.ok(buy.price > 100);
  assert.ok(buy.fee > 0);
  const sell = applyFill({
    side: "sell",
    mark: 110,
    qty: buy.qty,
    avgPrice: buy.price,
    slippageBps: 30,
    feeBps: 30,
  });
  assert.ok((sell.pnl ?? 0) > 0);
});

test("equity and drawdown", () => {
  const m = markedEquity(1000, [{ qty: 2, price: 50 }]);
  assert.equal(m.equity, 1100);
  assert.equal(pnlFrom(1100, 1000).pct, 10);
  assert.ok(maxDrawdown([100, 120, 90, 110]) > 20);
});

test("momentum strategy refuses a blocked token", () => {
  const r = wantsBuy(
    "momentum",
    { minH1: 1, minH24: 0, minScore: 60, minLiq: 10 },
    { symbol: "SOL", liquidityUsd: 1e6, volumeH24: 1e6, changeH1: 3, changeH24: 2 },
    true,
    80,
  );
  assert.equal(r.ok, false);
});

test("night window ends at 08:00 Paris and lasts until the start hour", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const w = lastNightWindow(22, 8, now);
  assert.ok(w.end.getTime() > w.start.getTime());
  assert.equal(w.end.getTime() - w.start.getTime(), 10 * 60 * 60 * 1000);
});
