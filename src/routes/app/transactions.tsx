import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Paywall, Pill } from "@/components/ui";
import { usd, when } from "@/lib/grok/format";
import { confirmPrepared, getOrders } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/transactions")({ component: TxPage });

function TxPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrders>> | null>(null);
  const [error, setError] = useState("");
  function load() {
    getOrders().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }
  useEffect(() => { load(); }, []);
  if (error.includes("Offre")) return <Paywall title="Transactions" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <p className="text-sm text-muted">Toute ligne marquée simulée n’a pas de signature blockchain. Rien n’a été envoyé sur Solana.</p>
      <h2 className="font-semibold">Ordres</h2>
      {data?.orders.map((o) => (
        <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-semibold">{o.side.toUpperCase()} {o.symbol}</p>
            <p className="text-muted">{o.reason}</p>
            <p className="text-xs text-muted">{when(o.at)} · {o.mode}</p>
          </div>
          <div className="text-right">
            <Pill tone={o.status === "filled" ? "up" : o.status === "rejected" ? "down" : "neutral"}>{o.status}</Pill>
            <p className="num mt-1">{usd(o.size)}</p>
            {o.status === "awaiting_signature" ? (
              <button
                type="button"
                className="mt-2 h-11 rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent"
                onClick={() => confirmPrepared({ data: { id: o.id } }).then((r) => { toast(r.message); load(); })}
              >
                Confirmer la simulation
              </button>
            ) : null}
          </div>
        </Card>
      ))}
      <h2 className="font-semibold">Exécutions</h2>
      {data?.executions.map((e) => (
        <Card key={e.id} className="grid gap-1 p-4 text-sm sm:grid-cols-4">
          <p className="font-semibold">{e.side.toUpperCase()} {e.symbol}</p>
          <p className="num">{usd(e.price, e.price >= 1 ? 2 : 6)}</p>
          <p className="num">frais {usd(e.fee)}</p>
          <p>{e.simulated ? "Simulé" : e.signature ?? "on-chain"}</p>
        </Card>
      ))}
      {data && data.orders.length === 0 ? <p className="text-sm text-muted">Aucun ordre.</p> : null}
    </div>
  );
}
