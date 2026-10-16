import "server-only";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { connectDB } from "./db";
import { User, type UserRole } from "@/models/User";

export const SESSION_COOKIE = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
};

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env.local");
  return new TextEncoder().encode(secret);
}

export async function setSessionCookie(res: NextResponse, userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Resolves the logged-in user from the session cookie, or null. */
export async function getSessionUser(
  req: NextRequest,
): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    userId = payload.sub;
  } catch {
    return null;
  }
  if (!userId) return null;

  await connectDB();
  const user = await User.findById(userId).lean();
  if (!user) return null;

  return toSessionUser(user);
}

export function toSessionUser(user: {
  _id: unknown;
  username: string;
  email: string;
  role: string;
}): SessionUser {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role as UserRole,
  };
}
