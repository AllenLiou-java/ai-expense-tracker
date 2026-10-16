import { Suspense } from "react";
import { Stats } from "@/components/Stats";

export default function StatsPage() {
  // Stats reads the URL and the current date to pick the default period, so it renders per request.
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-md flex-1" />}>
      <Stats />
    </Suspense>
  );
}
