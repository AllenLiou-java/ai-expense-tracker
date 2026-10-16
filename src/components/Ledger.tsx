"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ExpenseDTO } from "@/lib/expenses";
import type { LedgerDTO } from "@/lib/ledgers";
import { getCurrentLedgerId, setCurrentLedgerId } from "@/lib/current-ledger";
import { LedgerSheet } from "./LedgerSheet";
import { DayStrip } from "./DayStrip";

type User = { id: string; username: string; email: string; role: "user" | "admin" };
type Scope = "all" | "mine";
type Toast = { tone: "ok" | "warn"; text: string; entries?: ExpenseDTO[] };

const EXAMPLES = ["午餐牛肉麵 150", "昨天搭計程車 230", "這個月薪水 52000", "全聯買菜 486，咖啡 65"];

const nf = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

function dayLabel(iso: string) {
  const today = new Date();
  const todayIso = `${monthKey(today)}-${String(today.getDate()).padStart(2, "0")}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const yIso = `${monthKey(y)}-${String(y.getDate()).padStart(2, "0")}`;
  if (iso === todayIso) return "今天";
  if (iso === yIso) return "昨天";
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日 週${"日一二三四五六"[d.getDay()]}`;
}

function signed(e: ExpenseDTO) {
  const prefix = e.type === "income" ? "+" : "−";
  const cur = e.currency === "TWD" ? "" : `${e.currency} `;
  return `${prefix}${cur}${nf.format(e.amount)}`;
}

