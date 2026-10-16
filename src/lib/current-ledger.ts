// Remembers which ledger the user last opened, per browser. Storage can be blocked
// (private mode, disabled site data), so every access is best-effort.
const KEY = "ledger:current";

export function getCurrentLedgerId() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setCurrentLedgerId(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

/** Only same-origin paths are allowed as a post-login redirect target. */
export function safeNextPath(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}
