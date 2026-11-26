import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../../db/prisma.mjs";
import { sendMail } from "../../utils/mailer.mjs";
import * as templates from "../../utils/emailTemplates.mjs";
import { deleteSiteUserSessions } from "../../utils/session.mjs";
import { passwordProblem } from "./auth.validation.mjs";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
// Compared against when the email is unknown, so a miss takes as long as a hit
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// A mail failure must never change the answer (that would reveal which emails exist), but it must be loud in the logs
const sendQuietly = (to, template) =>
  sendMail({ to, ...template }).catch((err) =>
    console.error(`Could not send "${template.subject}" to ${to}:`, err.message),
  );

// One live token per user and type: asking again cancels the older link
async function issueToken(siteUserId, type, ttlMs) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.emailToken.deleteMany({ where: { site_user_id: siteUserId, type } });
  await prisma.emailToken.create({
    data: {
      token_hash: hashToken(token),
      type,
      site_user_id: siteUserId,
      expires_at: new Date(Date.now() + ttlMs),
    },
  });
  return token;
}

// Marks the token used and returns its owner, or throws when it is unknown, used or expired
async function consumeToken(token, type) {
  const row =
    typeof token === "string" && token
      ? await prisma.emailToken.findUnique({ where: { token_hash: hashToken(token) } })
      : null;
  if (!row || row.type !== type || row.used_at || row.expires_at <= new Date()) {
    throw new AuthError("This link is invalid or has expired.", 400);
  }
  // Single use, even if two requests race: only one update can flip used_at from null
  const claimed = await prisma.emailToken.updateMany({
    where: { id: row.id, used_at: null },
    data: { used_at: new Date() },
  });
  if (claimed.count !== 1) throw new AuthError("This link is invalid or has expired.", 400);
  return row.site_user_id;
}

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  emailVerified: Boolean(u.email_verified_at),
  hasPassword: Boolean(u.password),
});

class AuthService {
  async register({ email, password, name }) {
    const existing = await prisma.siteUser.findUnique({ where: { email } });
    if (existing) {
      // Same answer as a new sign-up; the real owner is told by email
      if (existing.email_verified_at) {
        await sendQuietly(email, templates.alreadyRegistered());
      } else {
        // Nobody has proven they own this address yet, so the newest sign-up replaces whatever an
        // earlier one left behind (password, sessions, Patreon link). Otherwise someone could sign up
        // with a stranger's email first and keep access after the real owner signs up and confirms.
        await prisma.siteUser.update({
          where: { id: existing.id },
          data: { password: await bcrypt.hash(password, 10), name },
        });
        await deleteSiteUserSessions(existing.id);
        await prisma.patreonLink.deleteMany({ where: { site_user_id: existing.id } });
        const token = await issueToken(existing.id, "verify", VERIFY_TTL_MS);
        await sendQuietly(email, templates.verifyEmail(token));
      }
      return;
    }
    const user = await prisma.siteUser.create({
      data: { email, name, password: await bcrypt.hash(password, 10) },
    });
    const token = await issueToken(user.id, "verify", VERIFY_TTL_MS);
    await sendQuietly(email, templates.verifyEmail(token));
  }

  async login({ email, password }) {
    const user = await prisma.siteUser.findUnique({ where: { email } });
    const ok = await bcrypt.compare(
      typeof password === "string" ? password : "",
      user?.password || DUMMY_HASH,
    );
    if (!user || !user.password || !ok) {
      throw new AuthError("Invalid email or password.", 401);
    }
    return user;
  }

  updateName(siteUserId, name) {
    return prisma.siteUser.update({ where: { id: siteUserId }, data: { name } });
  }

  async changePassword({ siteUserId, keepSessionId, currentPassword, newPassword }) {
    const user = await prisma.siteUser.findUnique({ where: { id: siteUserId } });
    if (!user?.password) {
      throw new AuthError("This account has no password yet. Use the email link to set one.", 400);
    }
    const same = await bcrypt.compare(typeof currentPassword === "string" ? currentPassword : "", user.password);
    if (!same) throw new AuthError("Your current password is wrong.", 400);
    const problem = passwordProblem(newPassword);
    if (problem) throw new AuthError(problem, 400);
    const saved = await prisma.siteUser.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    });
    // Sign out anyone else who had the old password; this browser stays signed in
    await prisma.session.deleteMany({ where: { site_user_id: user.id, NOT: { id: keepSessionId } } });
    return saved;
  }

  async verifyEmail(token) {
    const userId = await consumeToken(token, "verify");
    return prisma.siteUser.update({
      where: { id: userId },
      data: { email_verified_at: new Date() },
    });
  }

  async resendVerification(email) {
    const user = await prisma.siteUser.findUnique({ where: { email } });
    if (user && !user.email_verified_at) {
      const token = await issueToken(user.id, "verify", VERIFY_TTL_MS);
      await sendQuietly(email, templates.verifyEmail(token));
    }
  }

  async forgotPassword(email) {
    const user = await prisma.siteUser.findUnique({ where: { email } });
    if (user) {
      const token = await issueToken(user.id, "reset", RESET_TTL_MS);
      await sendQuietly(email, templates.resetPassword(token));
    }
  }

  async resetPassword({ token, password }) {
    const userId = await consumeToken(token, "reset");
    const before = await prisma.siteUser.findUnique({ where: { id: userId } });
    // A Patreon account attached before anyone proved they own this mailbox cannot be trusted either
    if (!before.email_verified_at) {
      await prisma.patreonLink.deleteMany({ where: { site_user_id: userId } });
    }
    const user = await prisma.siteUser.update({
      where: { id: userId },
      data: {
        password: await bcrypt.hash(password, 10),
        // Opening the link proves they own the mailbox
        email_verified_at: new Date(),
      },
    });
    await deleteSiteUserSessions(userId);
    await sendQuietly(user.email, templates.passwordChanged());
    return user;
  }
}

export default new AuthService();
