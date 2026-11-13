import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const look =
    variant === "primary"
      ? "bg-accent text-on-accent"
      : variant === "danger"
        ? "bg-down text-on-accent"
        : "border border-line bg-surface text-ink";
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "up" | "down" | "neutral";
}) {
  const look =
    tone === "up" ? "bg-soft text-up" : tone === "down" ? "bg-soft-down text-down" : "bg-bg text-muted";
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ${look}`}>
      {children}
    </span>
  );
}

export function Paywall({ title }: { title: string }) {
  return (
    <Card className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Accès</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">
        Cette fonction dépend d’une offre active. Aucun paiement n’a été enregistré pour ce compte, et
        l’interface ne débloque rien toute seule.
      </p>
      <Link to="/app/billing" className="mt-5 inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
        Voir les offres
      </Link>
    </Card>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent";
