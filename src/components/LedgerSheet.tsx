"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { LedgerDTO } from "@/lib/ledgers";

type View = "list" | "create" | "join";

type Props = {
  ledgers: LedgerDTO[];
  currentId: string | null;
  userId: string | undefined;
  initialView?: View;
  onClose: () => void;
  onSelect: (id: string) => void;
  /** A ledger was created, joined or changed; replaces it in the list (or adds it). */
  onUpsert: (ledger: LedgerDTO, opts?: { select?: boolean; message?: string }) => void;
  /** The user left the current ledger. */
  onLeft: (id: string) => void;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "發生錯誤，請再試一次");
  return data;
}

function formatCode(code: string) {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Bottom sheet for switching ledgers, managing the current one, and creating or joining one. */
export function LedgerSheet({ ledgers, currentId, userId, initialView = "list", onClose, onSelect, onUpsert, onLeft }: Props) {
  const [view, setView] = useState<View>(initialView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30">
      <button aria-label="關閉" onClick={onClose} className="absolute inset-0 bg-black/35 animate-fade" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="記帳本"
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-t-[28px] border-t border-line bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-12px_40px_rgba(0,0,0,0.12)] animate-sheet"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        {view === "list" && (
          <ListView
            ledgers={ledgers}
            currentId={currentId}
            userId={userId}
            onSelect={onSelect}
            onUpsert={onUpsert}
            onLeft={onLeft}
            onView={setView}
          />
        )}
        {view === "create" && (
          <CreateView
            onBack={ledgers.length ? () => setView("list") : undefined}
            onCreated={(l) => onUpsert(l, { select: true, message: `已建立「${l.name}」` })}
          />
        )}
        {view === "join" && (
          <JoinView
            onBack={() => setView("list")}
            onJoined={(l, already) =>
              onUpsert(l, { select: true, message: already ? `你已經是「${l.name}」的成員` : `已加入「${l.name}」` })
            }
          />
        )}
      </div>
    </div>
  );
}

