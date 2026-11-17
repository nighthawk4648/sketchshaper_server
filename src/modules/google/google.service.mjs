import { prisma } from "../../db/prisma.mjs";
import { SignInError, resolveAccount } from "../auth/accountLinking.mjs";

// Finds or creates the visitor for this Google account. currentUserId is set when someone who is already
// signed in is connecting Google to their account.
export async function signInWithGoogle({ profile, currentUserId = null }) {
  if (!profile.googleId || !profile.email) throw new SignInError("google_no_email");

  try {
    const existing = await prisma.siteUser.findUnique({ where: { google_id: profile.googleId } });
    if (existing) {
      if (currentUserId && currentUserId !== existing.id) throw new SignInError("google_in_use");
      return existing;
    }
    const user = await resolveAccount({
      currentUserId,
      email: profile.email,
      name: profile.name,
      emailVerified: profile.emailVerified,
      unverifiedCode: "google_email_unverified",
    });
    return await prisma.siteUser.update({ where: { id: user.id }, data: { google_id: profile.googleId } });
  } catch (err) {
    if (err.code === "P2002") throw new SignInError("google_failed"); // two sign-ins raced
    throw err;
  }
}
