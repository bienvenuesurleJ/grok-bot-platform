import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { getShell } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/owner")({ component: OwnerPage });

const RIGHTS = [
  "Tous les bots et toutes les stratégies",
  "Tous les agents et l’assistant",
  "Rapports, statistiques, wallets en lecture",
  "Administration complète",
  "Simulation, mode assisté, préparation automatisée",
  "Aucun abonnement, aucun passage Stripe, aucune expiration logicielle",
];

function OwnerPage() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { getShell().then((s) => setRole(s.role)).catch(() => setRole("")); }, []);
  if (role && role !== "OWNER") {
    return <Card className="p-5 text-sm">Cette page est réservée au propriétaire. Votre rôle est {role}.</Card>;
  }
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Compte propriétaire</h1>
      <p className="text-sm text-muted">
        Le rôle OWNER est posé côté serveur, au premier compte qui revendique la plateforme. Il n’est pas achetable et un client ne peut pas se l’attribuer.
      </p>
      <Card className="space-y-2 p-4">
        {RIGHTS.map((r) => <p key={r} className="text-sm">{r}</p>)}
      </Card>
      <Card className="space-y-2 p-4 text-sm text-muted">
        <p>La gratuité couvre le logiciel. Elle ne couvre pas l’API xAI, l’hébergement, les données payantes, les frais de chaîne ni les frais Stripe si vous encaissez des clients.</p>
        <Link to="/mise-en-service" className="font-semibold text-up">Voir la mise en service</Link>
      </Card>
    </div>
  );
}
