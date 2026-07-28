// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "./services/auth-gateway.service";
import { decrypt } from "./lib/encryptSession";

const PROTECTED_ADMIN_PATHS = ["/admin/dashboard", "/admin/employees"];

// ── NEW: SE/QA protected paths that require a connected GitHub account ──────
// Adjust this list to match your actual route names.
const PROTECTED_SE_QA_PATHS = [
  "/dashboard",
  "/issues",
  "/ai-insight",
  "/qa-repos",
  "/qa-dashboard",
];

const LOGIN_PATH = "/login";
const ADMIN_LOGIN_PATH = "/admin/login";
const CONNECT_GITHUB_PATH = "/connect-github"; // ← NEW

const INGESTION_BASE_URL =
  process.env.INGESTION_SERVICE_URL ?? "http://localhost:8002";

function decodePayload(token: string) {
  try {
    const parts = token.split(".");
    return JSON.parse(Buffer.from(parts[1], "base64").toString());
  } catch {
    return null;
  }
}

function isExpired(payload: any): boolean {
  const now = Math.floor(Date.now() / 1000);
  return payload?.exp && payload.exp < now;
}

function isSuperAdmin(payload: any): boolean {
  const roles: string[] = payload?.realm_access?.roles ?? [];
  return roles.includes("superadmin");
}

// ── NEW: role helper for SE/QA ───────────────────────────────────────────────
function isSEorQA(role: string[]): boolean {
  return role.includes("Software engineer") || role.includes("QA");
}

function clearAndRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  return response;
}

function setTokenCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  refreshExpiresIn: number,
) {
  response.cookies.set("access_token", accessToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: expiresIn,
  });
  response.cookies.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: refreshExpiresIn,
  });
}

// ── NEW: live check against the ingestion service ───────────────────────────
async function isGithubConnected(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${INGESTION_BASE_URL}/ingestion/github/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.connected;
  } catch {
    // fail-safe: if the ingestion service is unreachable, don't hard-lock
    // the user out — let them through rather than bricking the app.
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── "/" handler ────────────────────────────────────────────────────────────
  if (pathname === "/") {
    const accessToken = request.cookies.get("access_token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    if (accessToken) {
      const payload = decodePayload(accessToken);
      if (payload && !isExpired(payload)) {
        return NextResponse.redirect(
          new URL(
            isSuperAdmin(payload) ? "/admin/dashboard" : "/dashboard",
            request.url,
          ),
        );
      }
    }

    if (!refreshToken) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    const refreshPayload = decodePayload(refreshToken);
    if (!refreshPayload || isExpired(refreshPayload)) {
      const payload = accessToken ? decodePayload(accessToken) : null;
      const loginPath =
        payload && isSuperAdmin(payload) ? ADMIN_LOGIN_PATH : LOGIN_PATH;
      return clearAndRedirect(request, loginPath);
    }

    const newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) {
      return clearAndRedirect(request, LOGIN_PATH);
    }

    const newPayload = decodePayload(newTokens.access_token);
    if (!newPayload) {
      return clearAndRedirect(request, LOGIN_PATH);
    }

    const destination = isSuperAdmin(newPayload)
      ? "/admin/dashboard"
      : "/dashboard";
    const response = NextResponse.redirect(new URL(destination, request.url));
    setTokenCookies(
      response,
      newTokens.access_token,
      newTokens.refresh_token,
      newTokens.expires_in,
      newTokens.refresh_expires_in,
    );
    return response;
  }

  // ── protected admin routes ─────────────────────────────────────────────────
  const isAdminProtected = PROTECTED_ADMIN_PATHS.some((p) =>
    pathname.startsWith(p),
  );
  if (isAdminProtected) {
    const accessToken = request.cookies.get("access_token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    if (accessToken) {
      const payload = decodePayload(accessToken);
      if (payload && !isExpired(payload)) {
        if (!isSuperAdmin(payload))
          return clearAndRedirect(request, ADMIN_LOGIN_PATH);
        return NextResponse.next();
      }
    }

    if (!refreshToken) return clearAndRedirect(request, ADMIN_LOGIN_PATH);

    const refreshPayload = decodePayload(refreshToken);
    if (!refreshPayload || isExpired(refreshPayload)) {
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    const newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) return clearAndRedirect(request, ADMIN_LOGIN_PATH);

    const newPayload = decodePayload(newTokens.access_token);
    if (!newPayload || !isSuperAdmin(newPayload)) {
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    const response = NextResponse.next();
    setTokenCookies(
      response,
      newTokens.access_token,
      newTokens.refresh_token,
      newTokens.expires_in,
      newTokens.refresh_expires_in,
    );
    return response;
  }

  // ── NEW: protected SE/QA routes — auth + GitHub-connected check ─────────────
  const isSEorQAProtected = PROTECTED_SE_QA_PATHS.some((p) =>
    pathname.startsWith(p),
  );

  if (isSEorQAProtected) {
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    let session: SessionData | null = null;
    try {
      session = (await decrypt(sessionCookie)) as SessionData;
    } catch {
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    if (!session?.access_token) {
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    // Check expiry using YOUR stored field, not a decoded JWT `exp`
    const isSessionExpired = Date.now() > session.refresh_expires_at_iso_format;
    if (isSessionExpired) {
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    // NOTE: this flow has no refresh-in-middleware step, since login.ts
    // stores refresh_token but there's no server action here to call it.
    // If access_token itself is expired but refresh_token isn't, requests
    // relying on access_token will 401 downstream — that's a separate gap,
    // flagging it rather than silently patching it in.

    if (isSEorQA(session.role) && pathname !== CONNECT_GITHUB_PATH) {
      const connected = await isGithubConnected(session.access_token);
      if (!connected) {
        const returnTo = encodeURIComponent(pathname + request.nextUrl.search);
        return NextResponse.redirect(
          new URL(`${CONNECT_GITHUB_PATH}?returnTo=${returnTo}`, request.url),
        );
      }
    }

    return NextResponse.next();
  }

  function clearSessionAndRedirect(request: NextRequest, path: string) {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete("session");
    return response;
  }
}
export const config = {
  matcher: [
    "/",
    "/admin/dashboard/:path*",
    "/admin/employees/:path*",
    "/dashboard/:path*",
    "/issues/:path*",
    "/ai-insight/:path*",
    "/qa-repos/:path*",
    "/qa-dashboard/:path*",
    "/connect-github",
  ],
};
