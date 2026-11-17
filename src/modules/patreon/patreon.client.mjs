import axios from "axios";
import { config } from "../../config/config.mjs";

const SCOPE = "identity identity[email] identity.memberships";
const TIMEOUT = 10000;

// Thrown when Patreon answered but no longer accepts the token (as opposed to being unreachable)
export class PatreonApiError extends Error {
  constructor(message, authFailed) {
    super(message);
    this.authFailed = authFailed;
  }
}

// Logs what Patreon said, never the tokens we sent
function wrap(action, err) {
  const status = err.response?.status;
  console.error(`Patreon ${action} failed:`, status, err.response?.data?.error || err.message);
  return new PatreonApiError(`Patreon ${action} failed`, status === 400 || status === 401);
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.patreon_client_id,
    redirect_uri: config.patreon_redirect_uri,
    scope: SCOPE,
    state,
  });
  return `${config.patreon_base_url}/oauth2/authorize?${params}`;
}

async function tokenRequest(action, fields) {
  try {
    const res = await axios.post(
      `${config.patreon_base_url}/api/oauth2/token`,
      new URLSearchParams({
        ...fields,
        client_id: config.patreon_client_id,
        client_secret: config.patreon_client_secret,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, timeout: TIMEOUT },
    );
    return res.data;
  } catch (err) {
    throw wrap(action, err);
  }
}

export const exchangeCode = (code) =>
  tokenRequest("code exchange", { code, grant_type: "authorization_code", redirect_uri: config.patreon_redirect_uri });

export const refreshTokens = (refreshToken) =>
  tokenRequest("token refresh", { grant_type: "refresh_token", refresh_token: refreshToken });

// The name of the tier (as set on Patreon) the member is entitled to; the priciest one if several
function tierTitle(body, member) {
  const ids = new Set((member?.relationships?.currently_entitled_tiers?.data || []).map((t) => t.id));
  const tiers = (body?.included || [])
    .filter((t) => t.type === "tier" && ids.has(t.id) && t.attributes?.title)
    .sort((a, b) => (b.attributes.amount_cents || 0) - (a.attributes.amount_cents || 0));
  return tiers[0]?.attributes.title.slice(0, 100) || null;
}

// Turns Patreon's identity answer into what we need. Only a member of OUR campaign counts as a patron.
export function parseIdentity(body) {
  const user = body?.data;
  const campaignId =
    config.patreon_campaign_id && config.patreon_campaign_id !== "your_campaign_id_here"
      ? config.patreon_campaign_id
      : null;
  const active = (body?.included || []).find(
    (m) =>
      m.type === "member" &&
      m.attributes?.patron_status === "active_patron" &&
      (!campaignId || m.relationships?.campaign?.data?.id === campaignId),
  );
  const pledgeCents = active?.attributes?.currently_entitled_amount_cents || 0;
  return {
    patreonId: String(user?.id || ""),
    email: (user?.attributes?.email || "").trim().toLowerCase(),
    fullName: user?.attributes?.full_name || null,
    emailVerified: user?.attributes?.is_email_verified === true,
    isActivePatron: Boolean(active),
    pledgeCents,
    tier: active ? tierTitle(body, active) : null,
  };
}

export async function fetchIdentity(accessToken) {
  try {
    const res = await axios.get(
      `${config.patreon_base_url}/api/oauth2/v2/identity?include=memberships,memberships.campaign,memberships.currently_entitled_tiers` +
        "&fields[user]=email,full_name,is_email_verified" +
        "&fields[member]=patron_status,currently_entitled_amount_cents" +
        "&fields[tier]=title,amount_cents",
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: TIMEOUT },
    );
    return parseIdentity(res.data);
  } catch (err) {
    throw wrap("identity lookup", err);
  }
}
