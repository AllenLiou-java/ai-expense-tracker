import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CATEGORIES, EXPENSE_TYPES } from "@/models/Expense";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

let client: OpenAI | null = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env.local");
  }
  client ??= new OpenAI();
  return client;
}

const entrySchema = z.object({
  type: z.enum(EXPENSE_TYPES),
  amount: z.number().describe("金額，正數"),
  currency: z.string().describe("ISO 4217 幣別，未提及時為 TWD"),
  category: z.enum(CATEGORIES),
  description: z.string().describe("簡短品項描述，例如「牛肉麵」"),
  merchant: z.string().nullable().describe("店家或對象，未提及時為 null"),
  date: z.string().describe("YYYY-MM-DD"),
});

const analysisSchema = z.object({
  entries: z.array(entrySchema),
  reply: z
    .string()
    .describe("一句繁體中文的簡短回覆，確認記下了什麼；若無法辨識任何記帳內容，說明原因"),
});

export type ParsedEntry = z.infer<typeof entrySchema>;
export type ExpenseAnalysis = z.infer<typeof analysisSchema>;

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function analyzeExpenseText(text: string): Promise<ExpenseAnalysis> {
  const today = todayInTaipei();

  const response = await openai().responses.parse({
    model: AI_MODEL,
    instructions: [
      "你是記帳助理，將使用者的自然語言拆解成一筆或多筆收支紀錄。",
      `今天是 ${today}（Asia/Taipei），「昨天」「上週五」等相對日期請換算成實際日期；未提及日期就用今天。`,
      "一句話可能包含多筆，例如「早餐 60 午餐 120」要拆成兩筆。",
      "收入（薪水、獎金、退款、別人還錢）type 為 income，其他為 expense。",
      "金額一律為正數。若句子與記帳無關或缺少金額，entries 回傳空陣列。",
    ].join("\n"),
    input: text,
    text: { format: zodTextFormat(analysisSchema, "expense_analysis") },
  });

  const parsed = response.output_parsed;
  if (!parsed) throw new Error("AI 沒有回傳可解析的結果");

  return {
    reply: parsed.reply,
    entries: parsed.entries.filter((e) => e.amount > 0),
  };
}