export function Ledger() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ledgers, setLedgers] = useState<LedgerDTO[] | null>(null);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const current = ledgers?.find((l) => l.id === ledgerId) ?? null;
  const [sheet, setSheet] = useState<"list" | "create" | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  // A single day (YYYY-MM-DD) within the month, or null for the whole month.
  const [day, setDay] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  // Tagged with the query it answers, so switching ledger/month/scope shows a skeleton until fresh data arrives.
  const [loaded, setLoaded] = useState<{ key: string; list: ExpenseDTO[] } | null>(null);
  const queryKey = `${ledgerId}|${month}|${scope}`;
  const expenses = loaded?.key === queryKey ? loaded.list : null;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    fetch("/api/auth/me").then(async (res) => {
      if (res.status === 401) return signOut();
      setUser((await res.json()).user);
    });
  }, [signOut]);

  function selectLedger(id: string) {
    setLedgerId(id);
    setCurrentLedgerId(id);
    setOpenId(null);
  }

  // Load the user's ledgers and open the last-used one (or the first).
  // With none (e.g. after leaving the last one), open the create view instead.
  useEffect(() => {
    fetch("/api/ledgers").then(async (res) => {
      if (res.status === 401) return signOut();
      const list: LedgerDTO[] = (await res.json()).ledgers ?? [];
      setLedgers(list);
      if (list.length === 0) return setSheet("create");
      const remembered = getCurrentLedgerId();
      setLedgerId(list.some((l) => l.id === remembered) ? remembered : list[0].id);
    });
  }, [signOut]);

  function upsertLedger(ledger: LedgerDTO, opts?: { select?: boolean; message?: string }) {
    setLedgers((prev) => {
      const list = prev ?? [];
      return list.some((l) => l.id === ledger.id)
        ? list.map((l) => (l.id === ledger.id ? ledger : l))
        : [...list, ledger];
    });
    if (opts?.select) {
      selectLedger(ledger.id);
      setSheet(null);
    }
    if (opts?.message) setToast({ tone: "ok", text: opts.message });
  }

  function leftLedger(id: string) {
    const rest = (ledgers ?? []).filter((l) => l.id !== id);
    setLedgers(rest);
    if (rest.length) selectLedger(rest[0].id);
    else setLedgerId(null);
    setSheet(rest.length ? null : "create");
    setToast({ tone: "ok", text: "已退出記帳本" });
  }

  // Bumped after a successful submit to refetch the current view.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!ledgerId) return;
    let cancelled = false;
    fetch(`/api/ledgers/${ledgerId}/expenses?month=${month}&scope=${scope}`).then(async (res) => {
      if (res.status === 401) return signOut();
      const data = await res.json();
      if (!cancelled) setLoaded({ key: `${ledgerId}|${month}|${scope}`, list: data.expenses ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [ledgerId, month, scope, version, signOut]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // The whole month is fetched once; picking a day just filters it.
  const visible = useMemo(
    () => (expenses && day ? expenses.filter((e) => e.date === day) : expenses),
    [expenses, day],
  );
  const markedDays = useMemo(() => new Set((expenses ?? []).map((e) => e.date)), [expenses]);

  const summary = useMemo(() => {
    const list = (visible ?? []).filter((e) => e.currency === "TWD");
    const out = list.filter((e) => e.type === "expense");
    const income = list.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const spent = out.reduce((s, e) => s + e.amount, 0);
    const byCat = new Map<string, number>();
    for (const e of out) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    return { spent, income, balance: income - spent, cats };
  }, [visible]);

  const groups = useMemo(() => {
    const map = new Map<string, ExpenseDTO[]>();
    for (const e of visible ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()];
  }, [visible]);

  function changeMonth(key: string) {
    setMonth(key);
    setDay(null);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || sending || !ledgerId) return;
    setSending(true);
    setToast(null);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (res.status === 401) return signOut();
      if (!res.ok) {
        setToast({ tone: "warn", text: data.error ?? "沒有辨識到記帳內容" });
        return;
      }
      setText("");
      setToast({ tone: "ok", text: data.analysis.reply, entries: data.expenses });
      // Jump to the month (and day, if one is picked) of the first new entry so the user sees it land.
      const first = data.expenses[0]?.date as string | undefined;
      const target = first?.slice(0, 7);
      if (target && target !== month) setMonth(target);
      else setVersion((v) => v + 1);
      if (day && first) setDay(first);
    } catch {
      setToast({ tone: "warn", text: "網路連線發生問題，請再試一次" });
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/ledgers/${ledgerId}/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToast({ tone: "warn", text: data.error ?? "刪除失敗" });
      return;
    }
    setLoaded((prev) => prev && { ...prev, list: prev.list.filter((e) => e.id !== id) });
    setOpenId(null);
  }

  const [y, m] = month.split("-").map(Number);
  const isCurrentMonth = month === monthKey(new Date());
  const topCats = summary.cats.slice(0, 4);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={() => setSheet("list")}
          aria-haspopup="dialog"
          className="-ml-1.5 flex min-w-0 items-center gap-3 rounded-full py-1 pl-1.5 pr-3 text-left transition-colors hover:bg-surface"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
            {current?.name.slice(0, 1).toUpperCase() ?? "·"}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs text-muted">嗨，{user?.username ?? "…"}</p>
            <p className="flex items-center gap-1 text-sm font-semibold">
              <span className="truncate">{current?.name ?? "…"}</span>
              <ChevronDown />
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/ledger/stats?month=${month}`}
            aria-label="統計"
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChartIcon />
          </Link>
          {current && current.members.length > 1 && (
            <button onClick={() => setSheet("list")} aria-label={`${current.members.length} 位成員`} className="flex -space-x-2 px-1">
              {current.members.slice(0, 3).map((m) => (
                <span key={m.id} className="grid size-7 place-items-center rounded-full border-2 border-background bg-accent-soft text-[11px] font-medium text-accent">
                  {m.username.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </button>
          )}
          <button onClick={signOut} className="rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground">
            登出
          </button>
        </div>
      </header>

      {/* Month + summary */}
      <section className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <button aria-label="上個月" onClick={() => changeMonth(shiftMonth(month, -1))} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground">
            <Chevron dir="left" />
          </button>
          <p className="text-sm font-medium tabular">
            {y} 年 {m} 月
          </p>
          <button aria-label="下個月" disabled={isCurrentMonth} onClick={() => changeMonth(shiftMonth(month, 1))} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30">
            <Chevron dir="right" />
          </button>
        </div>

        <DayStrip month={month} selected={day} onSelect={setDay} marked={markedDays} />

        <div className="mt-4 rounded-3xl bg-surface p-5 border border-line">
          <p className="text-xs text-muted">{day ? `${dayLabel(day)}的支出` : "本月支出"}</p>
          <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight tabular">
            <span className="mr-1 align-top text-lg text-muted">$</span>
            {nf.format(summary.spent)}
          </p>

          {topCats.length > 0 && (
            <>
              <div className="mt-5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                {topCats.map(([cat, amt], i) => (
                  <span key={cat} className="h-full rounded-full bg-accent" style={{ flex: amt, opacity: 1 - i * 0.22 }} />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {topCats.map(([cat, amt], i) => (
                  <li key={cat} className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="size-1.5 rounded-full bg-accent" style={{ opacity: 1 - i * 0.22 }} />
                    {cat}
                    <span className="tabular text-foreground">{Math.round((amt / summary.spent) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-5 grid grid-cols-2 border-t border-line pt-4">
            <div>
              <p className="text-xs text-muted">收入</p>
              <p className="mt-0.5 text-base font-medium tabular text-income">+{nf.format(summary.income)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">結餘</p>
              <p className="mt-0.5 text-base font-medium tabular">{nf.format(summary.balance)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Scope toggle */}
      <div className="px-5 pt-6">
        <div role="tablist" className="grid grid-cols-2 rounded-full bg-line/60 p-1 text-sm">
          {(
            [
              ["all", "全部成員"],
              ["mine", "只看我"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={scope === key}
              onClick={() => setScope(key)}
              className={`h-9 rounded-full transition ${scope === key ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <section className="flex-1 px-5 pb-48 pt-4">
        {visible === null ? (
          <div className="space-y-3 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-line/50" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="pt-12 text-center">
            <p className="text-sm font-medium">{day ? `${dayLabel(day)}沒有紀錄` : "這個月還沒有紀錄"}</p>
            <p className="mt-1 text-xs text-muted">試試看在下方輸入：</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setText(ex);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs transition-colors hover:border-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          groups.map(([date, items]) => (
            <div key={date} className="mt-4 first:mt-0">
              <div className="flex items-baseline justify-between px-1 pb-1">
                <h3 className="text-xs font-medium text-muted">{dayLabel(date)}</h3>
                <span className="text-xs tabular text-muted">
                  {nf.format(items.filter((e) => e.type === "expense" && e.currency === "TWD").reduce((s, e) => s + e.amount, 0))}
                </span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
                {items.map((e) => {
                  const mine = e.createdBy.id === user?.id;
                  const canDelete = mine || current?.role === "owner" || user?.role === "admin";
                  const open = openId === e.id;
                  return (
                    <li key={e.id} className="border-b border-line last:border-b-0">
                      <button onClick={() => setOpenId(open ? null : e.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium ${e.type === "income" ? "bg-accent text-on-accent" : "bg-accent-soft text-accent"}`}>
                          {e.category.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.description}</p>
                          <p className="truncate text-xs text-muted">
                            {e.category}
                            {e.merchant && ` · ${e.merchant}`}
                            {` · ${mine ? "我" : e.createdBy.username}`}
                          </p>
                        </div>
                        <span className={`tabular text-sm font-medium ${e.type === "income" ? "text-income" : ""}`}>{signed(e)}</span>
                      </button>
                      {open && (
                        <div className="flex items-center justify-between gap-3 bg-background/60 px-4 py-2.5 animate-rise">
                          <p className="min-w-0 truncate text-xs text-muted">「{e.rawText}」</p>
                          {canDelete && (
                            <button onClick={() => remove(e.id)} className="shrink-0 text-xs font-medium text-danger">
                              刪除
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* Composer */}
      <div className="fixed inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {toast && (
            <div
              role="status"
              className={`mb-3 rounded-2xl border px-4 py-3 text-sm shadow-lg animate-rise ${toast.tone === "ok" ? "border-line bg-surface" : "border-danger/30 bg-surface text-danger"}`}
            >
              <p className="flex items-start gap-2">
                {toast.tone === "ok" && <Sparkle />}
                <span className="flex-1">{toast.text}</span>
              </p>
              {toast.entries && toast.entries.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-line pt-2">
                  {toast.entries.map((e) => (
                    <li key={e.id} className="flex justify-between text-xs text-muted">
                      <span>
                        {e.category} · {e.description} · {dayLabel(e.date)}
                      </span>
                      <span className="tabular text-foreground">{signed(e)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <form onSubmit={submit} className="flex items-end gap-2 rounded-[28px] border border-line bg-surface p-2 pl-5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={500}
              placeholder={sending ? "AI 分析中…" : "說說花了什麼，例如：午餐 150"}
              disabled={sending}
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-base outline-none [field-sizing:content] placeholder:text-muted disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="送出"
              disabled={sending || !text.trim()}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background transition active:scale-95 disabled:opacity-25"
            >
              {sending ? <span className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background" /> : <ArrowUp />}
            </button>
          </form>
        </div>
      </div>

      {sheet && ledgers && (
        <LedgerSheet
          ledgers={ledgers}
          currentId={ledgerId}
          userId={user?.id}
          initialView={sheet}
          // With no ledger yet, the create view stays open until one exists.
          onClose={() => ledgers.length > 0 && setSheet(null)}
          onSelect={(id) => {
            selectLedger(id);
            setSheet(null);
          }}
          onUpsert={upsertLedger}
          onLeft={leftLedger}
        />
      )}
    </div>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 15h12M5.5 12V8.5M9 12V4.5M12.5 12V7" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg className="shrink-0 text-muted" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5L6 7.5l3-3" />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 14V4M4.5 8.5L9 4l4.5 4.5" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg className="mt-0.5 shrink-0 text-accent" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16l-1.8-6.2L0 8l6.2-1.8z" />
    </svg>
  );
}
