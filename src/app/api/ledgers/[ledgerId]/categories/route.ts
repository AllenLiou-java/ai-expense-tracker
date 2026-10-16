import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, readBody } from "@/lib/api";
import { requireLedgerAccess, serializeLedger } from "@/lib/ledgers";
import {
  CATEGORY_NAME_MAX,
  CUSTOM_CATEGORY_LIMIT,
  categoriesFor,
  EXPENSE_TYPES,
  normalizeCategoryName,
} from "@/lib/categories";
import "@/models/User"; // registers the model for populate()

const createSchema = z.object({
  type: z.enum(EXPENSE_TYPES, "請選擇支出或收入"),
  name: z
    .string()
    .transform(normalizeCategoryName)
    .pipe(z.string().min(1, "請輸入類別名稱").max(CATEGORY_NAME_MAX, `類別名稱最多 ${CATEGORY_NAME_MAX} 個字`)),
});

/**
 * POST /api/ledgers/:ledgerId/categories { type, name } — any member adds a category for the whole ledger.
 * Adding one that already exists is not an error; the ledger comes back unchanged.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ledgers/[ledgerId]/categories">) {
  const access = await requireLedgerAccess(req, (await ctx.params).ledgerId);
  if ("response" in access) return access.response;
  const { user, ledger } = access;

  const body = await readBody(req, createSchema);
  if ("response" in body) return body.response;
  const { type, name } = body.data;

  const exists = categoriesFor(type, ledger.categories).includes(name);
  if (!exists) {
    if (ledger.categories.length >= CUSTOM_CATEGORY_LIMIT) {
      return jsonError(400, `每本記帳本最多 ${CUSTOM_CATEGORY_LIMIT} 個自訂類別`);
    }
    ledger.categories.push({ name, type, createdBy: user.id });
    await ledger.save();
  }

  await ledger.populate("members.user", "username");
  return NextResponse.json(
    { category: { name, type }, ledger: serializeLedger(ledger.toObject(), user.id) },
    { status: exists ? 200 : 201 },
  );
}
