import { Suspense } from "react";
import { Ledger } from "@/components/Ledger";

export default function LedgerPage() {
  // Ledger reads the current date to pick the default month, so it renders per request.
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-md flex-1" />}>
      <Ledger />
    </Suspense>
  );
}
