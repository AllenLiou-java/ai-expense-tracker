import "server-only";
import OpenAI, { APIConnectionError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { categoriesFor, EXPENSE_TYPES } from "@/lib/categories";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

/**
 * Bring your own key: every user sends their own OpenAI key with each AI request
 * (header below). The server uses it for that one call and never stores or logs it.
 */
export const API_KEY_HEADER = "x-openai-key";

export type KeyError = { status: number; code: string; error: string };

/** Reads the caller's key from the request, or describes why it's missing or malformed. */
export function readApiKey(req: Request): { apiKey: string } | KeyError {
  const apiKey = req.headers.get(API_KEY_HEADER)?.trim();
  if (!apiKey) return { status: 400, code: "missing_api_key", error: "請先設定你的 OpenAI API 金鑰" };
  if (!/^sk-[\w-]{20,200}$/.test(apiKey)) {
    return { status: 400, code: "invalid_api_key", error: "金鑰格式不正確，應該以 sk- 開頭" };
  }
  return { apiKey };
}

function openai(apiKey: string) {
  // Fail fast: a bad key or empty quota won't succeed on retry, and the user is waiting.
  return new OpenAI({ apiKey, maxRetries: 1, timeout: 30_000 });
}

/** Checks that the key works and can use the model, without spending tokens. */
export async function verifyApiKey(apiKey: string) {
  await openai(apiKey).models.retrieve(AI_MODEL);
}

/** Turns an OpenAI failure into a message the user can act on. Never includes the key. */
export function describeAiError(err: unknown): KeyError {
  if (err instanceof APIConnectionError) {
    return { status: 502, code: "ai_unreachable", error: "連不上 OpenAI，請稍後再試" };
  }
  if (err instanceof APIError) {
    if (err.status === 401) {
      return { status: 400, code: "invalid_api_key", error: "OpenAI 拒絕了這把金鑰，請確認是否輸入正確或已被撤銷" };
    }
    if (err.status === 403 || err.status === 404) {
      return { status: 400, code: "model_unavailable", error: `這把金鑰無法使用 ${AI_MODEL} 模型` };
    }
    if (err.status === 429) {
      return err.code === "insufficient_quota"
        ? { status: 402, code: "insufficient_quota", error: "這把金鑰的額度已用完，請到 OpenAI 帳戶儲值" }
        : { status: 429, code: "rate_limited", error: "請求太頻繁，請稍等一下再試" };
    }
  }
  return { status: 502, code: "ai_failed", error: "AI 分析失敗，請稍後再試" };
}

/** The response schema; categories come from the ledger, so it's built per request. */
function analysisSchema(categories: [string, ...string[]]) {
  const entry = z.object({
    type: z.enum(EXPENSE_TYPES),
    amount: z.number().describe("金額，正數"),
    currency: z.string().describe("ISO 4217 幣別，未提及時為 TWD"),
    category: z.enum(categories),
    description: z.string().describe("簡短品項描述，例如「牛肉麵」"),
    merchant: z.string().nullable().describe("店家或對象，未提及時為 null"),
    date: z.string().describe("YYYY-MM-DD"),
  });
  return z.object({
    entries: z.array(entry),
    reply: z
      .string()
      .describe("一句繁體中文的簡短回覆，確認記下了什麼；若無法辨識任何記帳內容，說明原因"),
  });
}

export type ExpenseAnalysis = z.infer<ReturnType<typeof analysisSchema>>;
export type ParsedEntry = ExpenseAnalysis["entries"][number];

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function analyzeExpenseText(
  text: string,
  apiKey: string,
  custom: readonly { name: string; type: string }[] = [],
): Promise<ExpenseAnalysis> {
  const today = todayInTaipei();
  const expenseCats = categoriesFor("expense", custom);
  const incomeCats = categoriesFor("income", custom);
  const all = [...new Set([...expenseCats, ...incomeCats])] as [string, ...string[]];

  const response = await openai(apiKey).responses.parse({
    model: AI_MODEL,
    instructions: [
      "你是記帳助理，將使用者的自然語言拆解成一筆或多筆收支紀錄。",
      `今天是 ${today}（Asia/Taipei），「昨天」「上週五」等相對日期請換算成實際日期；未提及日期就用今天。`,
      "一句話可能包含多筆，例如「早餐 60 午餐 120」要拆成兩筆。",
      "收入（薪水、獎金、退款、別人還錢）type 為 income，其他為 expense。",
      `支出類別只能用：${expenseCats.join("、")}；收入類別只能用：${incomeCats.join("、")}。都不適合時用「其他」。`,
      "金額一律為正數。若句子與記帳無關或缺少金額，entries 回傳空陣列。",
    ].join("\n"),
    input: text,
    text: { format: zodTextFormat(analysisSchema(all), "expense_analysis") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("AI 沒有回傳可解析的結果");

  return {
    reply: parsed.reply,
    // The enum spans both types, so an income category on an expense (or vice versa) falls back to 其他.
    entries: parsed.entries
      .filter((e) => e.amount > 0)
      .map((e) => (categoriesFor(e.type, custom).includes(e.category) ? e : { ...e, category: "其他" })),
  };
}
