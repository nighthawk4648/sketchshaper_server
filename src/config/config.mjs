import "dotenv/config";

const {
  MODE,
  DEV_PORT,
  PROD_PORT,
  DEV_HOST,
  PROD_HOST,
  JWT_SECRET,
  PATREON_CLIENT_ID,
  PATREON_CLIENT_SECRET,
  PATREON_REDIRECT_URI,
  PATREON_CAMPAIGN_ID,
  FRONTEND_URL,
  BREVO_API_KEY,
  MAIL_FROM,
  MAIL_FROM_NAME,
  MAIL_REPLY_TO,
  TOKEN_ENCRYPTION_KEY,
  PATREON_BASE_URL,
} = process.env;

export const config = {
  mode: MODE,
  port: MODE === "dev" ? DEV_PORT : PROD_PORT,
  host: MODE === "dev" ? DEV_HOST : PROD_HOST,
  jwt_secret: JWT_SECRET,
  patreon_client_id: PATREON_CLIENT_ID,
  patreon_client_secret: PATREON_CLIENT_SECRET,
  patreon_redirect_uri: PATREON_REDIRECT_URI,
  patreon_campaign_id: PATREON_CAMPAIGN_ID,
  frontend_url: FRONTEND_URL,
  brevo_api_key: BREVO_API_KEY,
  mail_from: MAIL_FROM,
  mail_from_name: MAIL_FROM_NAME || "Sketch shaper",
  mail_reply_to: MAIL_REPLY_TO,
  token_encryption_key: TOKEN_ENCRYPTION_KEY,
  // Only tests point this at a fake Patreon
  patreon_base_url: (PATREON_BASE_URL || "https://www.patreon.com").replace(/\/+$/, ""),
};
