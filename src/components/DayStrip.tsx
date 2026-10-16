"use client";

import { useEffect, useRef } from "react";

const WEEKDAYS = "日一二三四五六";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

type Props = {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD, or null for the whole month. */
  selected: string | null;
  onSelect: (day: string | null) => void;
  /** Days (YYYY-MM-DD) that have at least one entry; they get a dot. */
  marked: Set<string>;
};

/** Horizontally swipeable day picker for one month. */
export function DayStrip({ month, selected, onSelect, marked }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const iso = `${month}-${pad(i + 1)}`;
    return { iso, date: i + 1, weekday: WEEKDAYS[new Date(y, m - 1, i + 1).getDay()] };
  });

  // Center the selected day, or today when the whole month is shown.
  const focus = selected ?? (today.startsWith(month) ? today : null);
  useEffect(() => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-day="${focus ?? "all"}"]`);
    if (!box || !el) return;
    box.scrollTo({
      left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2,
      behavior: "smooth",
    });
  }, [focus, month]);

  const pill = "flex h-16 shrink-0 snap-center flex-col items-center justify-center rounded-2xl transition-colors";
  const idle = "border border-line bg-surface hover:border-foreground";
  const active = "border border-foreground bg-foreground text-background";

  return (
    <div
      ref={scroller}
      className="relative -mx-5 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        data-day="all"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={`${pill} w-14 text-xs font-medium ${selected === null ? active : idle}`}
      >
        全月
      </button>
      {days.map((d) => {
        const isSelected = d.iso === selected;
        const isToday = d.iso === today;
        const future = d.iso > today;
        return (
          <button
            key={d.iso}
            data-day={d.iso}
            disabled={future}
            onClick={() => onSelect(isSelected ? null : d.iso)}
            aria-pressed={isSelected}
            aria-label={`${m}月${d.date}日 週${d.weekday}${marked.has(d.iso) ? "，有紀錄" : ""}`}
            className={`${pill} w-11 disabled:opacity-30 ${isSelected ? active : idle}`}
          >
            <span className={`text-[10px] ${isSelected ? "text-background/70" : isToday ? "font-medium text-accent" : "text-muted"}`}>
              {isToday ? "今" : d.weekday}
            </span>
            <span className="tabular text-[15px] font-semibold leading-tight">{d.date}</span>
            <span
              className={`mt-0.5 size-1 rounded-full ${marked.has(d.iso) ? (isSelected ? "bg-background" : "bg-accent") : "bg-transparent"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
