import Link from "next/link";

const steps = [
  {
    n: "01",
    title: "說一句話",
    body: "「午餐牛肉麵 150，咖啡 65」— 不用選分類、不用填表。",
  },
  {
    n: "02",
    title: "AI 幫你拆解",
    body: "自動辨識金額、類別、日期與店家，一句話可拆成多筆。",
  },
  {
    n: "03",
    title: "大家共用一本帳",
    body: "每筆都標記是誰記的，家人、室友、旅伴一起看得清清楚楚。",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="text-[15px] font-semibold tracking-tight">Ledger</span>
        <Link href="/login" className="text-sm text-muted transition-colors hover:text-foreground">
          登入
        </Link>
      </header>

      <section className="mt-16 animate-rise">
        <p className="text-xs font-medium tracking-[0.2em] text-muted uppercase">AI Expense Tracker</p>
        <h1 className="mt-4 text-[40px] font-semibold leading-[1.1] tracking-tight">
          記帳，
          <br />
          只要一句話。
        </h1>
        <p className="mt-5 text-[15px] leading-relaxed text-muted">
          打字就像傳訊息給朋友，剩下的分類、加總與多人對帳，交給 AI。
        </p>
      </section>

      {/* A static preview of the composer + parsed result */}
      <section
        aria-hidden
        className="mt-10 rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)] animate-rise [animation-delay:80ms]"
      >
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-on-accent">
          昨天和小美吃燒肉 1280，搭計程車 230
        </div>
        <ul className="mt-4 divide-y divide-line">
          {[
            ["餐飲", "燒肉", "1,280"],
            ["交通", "計程車", "230"],
          ].map(([cat, desc, amt]) => (
            <li key={desc} className="flex items-center gap-3 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-xs font-medium text-accent">
                {cat[0]}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">{desc}</p>
                <p className="text-xs text-muted">{cat} · 昨天</p>
              </div>
              <span className="tabular text-sm font-medium">−{amt}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-8">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-5">
            <span className="tabular pt-0.5 font-mono text-xs text-muted">{s.n}</span>
            <div>
              <h2 className="text-base font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="sticky bottom-0 mt-auto pt-12 pb-[env(safe-area-inset-bottom)]">
        <Link
          href="/register"
          className="flex h-14 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background transition-transform active:scale-[0.98]"
        >
          免費開始記帳
        </Link>
        <p className="mt-3 text-center text-xs text-muted">
          已經有帳號？
          <Link href="/login" className="text-foreground underline underline-offset-4">
            登入
          </Link>
        </p>
      </div>
    </main>
  );
}
