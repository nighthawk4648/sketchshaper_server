import axios from "axios";
import { config } from "../../config/config.mjs";
import { AuthError } from "../auth/auth.service.mjs";

const TIMEOUT = 10000;

// Polar answered with an error or could not be reached; the visitor only sees a friendly message
export class PolarApiError extends AuthError {
  constructor() {
    super("Could not reach our payment provider. Please try again in a moment.", 502);
  }
}

// Logs what Polar said, never the access token
async function call(action, method, path, data) {
  try {
    const res = await axios({
      method,
      url: `${config.polar_api_url}${path}`,
      data,
      timeout: TIMEOUT,
      headers: { Authorization: `Bearer ${config.polar_access_token}` },
    });
    return res.data;
  } catch (err) {
    console.error(`Polar ${action} failed:`, err.response?.status, JSON.stringify(err.response?.data || err.message).slice(0, 300));
    throw new PolarApiError();
  }
}

export const listProducts = () => call("product list", "get", "/products/?is_archived=false&limit=100");
export const createCheckout = (body) => call("checkout", "post", "/checkouts/", body);
export const createCustomerSession = (externalCustomerId, returnUrl) =>
  call("customer session", "post", "/customer-sessions/", { external_customer_id: externalCustomerId, return_url: returnUrl });
