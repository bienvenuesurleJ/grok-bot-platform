import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { eur } from "@/lib/grok/format";
import { adminOverview } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/admin/")({ component: AdminHome });

function AdminHome() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    adminOverview().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : "Accès refusé"));
  }, []);
  if (error) return <p className="text-sm text-down">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  const cells = [
    ["Clients", String(data.clients)],
    ["Inscrits 7 j", String(data.fresh)],
    ["Abonnements actifs", String(data.activeSubs)],
    ["Expirés", String(data.expired)],
    ["Encaissé", eur(data.revenueCents)],
    ["Paiements échoués", String(data.failedPayments)],
    ["Bots actifs", String(data.activeBots)],
    ["Erreurs agents 24 h", String(data.agentErrors)],
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
      <p className="text-sm text-muted">
        Urgence {data.emergencyStop ? "active" : "inactive"} · entrées {data.entriesHalted ? "gelées" : "ouvertes"}.
        Le revenu affiché est la somme des paiements au statut payé. Zéro veut dire aucun encaissement.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="num mt-1 text-xl">{v}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link to="/app/admin/clients" className="h-11 rounded-xl border border-line px-3 leading-[2.75rem]">Clients</Link>
        <Link to="/app/admin/bots" className="h-11 rounded-xl border border-line px-3 leading-[2.75rem]">Bots</Link>
        <Link to="/app/admin/offers" className="h-11 rounded-xl border border-line px-3 leading-[2.75rem]">Offres</Link>
        <Link to="/app/admin/logs" className="h-11 rounded-xl border border-line px-3 leading-[2.75rem]">Journaux</Link>
      </div>
    </div>
  );
}
