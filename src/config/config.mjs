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
};
