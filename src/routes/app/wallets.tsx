import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Paywall } from "@/components/ui";
import { connectWallet, disconnectWallet, walletBalance } from "@/lib/grok/fns";
import { detectWallet } from "@/lib/grok/phantom";

export const Route = createFileRoute("/app/wallets")({ component: WalletsPage });

function WalletsPage() {
  const [found, setFound] = useState<string>("Recherche…");
  const [address, setAddress] = useState<string | null>(null);
  const [sol, setSol] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    const detected = detectWallet();
    setFound(detected ? detected.name : "Aucun wallet injecté dans ce navigateur");
    setError("");
  }, []);

  if (error.includes("Offre")) return <Paywall title="Wallets" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Wallets</h1>
      <Card className="space-y-3 p-4">
        <p className="text-sm">Détecté : {found}</p>
        <p className="text-sm text-muted">
          Connexion en lecture. Aucune phrase de récupération. Aucun transfert automatique. Réseau visé : Solana mainnet.
          Ethereum, Base et BNB ne sont pas branchés.
        </p>
        <button
          type="button"
          className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
          onClick={async () => {
            const detected = detectWallet();
            if (!detected) {
              toast.error("Phantom ou Solflare n’est pas disponible dans cet aperçu.");
              return;
            }
            try {
              const res = await detected.provider.connect();
              const pub = res.publicKey.toString();
              await connectWallet({ data: { address: pub, name: detected.name } });
              setAddress(pub);
              const bal = await walletBalance({ data: { address: pub } });
              setSol(`${bal.sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} SOL`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Connexion impossible");
            }
          }}
        >
          Connecter
        </button>
        {address ? (
          <div className="text-sm">
            <p className="num break-all">{address}</p>
            <p className="mt-1">Solde réel : {sol || "…"}</p>
            <button
              type="button"
              className="mt-3 h-11 rounded-xl border border-line px-3"
              onClick={() => disconnectWallet({ data: { address } }).then(() => { setAddress(null); setSol(""); })}
            >
              Retirer de ce compte
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
