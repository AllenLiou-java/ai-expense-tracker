"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LedgerDTO } from "@/lib/ledgers";
import { getCurrentLedgerId } from "@/lib/current-ledger";

type Period = "month" | "year";
type GroupBy = "category" | "member";
type Row = { id: string; label: string; amount: number; count: number };
type StatsData = {
  totals: { spent: number; income: number; balance: number; count: number };
  otherCurrencyCount: number;
  byCategory: Row[];
  byMember: Row[];
  byMonth: { month: string; amount: number; count: number }[] | null;
};

const nf = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 });

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function Stats() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const thisMonth = monthKey(new Date());
  const [period, setPeriod] = useState<Period>("month");
  // Opens on the month the ledger page was showing (?month=YYYY-MM), else this month.
  const [month, setMonth] = useState(() => {
    const m = searchParams.get("month");
    return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= thisMonth ? m : thisMonth;
  });
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [y, m] = month.split("-").map(Number);
  const value = period === "month" ? month : String(y);
  const queryKey = `${ledger?.id}|${period}|${value}`;
  const [loaded, setLoaded] = useState<{ key: string; data: StatsData } | null>(null);
  const data = loaded?.key === queryKey ? loaded.data : null;

  useEffect(() => {
    Promise.all([fetch("/api/auth/me"), fetch("/api/ledgers")]).then(async ([me, list]) => {
      if (me.status === 401 || list.status === 401) return router.replace("/login");
      setUserId((await me.json()).user.id);
      const ledgers: LedgerDTO[] = (await list.json()).ledgers ?? [];
      const remembered = getCurrentLedgerId();
      setLedger(ledgers.find((l) => l.id === remembered) ?? ledgers[0] ?? null);
    });
  }, [router]);

  useEffect(() => {
    if (!ledger) return;
    let cancelled = false;
    const key = `${ledger.id}|${period}|${value}`;
    fetch(`/api/ledgers/${ledger.id}/stats?period=${period}&value=${value}`).then(async (res) => {
      if (res.status === 401) return router.replace("/login");
      if (!cancelled && res.ok) setLoaded({ key, data: await res.json() });
    });
    return () => {
      cancelled = true;
    };
  }, [ledger, period, value, router]);

  const atLatest = period === "month" ? month >= thisMonth : y >= Number(thisMonth.slice(0, 4));
  const shift = (delta: number) => setMonth(period === "month" ? shiftMonth(month, delta) : shiftMonth(month, delta * 12));
  const periodLabel = period === "month" ? `${y} 年 ${m} 月` : `${y} 年`;
  const rows = data ? (groupBy === "category" ? data.byCategory : data.byMember) : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-12">
      <header className="flex items-center gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link
          href="/ledger"
          aria-label="回到記帳本"
          className="-ml-2 grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <Chevron dir="left" />
        </Link>
        <div className="min-w-0 leading-tight">
          <h1 className="text-base font-semibold">統計</h1>
          <p className="truncate text-xs text-muted">{ledger?.name ?? "…"}</p>
        </div>
      </header>

      <div className="mt-5">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            ["month", "月統計"],
            ["year", "年統計"],
          ]}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button aria-label={period === "month" ? "上個月" : "上一年"} onClick={() => shift(-1)} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground">
          <Chevron dir="left" />
        </button>
        <p className="text-sm font-medium tabular">{periodLabel}</p>
        <button aria-label={period === "month" ? "下個月" : "下一年"} disabled={atLatest} onClick={() => shift(1)} className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-30">
          <Chevron dir="right" />
        </button>
      </div>

      {/* Headline */}
      <section className="mt-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-xs text-muted">{period === "month" ? `${m} 月` : `${y} 年`}總支出</p>
        {data ? (
          <p className="mt-1 text-[40px] font-semibold leading-none tracking-tight">
            <span className="mr-1 align-top text-lg text-muted">$</span>
            {nf.format(data.totals.spent)}
          </p>
        ) : (
          <div className="mt-1 h-10 w-40 animate-pulse rounded-lg bg-line/50" />
        )}
        <dl className="mt-5 grid grid-cols-3 border-t border-line pt-4">
          <Figure label="收入" value={data && `+${nf.format(data.totals.income)}`} tone="income" />
          <Figure label="結餘" value={data && nf.format(data.totals.balance)} />
          <Figure label="筆數" value={data && `${data.totals.count} 筆`} />
        </dl>
        {data && data.otherCurrencyCount > 0 && (
          <p className="mt-3 text-xs text-muted">另有 {data.otherCurrencyCount} 筆外幣紀錄未計入。</p>
        )}
      </section>

      {/* Year: spending per month; tap a month to drill into it. */}
      {period === "year" && (
        <section className="mt-4 rounded-3xl border border-line bg-surface p-5">
          <h2 className="text-xs text-muted">每月支出</h2>
          {data?.byMonth ? (
            <MonthColumns
              months={data.byMonth}
              thisMonth={thisMonth}
              onPick={(key) => {
                setMonth(key);
                setPeriod("month");
              }}
            />
          ) : (
            <div className="mt-2 h-[158px] animate-pulse rounded-xl bg-line/50" />
          )}
        </section>
      )}

      {/* Breakdown */}
      <section className="mt-6">
        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            ["category", "依花費類別"],
            ["member", "依成員花費"],
          ]}
        />
        <div className="mt-3 rounded-3xl border border-line bg-surface px-5 py-2">
          {rows === null || !data ? (
            <div className="space-y-4 py-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-line/50" />
              ))}
            </div>
          ) : data.totals.spent === 0 && groupBy === "category" ? (
            <p className="py-10 text-center text-sm text-muted">這段期間沒有支出</p>
          ) : (
            <Breakdown rows={rows} total={data.totals.spent} kind={groupBy} userId={userId} />
          )}
        </div>
      </section>
    </div>
  );
}

