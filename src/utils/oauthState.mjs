import crypto from "crypto";
import { config } from "../config/config.mjs";
import { safeNext } from "./safeNext.mjs";

// The "state" handshake every OAuth sign-in needs: a random value goes to the provider and into a short-lived
// cookie; it must come back unchanged, or the return is not the sign-in we started (blocks forged logins).
export function oauthCookie({ name, path }) {
  const options = {
    httpOnly: true,
    secure: config.mode !== "dev",
    sameSite: "lax", // the provider's redirect back is a normal navigation, which Lax allows
    path,
  };
  return {
    // Remembers state + where to return to, and gives back the state to send to the provider
    begin(res, nextRaw) {
      const state = crypto.randomBytes(24).toString("base64url");
      const saved = Buffer.from(JSON.stringify({ state, next: safeNext(nextRaw) })).toString("base64url");
      res.cookie(name, saved, { ...options, maxAge: 10 * 60 * 1000 });
      return state;
    },
    // Reads (and clears) what begin() stored; null when missing or unreadable
    take(req, res, readCookie) {
      res.clearCookie(name, options);
      try {
        return JSON.parse(Buffer.from(readCookie(req, name) || "", "base64url").toString("utf8"));
      } catch {
        return null;
      }
    },
  };
}

export const sameValue = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
