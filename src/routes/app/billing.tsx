import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Pill } from "@/components/ui";
import { eur, when } from "@/lib/grok/format";
import { getBilling, startCheckout } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/billing")({ component: BillingPage });

function BillingPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getBilling>> | null>(null);
  useEffect(() => { getBilling().then(setData).catch(() => setData(null)); }, []);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Offres et facturation</h1>
      {data.owner ? (
        <Card className="p-4 text-sm">
          Compte propriétaire. L’accès logiciel est gratuit et permanent. Les frais externes (API, RPC, chaîne, hébergement) restent dus.
          Aucun abonnement Stripe n’est exigé.
        </Card>
      ) : (
        <p className="text-sm text-muted">Les prix à 0 € sont des tarifs non publiés, pas une offre gratuite.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.plans.filter((p) => p.active).map((p) => (
          <Card key={p.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              <Pill>{p.code}</Pill>
            </div>
            <p className="text-sm text-muted">{p.description}</p>
            <p className="num text-xl">{p.priceCents === 0 ? "Tarif à définir" : eur(p.priceCents)} <span className="text-sm text-muted">{p.billing}</span></p>
            <ul className="text-sm text-muted">
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button
              type="button"
              className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
              onClick={() =>
                startCheckout({ data: { planId: p.id } }).then((res) => {
                  if (!res.ok) toast(res.reason);
                  else if (res.url) window.location.href = res.url;
                })
              }
            >
              Souscrire
            </button>
          </Card>
        ))}
      </div>
      <h2 className="font-semibold">Abonnements</h2>
      {data.subscriptions.length === 0 ? <p className="text-sm text-muted">Aucun abonnement.</p> : null}
      {data.subscriptions.map((s) => (
        <Card key={s.id} className="flex justify-between p-4 text-sm">
          <span>{s.planId} · {s.status} · {s.source}</span>
          <span className="text-muted">{s.ends ? when(s.ends) : "sans échéance"}</span>
        </Card>
      ))}
      <h2 className="font-semibold">Paiements</h2>
      {data.payments.length === 0 ? <p className="text-sm text-muted">Aucun encaissement. Rien n’est inventé.</p> : null}
      {data.payments.map((p) => (
        <Card key={p.id} className="flex justify-between p-4 text-sm">
          <span>{p.status} · {p.note}</span>
          <span className="num">{eur(p.amountCents)}</span>
        </Card>
      ))}
    </div>
  );
}