/** Ranked horizontal bars; each bar is that row's share of the period's total spending. */
function Breakdown({ rows, total, kind, userId }: { rows: Row[]; total: number; kind: GroupBy; userId: string | null }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => {
        const pct = total > 0 ? (r.amount / total) * 100 : 0;
        const me = kind === "member" && r.id === userId;
        return (
          <li key={r.id} className="flex items-center gap-3 py-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-medium text-accent">
              {r.label.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium">
                  {r.label}
                  {me && <span className="font-normal text-muted">（我）</span>}
                </p>
                <p className="shrink-0 text-sm font-medium tabular">${nf.format(r.amount)}</p>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-line/60">
                  {r.amount > 0 && (
                    <div className="h-full min-w-1 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  )}
                </div>
                <span className="w-[4.75rem] shrink-0 text-right text-xs text-muted tabular">
                  {Math.round(pct)}% · {r.count} 筆
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 12 columns of monthly spending. The peak is labeled; hover/focus shows each month's value. */
function MonthColumns({
  months,
  thisMonth,
  onPick,
}: {
  months: NonNullable<StatsData["byMonth"]>;
  thisMonth: string;
  onPick: (month: string) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...months.map((x) => x.amount), 0);
  const peak = max > 0 ? months.findIndex((x) => x.amount === max) : -1;

  return (
    <div className="relative mt-2 pt-4">
      <div className="flex h-[124px] items-end border-b border-line" onMouseLeave={() => setActive(null)}>
        {months.map((x, i) => {
          const future = x.month > thisMonth;
          const h = max > 0 ? Math.max((x.amount / max) * 100, x.amount > 0 ? 3 : 0) : 0;
          const label = `${i + 1} 月`;
          return (
            <button
              key={x.month}
              disabled={future}
              onClick={() => onPick(x.month)}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${label}支出 ${nf.format(x.amount)} 元，${x.count} 筆，點擊查看當月`}
              className="group relative flex h-full flex-1 items-end justify-center disabled:cursor-default"
            >
              {i === peak && active === null && (
                <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-medium text-foreground tabular" style={{ bottom: `calc(${h}% + 4px)` }}>
                  {compact.format(x.amount)}
                </span>
              )}
              <span
                className={`w-full max-w-5 rounded-t-[4px] transition-opacity ${active !== null && active !== i ? "bg-accent opacity-40" : "bg-accent"}`}
                style={{ height: `${h}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex">
        {months.map((x, i) => (
          <span key={x.month} className={`flex-1 text-center text-[10px] tabular ${x.month > thisMonth ? "text-muted/50" : "text-muted"}`}>
            {i + 1}
          </span>
        ))}
      </div>
      {active !== null && (
        <div
          role="status"
          className={`pointer-events-none absolute top-2 z-10 -translate-y-full whitespace-nowrap ${active < 2 ? "" : active > 9 ? "-translate-x-full" : "-translate-x-1/2"} rounded-xl border border-line bg-background px-3 py-2 text-xs shadow-lg`}
          // Anchored on the column, but kept inside the card at either end.
          style={{ left: `${((active < 2 ? active : active > 9 ? active + 1 : active + 0.5) / 12) * 100}%` }}
        >
          <p className="text-muted">{active + 1} 月</p>
          <p className="font-medium tabular">
            ${nf.format(months[active].amount)} · {months[active].count} 筆
          </p>
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div role="tablist" className="grid grid-cols-2 rounded-full bg-line/60 p-1 text-sm">
      {options.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`h-9 rounded-full transition ${value === key ? "bg-surface font-medium shadow-sm" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string | null; tone?: "income" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-base font-medium tabular ${tone === "income" ? "text-income" : ""}`}>
        {value ?? <span className="inline-block h-5 w-14 animate-pulse rounded bg-line/50 align-middle" />}
      </dd>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}
