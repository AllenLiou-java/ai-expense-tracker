import "server-only";
import bcrypt from "bcryptjs";

// bcrypt cost factor: each +1 doubles the hashing time (~250ms at 12 on a modern CPU).
const SALT_ROUNDS = 12;

// bcrypt only uses the first 72 bytes of input; longer passwords are rejected at validation.
export const PASSWORD_MAX_BYTES = 72;

// Compared against when the user doesn't exist, so login takes the same time either way
// and response timing can't reveal which accounts are registered.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", SALT_ROUNDS);

export function exceedsBcryptLimit(password: string) {
  return bcrypt.truncates(password);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | undefined) {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return ok && hash !== undefined;
}
