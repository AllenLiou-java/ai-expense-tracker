"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use } from "react";
import { setCurrentLedgerId } from "@/lib/current-ledger";
import { JoinView } from "./LedgerSheet";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function JoinPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/ledger" className="text-[15px] font-semibold tracking-tight">
        Ledger
      </Link>

      <div className="mt-16 animate-rise">
        <h1 className="text-3xl font-semibold tracking-tight">加入共用記帳本</h1>
        <p className="mt-2 text-sm text-muted">輸入擁有者給你的 8 碼邀請碼。加入後，成員記的每一筆帳彼此都看得到。</p>
      </div>

      <div className="mt-10 animate-rise [animation-delay:60ms]">
        {/* Only the form needs ?code=, so the rest of the page is in the static shell. */}
        <Suspense fallback={<FormSkeleton />}>
          <JoinForm searchParams={searchParams} />
        </Suspense>
      </div>

      <p className="mt-auto pt-10 text-center text-sm text-muted">
        <Link href="/ledger" className="text-foreground underline underline-offset-4">
          回到我的記帳本
        </Link>
      </p>
    </main>
  );
}

function JoinForm({ searchParams }: { searchParams: SearchParams }) {
  const router = useRouter();
  const { code } = use(searchParams);

  return (
    <JoinView
      initialCode={typeof code === "string" ? code.toUpperCase() : ""}
      hideTitle
      onJoined={(ledger) => {
        // Open the joined ledger when the main page loads.
        setCurrentLedgerId(ledger.id);
        router.replace("/ledger");
      }}
    />
  );
}

function FormSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-16 animate-pulse rounded-2xl bg-line/50" />
      <div className="mt-5 h-14 animate-pulse rounded-full bg-line/50" />
    </div>
  );
}
