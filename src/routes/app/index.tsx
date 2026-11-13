import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EquityChart } from "@/components/equity-chart";
import { Card, Paywall, Pill } from "@/components/ui";
import { compact, pct, tone, usd, when } from "@/lib/grok/format";
import { getDashboard, refreshEngine, type Dashboard } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Tableau · Grok Bot" }] }),
});

const RANGES = [
  { id: "1h", ms: 3_600_000, label: "1 heure" },
  { id: "24h", ms: 86_400_000, label: "24 heures" },
  { id: "7d", ms: 7 * 86_400_000, label: "7 jours" },
  { id: "30d", ms: 30 * 86_400_000, label: "30 jours" },
  { id: "all", ms: Infinity, label: "Tout" },
] as const;

function DashboardPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const [auto, setAuto] = useState(true);

  async function load(forceEngine: boolean) {
    setBusy(true);
    try {
      if (forceEngine) {
        const res = await refreshEngine();
        setDash(res.dash);
      } else {
        setDash(await getDashboard());
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem("gb-auto");
    const enabled = stored !== "0";
    setAuto(enabled);
    void load(enabled);
    // initial engine pass is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 45_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const series = useMemo(() => {
    if (!dash) return [];
    const span = RANGES.find((r) => r.id === range)?.ms ?? Infinity;
    return dash.series.filter((p) => span === Infinity || Date.now() - new Date(p.t).getTime() <= span);
  }, [dash, range]);

  if (error) return <Paywall title="Tableau indisponible" />;
  if (!dash) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  if (!dash.allowed) return <Paywall title="Tableau de bord" />;

  const stats = [
    ["Capital initial", usd(dash.initial), "text-ink"],
    ["Valeur marquée", usd(dash.equity), "text-ink"],
    ["Résultat", usd(dash.pnl), tone(dash.pnl)],
    ["Performance", pct(dash.pnlPct), tone(dash.pnlPct)],
    ["Transactions", String(dash.txCount), "text-ink"],
    ["Positions ouvertes", String(dash.openPositions), "text-ink"],
    ["Positions clôturées", String(dash.closedPositions), "text-ink"],
    ["Frais simulés", usd(dash.fees), "text-ink"],
    ["Cash disponible", usd(dash.cash), "text-ink"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{dash.bot?.name ?? "Grok Core"}</h1>
            <Pill tone={dash.live === "LIVE" ? "up" : "down"}>{dash.live}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted">
            {dash.bot?.network} · mode {dash.bot?.mode} · portefeuille simulé, prix DexScreener
            {dash.wallet ? ` · ${dash.wallet.name} ${short(dash.wallet.address)}` : " · wallet non connecté"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-11 rounded-xl border border-line px-3 text-sm"
            onClick={() => {
              const next = !auto;
              setAuto(next);
              localStorage.setItem("gb-auto", next ? "1" : "0");
            }}
          >
            {auto ? "Auto ouvert" : "Auto coupé"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
            onClick={() => void load(true)}
          >
            {busy ? "Lecture…" : "Passer le moteur"}
          </button>
        </div>
      </div>
      {dash.marketError ? (
        <p className="rounded-xl bg-soft-down px-3 py-2 text-sm text-down">Prix indisponibles : {dash.marketError}. Aucun chiffre inventé.</p>
      ) : null}
      <p className="text-sm text-muted">
        Le moteur tourne tant que cette page reste ouverte. Il ne continue pas seul une fois le navigateur fermé : aucun worker permanent n’est hébergé ici.
        {dash.entriesHalted ? " Nouvelles entrées arrêtées." : ""}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map(([label, value, color]) => (
          <Card key={label} className="px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className={`num mt-1 text-xl font-medium ${color}`}>{value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={`h-9 rounded-full px-3 text-xs font-semibold ${range === item.id ? "bg-ink text-bg" : "text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <EquityChart points={series} />
      </Card>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {dash.markets.map((m) => (
          <Card key={m.address} className="min-w-44 shrink-0 px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">{m.symbol}</p>
              <p className={`num text-sm ${tone(m.changeH24)}`}>{pct(m.changeH24)}</p>
            </div>
            <p className="num text-sm">{usd(m.priceUsd, m.priceUsd >= 1 ? 2 : 6)}</p>
            <p className="text-xs text-muted">Vol. {compact(m.volumeH24)}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <h2 className="font-semibold">Dernières décisions</h2>
        <ul className="mt-3 divide-y divide-line">
          {dash.decisions.length === 0 ? <li className="py-3 text-sm text-muted">Aucune décision. Lancez le moteur.</li> : null}
          {dash.decisions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
              <span className="font-medium">
                {d.action} {d.symbol ?? ""} <span className="text-muted">· {d.agent}</span>
              </span>
              <span className="text-muted">{when(d.at)}</span>
              <p className="w-full text-muted">{d.reason}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function short(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
