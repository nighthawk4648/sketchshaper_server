import axios from "axios";
import { config } from "../config/config.mjs";

// Without a Brevo key (local dev, tests) mail is kept here instead of being sent
export const devOutbox = [];

export async function sendMail({ to, subject, text, html }) {
  // Tests (node --test) must never send real mail, even when a real key is in .env
  const underTest = Boolean(process.env.NODE_TEST_CONTEXT);
  if (!config.brevo_api_key || underTest) {
    if (config.mode !== "dev" && !underTest) {
      throw new Error("BREVO_API_KEY is not set, so no email can be sent");
    }
    devOutbox.push({ to, subject, text });
    if (devOutbox.length > 50) devOutbox.shift();
    console.log(`\n[mail → ${to}] ${subject}\n${text}\n`);
    return;
  }

  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: { email: config.mail_from, name: config.mail_from_name },
      to: [{ email: to }],
      ...(config.mail_reply_to && { replyTo: { email: config.mail_reply_to } }),
      subject,
      textContent: text,
      htmlContent: html,
    },
    {
      headers: { "api-key": config.brevo_api_key, accept: "application/json" },
      timeout: 10000,
    },
  );
}
