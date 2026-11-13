import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getShell, saveProfile } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/profile")({ component: ProfilePage });

function ProfilePage() {
  const user = useCurrentUser();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  useEffect(() => {
    getShell()
      .then((s) => {
        setName(s.displayName || user?.displayName || "");
        setRole(s.role);
      })
      .catch(() => undefined);
  }, [user?.displayName]);
  return (
    <Card className="max-w-lg space-y-4 p-5">
      <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
      <p className="text-sm text-muted">{user?.primaryEmail}</p>
      <p className="text-sm">Rôle {role}. Il n’est pas modifiable depuis ce formulaire.</p>
      <label className="block text-sm">
        Nom affiché
        <input
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent"
        onClick={() => saveProfile({ data: { displayName: name } }).then(() => toast("Profil enregistré"))}
      >
        Enregistrer
      </button>
      <UserButton />
    </Card>
  );
}
