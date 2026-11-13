import { createFileRoute } from "@tanstack/react-router";
import { Terminal } from "@/components/terminal";

export const Route = createFileRoute("/app/")({
  component: Terminal,
  head: () => ({ meta: [{ title: "Grok Bot" }] }),
});
