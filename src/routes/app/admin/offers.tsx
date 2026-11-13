import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui";
import { FEATURE_KEYS } from "@/lib/grok/pure";
import { adminCoupons, adminCreateCoupon, adminPlans, adminSavePlan } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/admin/offers")({ component: OffersPage });

function OffersPage() {
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof adminPlans>>>([]);
  const [coupons, setCoupons] = useState<Awaited<ReturnType<typeof adminCoupons>>>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [error, setError] = useState("");
  function load() {
    adminPlans().then(setPlans).catch((e: unknown) => setError(e instanceof Error ? e.message : "Refusé"));
    adminCoupons().then(setCoupons).catch(() => undefined);
  }
  useEffect(() => { load(); }, []);
  if (error) return <p className="text-sm text-down">{error}</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Offres</h1>
      <p className="text-sm text-muted">
        Ne collez qu’un Price ID créé dans le compte Stripe de Grok Bot. Jamais un Price ID du premier site.
      </p>
      {plans.map((p) => (
        <Card key={p.id} className="space-y-3 p-4">
          <p className="text-xs text-muted">{p.code}</p>
          <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" defaultValue={p.name}
            onBlur={(e) => adminSavePlan({ data: { id: p.id, name: e.target.value } }).then(() => toast("Nom enregistré"))} />
          <textarea className="min-h-20 w-full rounded-xl border border-line bg-surface p-3 text-sm" defaultValue={p.description}
            onBlur={(e) => adminSavePlan({ data: { id: p.id, description: e.target.value } })} />
          <label className="block text-sm">
            Prix en centimes
            <input className="num mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3" type="number" defaultValue={p.priceCents}
              onBlur={(e) => adminSavePlan({ data: { id: p.id, priceCents: Number(e.target.value) } })} />
          </label>
          <label className="block text-sm">
            Price ID Stripe
            <input className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3" defaultValue={p.stripePriceId ?? ""} placeholder="price_…"
              onBlur={(e) => adminSavePlan({ data: { id: p.id, stripePriceId: e.target.value } }).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Refusé"))} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" defaultChecked={p.active} onChange={(e) => adminSavePlan({ data: { id: p.id, active: e.target.checked } })} />
            Offre visible
          </label>
          <div className="flex flex-wrap gap-2">
            {FEATURE_KEYS.map((f) => {
              const on = p.features.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  className={`h-9 rounded-full px-3 text-xs ${on ? "bg-soft text-up" : "border border-line text-muted"}`}
                  onClick={() => {
                    const features = on ? p.features.filter((x) => x !== f) : [...p.features, f];
                    adminSavePlan({ data: { id: p.id, features } }).then(load);
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <Card className="space-y-3 p-4">
        <h2 className="font-semibold">Coupon</h2>
        <div className="flex flex-wrap gap-2">
          <input className="h-11 rounded-xl border border-line bg-surface px-3" value={code} onChange={(e) => setCode(e.target.value)} placeholder="GROKBOT10" />
          <input className="num h-11 w-24 rounded-xl border border-line bg-surface px-3" type="number" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
          <button type="button" className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent" onClick={() => adminCreateCoupon({ data: { code, percent } }).then(load).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"))}>
            Créer
          </button>
        </div>
        {coupons.map((c) => <p key={c.code} className="text-sm">{c.code} · {c.percent} %</p>)}
      </Card>
    </div>
  );
}
