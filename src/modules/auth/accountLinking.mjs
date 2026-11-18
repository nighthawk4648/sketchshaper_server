import { prisma } from "../../db/prisma.mjs";
import { deleteSiteUserSessions } from "../../utils/session.mjs";

// A sign-in problem the visitor should be told about; `code` becomes /login?error=<code>
export class SignInError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Shared by every "sign in with another service" (Patreon, Google): finds or creates the visitor for an
// identity the service vouches for. `emailVerified` is the SERVICE's word that the address belongs to them.
//   currentUserId   set when someone already signed in is connecting the service to their account
//   unverifiedCode  the error to show when we would have to link by an email the service did not verify
export async function resolveAccount({ currentUserId = null, email, name, emailVerified, unverifiedCode }) {
  let user;
  if (currentUserId) {
    user = await prisma.siteUser.findUnique({ where: { id: currentUserId } });
  } else {
    user = await prisma.siteUser.findUnique({ where: { email } });
    // Linking by email is only safe when the service vouches for the address
    if (user && !emailVerified) throw new SignInError(unverifiedCode);
    if (user && !user.email_verified_at) {
      // Whoever registered this address never proved they own it, so what they attached cannot be trusted
      await prisma.siteUser.update({ where: { id: user.id }, data: { password: null, google_id: null } });
      await deleteSiteUserSessions(user.id);
      await prisma.patreonLink.deleteMany({ where: { site_user_id: user.id } });
    }
  }

  if (!user) {
    return prisma.siteUser.create({
      data: {
        email,
        name: name?.slice(0, 100) || null,
        email_verified_at: emailVerified ? new Date() : null,
      },
    });
  }
  if (!user.email_verified_at && emailVerified && user.email === email) {
    return prisma.siteUser.update({ where: { id: user.id }, data: { email_verified_at: new Date() } });
  }
  return user;
}
