import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/logo";

export function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <Wordmark />
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
      <p className="text-muted">Document d’information produit, pas un conseil juridique. Faites-le relire avant commercialisation.</p>
      <Link to="/" className="inline-flex h-11 items-center font-semibold text-up">Retour</Link>
    </main>
  );
}
