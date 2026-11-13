import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/logo";

export const Route = createFileRoute("/mot-de-passe")({ component: ForgotPage });

function ForgotPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-md space-y-3">
        <Wordmark />
        <h1 className="text-2xl font-semibold">Mot de passe oublié</h1>
        <p className="text-sm text-muted">
          L’envoi d’e-mail de réinitialisation n’est pas branché. Aucun message ne sera prétendu envoyé.
          Utilisez Google ou X depuis la connexion, ou créez un autre compte e-mail.
        </p>
        <Link to="/login" className="inline-flex h-11 items-center rounded-xl bg-accent px-4 font-semibold text-on-accent">Retour à la connexion</Link>
      </div>
    </main>
  );
}
