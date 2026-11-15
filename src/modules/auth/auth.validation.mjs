export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes

export const normalizeEmail = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const isValidEmail = (email) => email.length <= 254 && EMAIL_PATTERN.test(email);

// Returns an error message, or null when the password is fine
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters.`;
  }
  if (Buffer.byteLength(password) > PASSWORD_MAX_BYTES) {
    return "Password is too long (72 bytes at most).";
  }
  return null;
}

export const cleanName = (value) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : null;
