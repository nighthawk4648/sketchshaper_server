import { config } from "../config/config.mjs";

const site = () => (config.frontend_url || "https://www.sketchshaper.com").replace(/\/+$/, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const wrap = (title, lines, link) => ({
  text: `${lines.join("\n\n")}${link ? `\n\n${link}` : ""}\n\n— Sketch shaper`,
  html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#111">
<h2 style="margin:0 0 16px">${esc(title)}</h2>
${lines.map((l) => `<p style="line-height:1.5">${esc(l)}</p>`).join("")}
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Open link</a></p><p style="font-size:12px;color:#555;word-break:break-all">${esc(link)}</p>` : ""}
<p style="color:#555;font-size:13px">— Sketch shaper</p></div>`,
});

export const verifyEmail = (token) => ({
  subject: "Confirm your email",
  ...wrap(
    "Confirm your email",
    ["Welcome to Sketch shaper. Please confirm this email address to finish creating your account.", "The link works for 24 hours. If you did not sign up, you can ignore this email."],
    `${site()}/verify-email?token=${token}`,
  ),
});

export const resetPassword = (token) => ({
  subject: "Reset your password",
  ...wrap(
    "Reset your password",
    ["We received a request to reset your password.", "The link works for 1 hour. If this was not you, you can ignore this email and your password stays the same."],
    `${site()}/reset-password?token=${token}`,
  ),
});

export const passwordChanged = () => ({
  subject: "Your password was changed",
  ...wrap("Your password was changed", ["The password for your Sketch shaper account was just changed.", "If this was not you, reset your password right away and contact us."]),
});

export const alreadyRegistered = () => ({
  subject: "You already have an account",
  ...wrap("You already have an account", ["Someone tried to sign up with this email, but an account already exists.", `You can sign in at ${site()}/login, or reset your password from the sign-in page.`]),
});
