import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook Grok Bot non configuré", { status: 503 });
        const payload = await request.text();
        const header = request.headers.get("stripe-signature") ?? "";
        if (!validSignature(payload, header, secret)) return new Response("signature invalide", { status: 400 });
        const event = JSON.parse(payload) as {
          id?: string;
          type?: string;
          data?: { object?: Record<string, unknown> };
        };
        const object = event.data?.object ?? {};
        const meta = (object.metadata ?? {}) as Record<string, string>;
        if (meta.project !== "grok_bot") return new Response("ignoré", { status: 200 });
        const eventId = event.id;
        if (!eventId) return new Response("événement sans id", { status: 400 });
        const sql = await getSql();
        const inserted = await sql<{ id: number }>`
          insert into payments (user_id, plan_id, amount_cents, currency, status, stripe_event_id, note)
          values (
            ${meta.customer_id || "unknown"},
            ${meta.plan_id || null},
            ${Number(object.amount_total ?? object.amount_paid ?? 0)},
            ${String(object.currency ?? "eur")},
            ${event.type === "invoice.payment_failed" ? "failed" : "paid"},
            ${eventId},
            ${event.type ?? ""}
          )
          on conflict (stripe_event_id) do nothing
          returning id
        `;
        if (inserted.length === 0) return new Response("déjà traité", { status: 200 });
        if (meta.customer_id && meta.plan_id && event.type !== "invoice.payment_failed" && event.type !== "customer.subscription.deleted") {
          await sql`
            insert into subscriptions (user_id, plan_id, status, source, stripe_subscription_id)
            values (${meta.customer_id}, ${meta.plan_id}, 'active', 'stripe', ${String(object.subscription ?? object.id ?? "")})
          `;
        }
        if (event.type === "customer.subscription.deleted" && meta.customer_id) {
          await sql`
            update subscriptions set status = 'canceled'
            where user_id = ${meta.customer_id} and source = 'stripe' and status = 'active'
          `;
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

function validSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [k, v] = part.split("=");
    return [k, v];
  }));
  const stamp = parts.t;
  const v1 = parts.v1;
  if (!stamp || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(stamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${stamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
