import { prisma } from "../../db/prisma.mjs";
import { config } from "../../config/config.mjs";
import { AuthError } from "../auth/auth.service.mjs";
import { polarAccess } from "../pro/pro.service.mjs";
import * as client from "./polar.client.mjs";

export const PLANS = ["early_access", "pro", "sponsor"];
export const PERIODS = ["monthly", "yearly"];
const PERIOD_OF_INTERVAL = { month: "monthly", year: "yearly" };
const PRODUCTS_TTL_MS = 10 * 60 * 1000;

const siteUrl = () => (config.frontend_url || "https://www.sketchshaper.com").replace(/\/+$/, "");

// Polar tells us about every change to a subscription. The newest event for a subscription wins, so a late or
// repeated delivery changes nothing. Returns what happened, for the logs and the tests.
export async function applyEvent(event) {
  const sub = event?.data;
  if (!String(event?.type).startsWith("subscription.") || !sub?.id) return "ignored";

  // The account was named when the checkout was made (external_customer_id = our SiteUser id)
  const userId = Number(sub.customer?.external_id);
  const plan = sub.product?.metadata?.plan;
  const period = sub.product?.metadata?.period || PERIOD_OF_INTERVAL[sub.recurring_interval];
  const at = new Date(event.timestamp);
  if (!Number.isInteger(userId) || userId < 1 || !PLANS.includes(plan) || !PERIODS.includes(period) || Number.isNaN(at.getTime())) {
    console.error("Polar: ignored a subscription event we cannot place:", event.type, sub.id);
    return "ignored";
  }
  if (!(await prisma.siteUser.findUnique({ where: { id: userId }, select: { id: true } }))) return "ignored";

  const existing = await prisma.polarSubscription.findUnique({ where: { polar_subscription_id: sub.id } });
  // Older than what we already know, or claiming a subscription that belongs to another account
  if (existing && (existing.site_user_id !== userId || existing.last_event_at > at)) return "ignored";

  const data = {
    polar_customer_id: String(sub.customer_id || sub.customer.id).slice(0, 64),
    plan,
    period,
    status: String(sub.status).slice(0, 20),
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end) : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    last_event_at: at,
  };
  await prisma.polarSubscription.upsert({
    where: { polar_subscription_id: sub.id },
    create: { polar_subscription_id: sub.id, site_user_id: userId, ...data },
    update: data,
  });
  return "applied";
}

// Products are found by the plan and period written in their metadata, so the same code works in the sandbox
// and live (their ids differ). The list is kept for a few minutes.
let products = { at: 0, ids: new Map() };
async function productFor(plan, period) {
  if (Date.now() - products.at > PRODUCTS_TTL_MS) {
    const { items = [] } = await client.listProducts();
    const ids = new Map(
      items.filter((p) => !p.is_archived && p.metadata?.plan && p.metadata?.period).map((p) => [`${p.metadata.plan}:${p.metadata.period}`, p.id]),
    );
    products = { at: Date.now(), ids };
  }
  const id = products.ids.get(`${plan}:${period}`);
  if (!id) throw new AuthError("This plan is not available right now.", 503);
  return id;
}

// The address of Polar's payment page for this plan. Someone who already has a live plan is sent to billing
// instead, so they are not charged twice.
export async function startCheckout(user, plan, period) {
  if (!PLANS.includes(plan) || !PERIODS.includes(period)) throw new AuthError("Choose a plan and a billing period.");
  const subs = await prisma.polarSubscription.findMany({ where: { site_user_id: user.id } });
  if (polarAccess(subs)) throw new AuthError("You already have a membership. Use Manage billing to change or cancel it.", 409);

  const checkout = await client.createCheckout({
    products: [await productFor(plan, period)],
    external_customer_id: String(user.id),
    customer_email: user.email,
    success_url: `${siteUrl()}/pricing?checkout=success`,
    return_url: `${siteUrl()}/pricing`,
  });
  return checkout.url;
}

// Polar's billing page (change card, cancel, invoices) for someone who has bought a plan
export async function startPortal(user) {
  if (!(await prisma.polarSubscription.count({ where: { site_user_id: user.id } }))) {
    throw new AuthError("There is no membership to manage.", 404);
  }
  const session = await client.createCustomerSession(String(user.id), `${siteUrl()}/pricing`);
  return session.customer_portal_url;
}
