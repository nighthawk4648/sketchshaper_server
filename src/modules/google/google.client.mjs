import axios from "axios";
import { config } from "../../config/config.mjs";

const TIMEOUT = 10000;

export const isConfigured = () =>
  Boolean(config.google_client_id && config.google_client_secret && config.google_redirect_uri);

// Logs what Google said, never the codes or tokens we sent
function failed(action, err) {
  console.error(`Google ${action} failed:`, err.response?.status, err.response?.data?.error || err.message);
  return new Error(`Google ${action} failed`);
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: config.google_client_id,
    redirect_uri: config.google_redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${config.google_authorize_url}?${params}`;
}

export async function exchangeCode(code) {
  try {
    const res = await axios.post(
      config.google_token_url,
      new URLSearchParams({
        code,
        client_id: config.google_client_id,
        client_secret: config.google_client_secret,
        redirect_uri: config.google_redirect_uri,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, timeout: TIMEOUT },
    );
    return res.data;
  } catch (err) {
    throw failed("code exchange", err);
  }
}

// `sub` is Google's permanent id for the person; the email can change, the id cannot
export const parseProfile = (body) => ({
  googleId: String(body?.sub || ""),
  email: String(body?.email || "").trim().toLowerCase(),
  name: body?.name || null,
  emailVerified: body?.email_verified === true || body?.email_verified === "true",
});

export async function fetchProfile(accessToken) {
  try {
    const res = await axios.get(config.google_userinfo_url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: TIMEOUT,
    });
    return parseProfile(res.data);
  } catch (err) {
    throw failed("profile lookup", err);
  }
}