function ListView({
  ledgers,
  currentId,
  userId,
  onSelect,
  onUpsert,
  onLeft,
  onView,
}: Omit<Props, "onClose" | "initialView"> & { onView: (v: View) => void }) {
  const current = ledgers.find((l) => l.id === currentId);

  return (
    <>
      <h2 className="px-1 text-base font-semibold">記帳本</h2>
      <ul className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
        {ledgers.map((l) => {
          const active = l.id === currentId;
          return (
            <li key={l.id} className="border-b border-line last:border-b-0">
              <button
                onClick={() => onSelect(l.id)}
                aria-current={active}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-background/60"
              >
                <Initial text={l.name} active={active} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-muted">
                    {l.members.length} 位成員 · {l.role === "owner" ? "擁有者" : "成員"}
                  </p>
                </div>
                {active && <Check />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <SecondaryButton onClick={() => onView("create")}>＋ 建立新記帳本</SecondaryButton>
        <SecondaryButton onClick={() => onView("join")}>輸入邀請碼</SecondaryButton>
      </div>

      {current && (
        <CurrentLedger key={current.id} ledger={current} userId={userId} onUpsert={onUpsert} onLeft={onLeft} />
      )}
    </>
  );
}

function CurrentLedger({
  ledger,
  userId,
  onUpsert,
  onLeft,
}: {
  ledger: LedgerDTO;
  userId: string | undefined;
  onUpsert: Props["onUpsert"];
  onLeft: Props["onLeft"];
}) {
  const isOwner = ledger.role === "owner";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤，請再試一次");
    } finally {
      setBusy(false);
    }
  }

  const regenerate = () =>
    run(async () => {
      const { invite } = await send(`/api/ledgers/${ledger.id}/invite`, "POST");
      onUpsert({ ...ledger, invite });
    });

  const removeMember = (memberId: string, username: string) => {
    if (!confirm(`要將 ${username} 移出「${ledger.name}」嗎？`)) return;
    run(async () => {
      await send(`/api/ledgers/${ledger.id}/members/${memberId}`, "DELETE");
      onUpsert({ ...ledger, members: ledger.members.filter((m) => m.id !== memberId) });
    });
  };

  const leave = () => {
    if (!userId || !confirm(`確定要退出「${ledger.name}」嗎？退出後就看不到這本帳了。`)) return;
    run(async () => {
      await send(`/api/ledgers/${ledger.id}/members/${userId}`, "DELETE");
      onLeft(ledger.id);
    });
  };

  async function copy(kind: "code" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("無法複製，請手動記下邀請碼");
    }
  }

  const invite = ledger.invite;
  const expired = invite?.expiresAt ? new Date(invite.expiresAt) <= new Date() : false;
  const link = invite && typeof window !== "undefined" ? `${window.location.origin}/join?code=${invite.code}` : "";

  return (
    <section className="mt-7">
      <h3 className="px-1 text-xs font-medium text-muted">「{ledger.name}」的成員</h3>
      <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
        {ledger.members.map((m) => {
          const me = m.id === userId;
          return (
            <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <Initial text={m.username} />
              <p className="min-w-0 flex-1 truncate text-sm">
                {m.username}
                {me && <span className="text-muted">（我）</span>}
              </p>
              {m.role === "owner" ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">擁有者</span>
              ) : (
                isOwner && (
                  <button
                    disabled={busy}
                    onClick={() => removeMember(m.id, m.username)}
                    className="text-xs text-muted transition-colors hover:text-danger disabled:opacity-40"
                  >
                    移除
                  </button>
                )
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">邀請碼</p>
          {invite && !expired ? (
            <>
              <button
                onClick={() => copy("code", invite.code)}
                className="mt-1 font-mono text-[28px] font-semibold tracking-[0.12em] tabular"
                aria-label="複製邀請碼"
              >
                {formatCode(invite.code)}
              </button>
              <p className="text-xs text-muted">
                {copied === "code"
                  ? "已複製邀請碼"
                  : invite.expiresAt && `有效至 ${new Date(invite.expiresAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}，對方輸入後即可加入`}
              </p>
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <button
                  onClick={() => copy("link", link)}
                  className="h-11 rounded-full bg-foreground text-sm font-medium text-background transition active:scale-[0.98]"
                >
                  {copied === "link" ? "已複製連結" : "複製邀請連結"}
                </button>
                <button
                  disabled={busy}
                  onClick={regenerate}
                  className="h-11 rounded-full border border-line px-4 text-sm transition-colors hover:border-foreground disabled:opacity-40"
                >
                  重新產生
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm">{expired ? "邀請碼已過期" : "目前沒有可用的邀請碼"}</p>
              <button
                disabled={busy}
                onClick={regenerate}
                className="mt-3 h-11 w-full rounded-full bg-foreground text-sm font-medium text-background transition active:scale-[0.98] disabled:opacity-40"
              >
                產生新的邀請碼
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 px-1 text-sm text-danger">
          {error}
        </p>
      )}

      {!isOwner && (
        <button
          disabled={busy}
          onClick={leave}
          className="mt-4 w-full py-2 text-center text-sm text-danger disabled:opacity-40"
        >
          退出這本記帳本
        </button>
      )}
    </section>
  );
}

function CreateView({ onBack, onCreated }: { onBack?: () => void; onCreated: (l: LedgerDTO) => void }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { ledger } = await send("/api/ledgers", "POST", { name });
      onCreated(ledger);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立失敗");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <SheetTitle onBack={onBack}>建立新記帳本</SheetTitle>
      <p className="mt-1 px-1 text-sm text-muted">建立後你就是擁有者，可以用邀請碼邀請家人或朋友一起記。</p>
      <label className="mt-5 block rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
        <span className="text-xs text-muted">名稱</span>
        <input
          autoFocus
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：家庭開銷、日本旅行"
          className="mt-0.5 w-full bg-transparent text-base outline-none placeholder:text-muted/60"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <PrimaryButton disabled={pending || !name.trim()}>{pending ? "建立中…" : "建立"}</PrimaryButton>
    </form>
  );
}

export function JoinView({
  onBack,
  onJoined,
  initialCode = "",
  hideTitle = false,
}: {
  onBack?: () => void;
  hideTitle?: boolean;
  onJoined: (l: LedgerDTO, alreadyMember: boolean) => void;
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { ledger, alreadyMember } = await send("/api/ledgers/join", "POST", { code });
      onJoined(ledger, alreadyMember);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失敗");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {!hideTitle && (
        <>
          <SheetTitle onBack={onBack}>用邀請碼加入</SheetTitle>
          <p className="mt-1 px-1 text-sm text-muted">向記帳本的擁有者索取 8 碼邀請碼。</p>
        </>
      )}
      <input
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={9}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXX-XXXX"
        aria-label="邀請碼"
        className={`${hideTitle ? "" : "mt-5"} h-16 w-full rounded-2xl border border-line bg-surface text-center font-mono text-2xl font-semibold tracking-[0.15em] outline-none transition-colors placeholder:text-muted/40 focus:border-foreground`}
      />
      {error && (
        <p role="alert" className="mt-3 px-1 text-sm text-danger">
          {error}
        </p>
      )}
      <PrimaryButton disabled={pending || code.replace(/[\s-]/g, "").length < 8}>
        {pending ? "加入中…" : "加入記帳本"}
      </PrimaryButton>
    </form>
  );
}

function SheetTitle({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      {onBack && (
        <button
          type="button"
          aria-label="返回"
          onClick={onBack}
          className="-ml-2 grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      )}
      <h2 className={`text-base font-semibold ${onBack ? "" : "px-1"}`}>{children}</h2>
    </div>
  );
}

function PrimaryButton({ disabled, children }: { disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background transition active:scale-[0.98] disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-11 rounded-full border border-line bg-surface text-sm transition-colors hover:border-foreground"
    >
      {children}
    </button>
  );
}

function Initial({ text, active }: { text: string; active?: boolean }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-medium ${active ? "bg-accent text-on-accent" : "bg-accent-soft text-accent"}`}
    >
      {text.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Check() {
  return (
    <svg className="shrink-0 text-accent" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5l3.2 3L14 5.5" />
    </svg>
  );
}
