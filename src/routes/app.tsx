import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { AppShell } from "@/components/shell";

export const Route = createFileRoute("/app")({
  component: AppGate,
});

function AppGate() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-line" />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <AppShell />;
}
