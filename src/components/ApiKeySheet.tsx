"use client";

import { useState, type FormEvent } from "react";
import { API_KEY_HEADER, maskKey, saveApiKey, useApiKey } from "@/lib/openai-key";
import { Sheet } from "./Sheet";

/** Bottom sheet where users enter, check and remove their own OpenAI API key. */
export function ApiKeySheet({ onClose }: { onClose: () => void }) {
  const saved = useApiKey();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const key = value.trim();
    if (!key || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/openai-key/verify", { method: "POST", headers: { [API_KEY_HEADER]: key } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "驗證失敗，請再試一次");
        return;
      }
      saveApiKey(key);
      setValue("");
      onClose();
    } catch {
      setError("網路連線發生問題，請再試一次");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet label="OpenAI API 金鑰" onClose={onClose}>
        <h2 className="px-1 text-base font-semibold">OpenAI API 金鑰</h2>
        <p className="mt-1 px-1 text-sm text-muted">
          AI 記帳會用你自己的金鑰呼叫 OpenAI，費用由你的 OpenAI 帳戶支付。金鑰只存在這個瀏覽器，伺服器只在分析當下使用，不會儲存。
        </p>

        {saved && (
          <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">目前使用</p>
              <p className="truncate font-mono text-sm">{maskKey(saved)}</p>
            </div>
            <button
              type="button"
              onClick={() => saveApiKey(null)}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm text-danger transition-colors hover:bg-background"
            >
              移除
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          <label className="mt-5 block rounded-2xl border border-line bg-surface px-4 pb-2.5 pt-2 transition-colors focus-within:border-foreground">
            <span className="text-xs text-muted">{saved ? "換一把金鑰" : "貼上金鑰"}</span>
            <input
              autoFocus={!saved}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-…"
              className="mt-0.5 w-full bg-transparent font-mono text-base outline-none placeholder:text-muted/60"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 px-1 text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className="mt-5 flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background transition active:scale-[0.98] disabled:opacity-40"
          >
            {pending ? "驗證中…" : "驗證並儲存"}
          </button>
        </form>

        <p className="mt-4 px-1 text-xs leading-relaxed text-muted">
          還沒有金鑰？到{" "}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
            OpenAI 平台
          </a>{" "}
          建立一把。在共用電腦上用完記得按「移除」。
        </p>
    </Sheet>
  );
}
