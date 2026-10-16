import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/current-ledger";

// Optimistic redirect based on cookie presence only; the API verifies the session for real.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("session");
  const { pathname, search } = req.nextUrl;

  if ((pathname.startsWith("/ledger") || pathname === "/join") && !hasSession) {
    const login = new URL("/login", req.url);
    // Bring invitees back to the invite link after they sign in or sign up.
    if (pathname === "/join") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  if ((pathname === "/login" || pathname === "/register") && hasSession) {
    const next = safeNextPath(req.nextUrl.searchParams.get("next")) ?? "/ledger";
    return NextResponse.redirect(new URL(next, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/ledger/:path*", "/join", "/login", "/register"],
};
