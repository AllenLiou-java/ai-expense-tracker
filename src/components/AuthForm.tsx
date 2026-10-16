"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/current-ledger";

type Mode = "login" | "register";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const copy = {
  login: {
    title: "歡迎回來",
    subtitle: "登入後繼續記帳",
    submit: "登入",
    switchText: "還沒有帳號？",
    switchLink: "註冊",
    switchHref: "/register",
  },
  register: {
    title: "建立帳號",
    subtitle: "30 秒開始你的第一筆 AI 記帳",
    submit: "註冊",
    switchText: "已經有帳號？",
    switchLink: "登入",
    switchHref: "/login",
  },
} as const;

/** Where to go after signing in, e.g. back to an invite link. */
async function nextPath(searchParams: SearchParams) {
  return safeNextPath((await searchParams).next);
}

export function AuthForm({ mode, searchParams }: { mode: Mode; searchParams: SearchParams }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t = copy[mode];

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "發生錯誤");
      router.replace((await nextPath(searchParams)) ?? "/ledger");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" className="text-[15px] font-semibold tracking-tight">
        Ledger
      </Link>

      <div className="mt-16 animate-rise">
        <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {/* The URL-dependent bits wait for searchParams; the rest of the form is in the static shell. */}
          <Suspense fallback={t.subtitle}>
            <Subtitle mode={mode} searchParams={searchParams} />
          </Suspense>
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-10 space-y-3 animate-rise [animation-delay:60ms]">
        {mode === "register" ? (
          <>
            <Field name="username" label="使用者名稱" autoComplete="username" />
            <Field name="email" label="Email" type="email" autoComplete="email" />
          </>
        ) : (
          <Field name="identifier" label="Email 或使用者名稱" autoComplete="username" />
        )}
        <Field
          name="password"
          label="密碼"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          hint={mode === "register" ? "至少 8 個字元" : undefined}
        />

        {error && (
          <p role="alert" className="pt-1 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background transition active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? "請稍候…" : t.submit}
        </button>
      </form>

      <p className="mt-auto pt-10 text-center text-sm text-muted">
        {t.switchText}
        <Suspense fallback={<SwitchLink mode={mode} />}>
          <SwitchLink mode={mode} searchParams={searchParams} />
        </Suspense>
      </p>
    </main>
  );
}

function Subtitle({ mode, searchParams }: { mode: Mode; searchParams: SearchParams }) {
  const invited = safeNextPath(use(searchParams).next)?.startsWith("/join");
  if (!invited) return copy[mode].subtitle;
  return `${mode === "login" ? "登入" : "註冊"}後就會加入邀請你的記帳本`;
}

/** Keeps ?next= when switching between login and register. */
function SwitchLink({ mode, searchParams }: { mode: Mode; searchParams?: SearchParams }) {
  const t = copy[mode];
  const next = searchParams ? safeNextPath(use(searchParams).next) : null;
  return (
    <Link
      href={next ? `${t.switchHref}?next=${encodeURIComponent(next)}` : t.switchHref}
      className="ml-1 text-foreground underline underline-offset-4"
    >
      {t.switchLink}
    </Link>
  );
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
  hint,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
      <span className="flex justify-between text-xs text-muted">
        {label}
        {hint && <span>{hint}</span>}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="mt-0.5 w-full bg-transparent text-base outline-none"
      />
    </label>
  );
}
