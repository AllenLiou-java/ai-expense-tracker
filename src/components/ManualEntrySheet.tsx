"use client";

import { useState, type FormEvent } from "react";
import type { ExpenseDTO } from "@/lib/expenses";
import type { LedgerDTO } from "@/lib/ledgers";
import { CATEGORY_NAME_MAX, categoriesFor, normalizeCategoryName, type EntryType } from "@/lib/categories";
import { Sheet } from "./Sheet";

type Props = {
  ledger: LedgerDTO;
  defaultDate: string;
  maxDate: string;
  onClose: () => void;
  onCreated: (expenses: ExpenseDTO[]) => void;
  onLedgerUpdate: (ledger: LedgerDTO) => void;
  onSignedOut: () => void;
};

const AMOUNT = /^\d{1,10}(\.\d{0,2})?$/;

/** Records exactly one entry from a form: type, amount, category (preset or custom), item and date. */
export function ManualEntrySheet({ ledger, defaultDate, maxDate, onClose, onCreated, onLedgerUpdate, onSignedOut }: Props) {
  const [type, setType] = useState<EntryType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const categories = categoriesFor(type, ledger.categories);
  const custom = new Set(ledger.categories.filter((c) => c.type === type).map((c) => c.name));
  const value = Number(amount);
  const ready = AMOUNT.test(amount) && value > 0 && category !== null && date !== "";

  function changeType(next: EntryType) {
    setType(next);
    // A category only carries over if the other type has it too (e.g. 其他).
    if (category && !categoriesFor(next, ledger.categories).includes(category)) setCategory(null);
    setAdding(false);
  }

  async function addCategory() {
    const name = normalizeCategoryName(newName);
    if (!name || addPending) return;
    setAddPending(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name }),
      });
      if (res.status === 401) return onSignedOut();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data.error ?? "新增失敗");
        return;
      }
      onLedgerUpdate(data.ledger);
      setCategory(data.category.name);
      setNewName("");
      setAdding(false);
    } catch {
      setAddError("網路連線發生問題，請再試一次");
    } finally {
      setAddPending(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/ledgers/${ledger.id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "manual", type, amount: value, category, description, date }),
      });
      if (res.status === 401) return onSignedOut();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "儲存失敗");
        return;
      }
      onCreated(data.expenses);
    } catch {
      setError("網路連線發生問題，請再試一次");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet label="手動記帳" onClose={onClose}>
      <form onSubmit={submit}>
        <h2 className="px-1 text-base font-semibold">手動記一筆</h2>

        <div role="radiogroup" aria-label="收支" className="mt-4 grid grid-cols-2 rounded-full border border-line bg-surface p-1">
          {(
            [
              ["expense", "支出"],
              ["income", "收入"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => changeType(t)}
              className={`h-10 rounded-full text-sm font-medium transition-colors ${type === t ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mt-4 block rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
          <span className="text-xs text-muted">金額</span>
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="text-sm text-muted">NT$</span>
            <input
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const next = e.target.value.replace(/,/g, "");
                if (next === "" || AMOUNT.test(next)) setAmount(next);
              }}
              placeholder="0"
              className={`w-full bg-transparent text-3xl font-semibold tabular outline-none placeholder:text-muted/40 ${type === "income" ? "text-income" : ""}`}
            />
          </span>
        </label>

        <fieldset className="mt-5">
          <legend className="px-1 text-xs text-muted">類別</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                  category === c ? "border-foreground bg-foreground text-background" : "border-line bg-surface hover:border-foreground"
                }`}
              >
                {c}
                {custom.has(c) && <span className="sr-only">（自訂）</span>}
              </button>
            ))}
            {!adding && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setAddError(null);
                }}
                className="rounded-full border border-dashed border-line px-3.5 py-2 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                ＋ 新增類別
              </button>
            )}
          </div>

          {adding && (
            <div className="mt-3 animate-rise">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  maxLength={CATEGORY_NAME_MAX}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds the category instead of submitting the whole entry.
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addCategory();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setAdding(false);
                    }
                  }}
                  aria-label={`新的${type === "expense" ? "支出" : "收入"}類別名稱`}
                  placeholder={type === "expense" ? "例如：寵物、保險" : "例如：兼職、利息"}
                  className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-base outline-none transition-colors focus:border-foreground placeholder:text-muted/60"
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={addPending || !normalizeCategoryName(newName)}
                  className="h-11 shrink-0 rounded-full bg-foreground px-4 text-sm font-medium text-background transition active:scale-95 disabled:opacity-40"
                >
                  {addPending ? "新增中…" : "新增"}
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="h-11 shrink-0 rounded-full px-3 text-sm text-muted transition-colors hover:text-foreground"
                >
                  取消
                </button>
              </div>
              <p role={addError ? "alert" : undefined} className={`mt-2 px-1 text-xs ${addError ? "text-danger" : "text-muted"}`}>
                {addError ?? "新增的類別會加到這本記帳本，所有成員都能使用。"}
              </p>
            </div>
          )}
        </fieldset>

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <label className="block min-w-0 rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
            <span className="text-xs text-muted">品項（選填）</span>
            <input
              value={description}
              maxLength={60}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={category ?? "例如：牛肉麵"}
              className="mt-0.5 w-full bg-transparent text-base outline-none placeholder:text-muted/60"
            />
          </label>
          <label className="block rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
            <span className="text-xs text-muted">日期</span>
            <input
              type="date"
              required
              value={date}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="mt-0.5 block bg-transparent text-base tabular outline-none"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 px-1 text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!ready || pending}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background transition active:scale-[0.98] disabled:opacity-40"
        >
          {pending ? "儲存中…" : category ? `記下這筆${type === "expense" ? "支出" : "收入"}` : "請選擇類別"}
        </button>
      </form>
    </Sheet>
  );
}
