import "server-only";
import { randomInt } from "node:crypto";
import { isValidObjectId, type HydratedDocument } from "mongoose";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isDuplicateKeyError, jsonError } from "./api";
import { getSessionUser, type SessionUser } from "./auth";
import { connectDB } from "./db";
import { Ledger, type LedgerDoc, type MemberRole } from "@/models/Ledger";

// No 0/O/1/I/L so codes are easy to read aloud and type.
const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const INVITE_LENGTH = 8;
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const ledgerNameSchema = z
  .string()
  .trim()
  .min(1, "請輸入記帳本名稱")
  .max(40, "名稱最多 40 個字");

export function generateInviteCode() {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

export function normalizeInviteCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** Creates a ledger owned by userId with a fresh invite code; retries if the random code collides. */
export async function createLedger(userId: string, name: string) {
  await connectDB();
  for (let attempt = 0; ; attempt++) {
    try {
      return await Ledger.create({
        name,
        owner: userId,
        members: [{ user: userId, role: "owner" }],
        inviteCode: generateInviteCode(),
        inviteCodeExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
    } catch (err) {
      if (attempt >= 2 || !isDuplicateKeyError(err)) throw err;
    }
  }
}

export type LedgerAccess = {
  user: SessionUser;
  ledger: HydratedDocument<LedgerDoc>;
  role: MemberRole;
};

/**
 * Resolves the session user and the ledger, and checks that the user is a member
 * (and the owner, when ownerOnly). Non-members get 404 so ledger ids can't be probed.
 */
export async function requireLedgerAccess(
  req: NextRequest,
  ledgerId: string,
  { ownerOnly = false } = {},
): Promise<LedgerAccess | { response: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) return { response: jsonError(401, "尚未登入") };
  if (!isValidObjectId(ledgerId)) return { response: jsonError(404, "找不到這本記帳本") };

  await connectDB();
  // Entries are left out; routes that need them query them directly.
  const ledger = await Ledger.findOne({ _id: ledgerId, "members.user": user.id }).select("-entries");
  if (!ledger) return { response: jsonError(404, "找不到這本記帳本") };

  const role = ledger.members.find((m) => String(m.user) === user.id)!.role as MemberRole;
  if (ownerOnly && role !== "owner") {
    return { response: jsonError(403, "只有記帳本擁有者可以執行此操作") };
  }
  return { user, ledger, role };
}

type MemberLike = { user: unknown; role: string; joinedAt: Date };

/** Shape sent to the client; members[].user is expected to be populated with username. */
export function serializeLedger(
  b: {
    _id: unknown;
    name: string;
    owner: unknown;
    members: MemberLike[];
    inviteCode?: string | null;
    inviteCodeExpiresAt?: Date | null;
    createdAt?: Date;
  },
  viewerId: string,
) {
  const isOwner = String(b.owner) === viewerId;
  return {
    id: String(b._id),
    name: b.name,
    role: (isOwner ? "owner" : "member") as MemberRole,
    members: b.members.map((m) => {
      const u = m.user as { _id?: unknown; username?: string } | null;
      return {
        id: String(u?._id ?? u),
        username: u?.username ?? "已刪除的使用者",
        role: m.role as MemberRole,
        joinedAt: m.joinedAt,
      };
    }),
    // Only the owner can see and share the invite code.
    invite:
      isOwner && b.inviteCode
        ? { code: b.inviteCode, expiresAt: b.inviteCodeExpiresAt ?? null }
        : null,
    createdAt: b.createdAt,
  };
}

export type LedgerDTO = ReturnType<typeof serializeLedger>;
