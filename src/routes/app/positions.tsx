import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Paywall, Pill } from "@/components/ui";
import { pct, tone, usd, when } from "@/lib/grok/format";
import { closePosition, getPositions } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/positions")({ component: PositionsPage });

function PositionsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPositions>> | null>(null);
  const [error, setError] = useState("");
  function load() {
    getPositions().then(setRows).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }
  useEffect(() => { load(); }, []);
  if (error.includes("Offre")) return <Paywall title="Positions" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
      <p className="text-sm text-muted">Clôturer pendant un arrêt d’urgence reste possible, pour ne pas abandonner une ligne ouverte. C’est une simulation.</p>
      {rows?.map((p) => {
        const pnl = p.status === "open" ? p.unrealized : p.realized;
        const base = p.avg * p.qty;
        return (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{p.symbol}</p>
                <Pill tone={p.status === "open" ? "up" : "neutral"}>{p.status === "open" ? "ouverte" : "clôturée"}</Pill>
              </div>
              <p className="text-sm text-muted">
                Prix moyen {usd(p.avg, p.avg >= 1 ? 2 : 6)} · marque {p.mark == null ? "indisponible" : usd(p.mark, p.mark >= 1 ? 2 : 6)}
              </p>
              <p className="text-xs text-muted">{when(p.openedAt)}</p>
            </div>
            <div className="text-right">
              <p className={`num text-lg ${tone(pnl ?? 0)}`}>{pnl == null ? "—" : usd(pnl)}</p>
              <p className={`num text-xs ${tone(pnl ?? 0)}`}>{pnl == null || base === 0 ? "" : pct((pnl / base) * 100)}</p>
              {p.status === "open" ? (
                <button
                  type="button"
                  className="mt-2 h-11 rounded-xl border border-line px-3 text-sm"
                  onClick={() =>
                    closePosition({ data: { id: p.id } })
                      .then((res) => { toast(res.message); load(); })
                      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"))
                  }
                >
                  Clôturer
                </button>
              ) : null}
            </div>
          </Card>
        );
      })}
      {rows && rows.length === 0 ? <p className="text-sm text-muted">Aucune position. Le moteur n’a encore rien ouvert.</p> : null}
    </div>
  );
}
