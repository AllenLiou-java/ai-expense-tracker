import { useSyncExternalStore } from "react";

// The user's own OpenAI key lives only in this browser. It's sent with each AI request
// and never stored on the server. Storage can be blocked, so every access is best-effort.
const KEY = "openai:key";
export const API_KEY_HEADER = "x-openai-key";

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Keeps other tabs in sync when the key is saved or removed in one of them.
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved key, or null. Always null during server rendering. */
export function useApiKey() {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function getApiKey() {
  return read();
}

export function saveApiKey(value: string | null) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((l) => l());
}

/** "sk-proj-…a1B2": enough to recognise a key without revealing it. */
export function maskKey(value: string) {
  const prefix = value.startsWith("sk-proj-") ? "sk-proj-" : "sk-";
  return `${prefix}…${value.slice(-4)}`;
}
