// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "./services/auth-gateway.service";
import { decrypt } from "./lib/encryptSession";
import { SessionData } from "./types/sessionData.type";
import { getAccessTokenServer } from "./lib/getAccessToken.server";

const PROTECTED_ADMIN_PATHS = ["/admin/dashboard", "/admin/employees"];

// ── SE/QA protected paths that require a connected GitHub account ──────────
const PROTECTED_SE_QA_PATHS = [
  "/dashboard",
  "/issues",
  "/ai-insight",
  "/qa-repos",
  "/qa-dashboard",
];

const LOGIN_PATH = "/login";
const ADMIN_LOGIN_PATH = "/admin/login";
const CONNECT_GITHUB_PATH = "/connect-github";

const INGESTION_BASE_URL =
  process.env.INGESTION_SERVICE_URL ?? "https://localhost";

function decodePayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    return JSON.parse(Buffer.from(parts[1], "base64").toString());
  } catch {
    return null;
  }
}
interface JwtPayload {
  exp?: number;
  realm_access?: { roles?: string[] };
}

function isExpired(payload: JwtPayload | null): boolean {
  const now = Math.floor(Date.now() / 1000);
  return !!payload?.exp && payload.exp < now;
}

function isSuperAdmin(payload: JwtPayload | null): boolean {
  const roles: string[] = payload?.realm_access?.roles ?? [];
  return roles.includes("superadmin");
}

function isSEorQA(role: string[] | undefined | null): boolean {
  const roles = role ?? [];
  return roles.includes("Software engineer") || roles.includes("QA");
}

function clearAndRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  return response;
}

function clearSessionAndRedirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete("session");
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

async function isGithubConnected(): Promise<boolean> {
  const accessToken = await getAccessTokenServer();
  try {
    const res = await fetch(`${INGESTION_BASE_URL}/ingestion/github/status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.log(
        "[middleware] isGithubConnected → non-ok response:",
        res.status,
      );
      return false;
    }
    const data = await res.json();
    return !!data.connected;
  } catch (err) {
    console.log(
      "[middleware] isGithubConnected → fetch threw, failing OPEN:",
      err,
    );
    // fail-safe: if the ingestion service is unreachable, don't hard-lock
    // the user out — let them through rather than bricking the app.
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log("[middleware] →", pathname, request.nextUrl.search);

  // ── "/" handler ────────────────────────────────────────────────────────────
  if (pathname === "/") {
    const accessToken = request.cookies.get("access_token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      console.log("[middleware] '/' → no tokens → LOGIN_PATH");
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    if (accessToken) {
      const payload = decodePayload(accessToken);
      if (payload && !isExpired(payload)) {
        const dest = isSuperAdmin(payload) ? "/admin/dashboard" : "/dashboard";
        console.log("[middleware] '/' → valid access token →", dest);
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }

    if (!refreshToken) {
      console.log("[middleware] '/' → no refresh token → LOGIN_PATH");
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    const refreshPayload = decodePayload(refreshToken);
    if (!refreshPayload || isExpired(refreshPayload)) {
      const payload = accessToken ? decodePayload(accessToken) : null;
      const loginPath =
        payload && isSuperAdmin(payload) ? ADMIN_LOGIN_PATH : LOGIN_PATH;
      console.log(
        "[middleware] '/' → refresh token invalid/expired →",
        loginPath,
      );
      return clearAndRedirect(request, loginPath);
    }

    const newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) {
      console.log("[middleware] '/' → refreshAccessToken failed → LOGIN_PATH");
      return clearAndRedirect(request, LOGIN_PATH);
    }

    const newPayload = decodePayload(newTokens.access_token);
    if (!newPayload) {
      console.log(
        "[middleware] '/' → couldn't decode new access token → LOGIN_PATH",
      );
      return clearAndRedirect(request, LOGIN_PATH);
    }

    const destination = isSuperAdmin(newPayload)
      ? "/admin/dashboard"
      : "/dashboard";
    console.log("[middleware] '/' → refreshed tokens →", destination);
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
    console.log("[middleware] admin-protected path:", pathname);
    const accessToken = request.cookies.get("access_token")?.value;
    const refreshToken = request.cookies.get("refresh_token")?.value;

    if (!accessToken && !refreshToken) {
      console.log("[middleware] admin → no tokens → ADMIN_LOGIN_PATH");
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    if (accessToken) {
      const payload = decodePayload(accessToken);
      if (payload && !isExpired(payload)) {
        if (!isSuperAdmin(payload)) {
          console.log("[middleware] admin → not superadmin → ADMIN_LOGIN_PATH");
          return clearAndRedirect(request, ADMIN_LOGIN_PATH);
        }
        console.log("[middleware] admin → ok → next()");
        return NextResponse.next();
      }
    }

    if (!refreshToken) {
      console.log("[middleware] admin → no refresh token → ADMIN_LOGIN_PATH");
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    const refreshPayload = decodePayload(refreshToken);
    if (!refreshPayload || isExpired(refreshPayload)) {
      console.log(
        "[middleware] admin → refresh token invalid/expired → ADMIN_LOGIN_PATH",
      );
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    const newTokens = await refreshAccessToken(refreshToken);
    if (!newTokens) {
      console.log(
        "[middleware] admin → refreshAccessToken failed → ADMIN_LOGIN_PATH",
      );
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    const newPayload = decodePayload(newTokens.access_token);
    if (!newPayload || !isSuperAdmin(newPayload)) {
      console.log(
        "[middleware] admin → refreshed but not superadmin → ADMIN_LOGIN_PATH",
      );
      return clearAndRedirect(request, ADMIN_LOGIN_PATH);
    }

    console.log("[middleware] admin → refreshed ok → next()");
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

  // ── SE/QA protected routes — auth + GitHub-connected check ─────────────────
  const isSEorQAProtected = PROTECTED_SE_QA_PATHS.some((p) =>
    pathname.startsWith(p),
  );
  console.log(
    "[middleware] isSEorQAProtected:",
    isSEorQAProtected,
    "for",
    pathname,
  );

  if (isSEorQAProtected) {
    const sessionCookie = request.cookies.get("session")?.value;
    console.log("[middleware] sessionCookie present?", !!sessionCookie);

    if (!sessionCookie) {
      console.log("[middleware] SE/QA → no session cookie → LOGIN_PATH");
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    let session: SessionData | null = null;
    try {
      session = (await decrypt(sessionCookie)) as SessionData;
    } catch (err) {
      console.log("[middleware] SE/QA → decrypt threw → LOGIN_PATH", err);
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    if (!session?.access_token) {
      console.log(
        "[middleware] SE/QA → no access_token on session → LOGIN_PATH",
      );
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    const isSessionExpired = Date.now() > session.refresh_expires_at_iso_format;
    console.log(
      "[middleware] session expired?",
      isSessionExpired,
      "role:",
      session.role,
    );
    if (isSessionExpired) {
      console.log("[middleware] SE/QA → session expired → LOGIN_PATH");
      return clearSessionAndRedirect(request, LOGIN_PATH);
    }

    // NOTE: this flow has no refresh-in-middleware step, since login.ts
    // stores refresh_token but there's no server action here to call it.
    // If access_token itself is expired but refresh_token isn't, requests
    // relying on access_token will 401 downstream — that's a separate gap,
    // flagging it rather than silently patching it in.

    if (isSEorQA(session.role) && pathname !== CONNECT_GITHUB_PATH) {
      const connected = await isGithubConnected();
      console.log(
        "[middleware] github connected?",
        connected,
        "for pathname",
        pathname,
      );
      if (!connected) {
        const returnTo = encodeURIComponent(pathname + request.nextUrl.search);
        console.log(
          "[middleware] SE/QA → not connected → redirect to CONNECT_GITHUB_PATH, returnTo:",
          returnTo,
        );
        return NextResponse.redirect(
          new URL(`${CONNECT_GITHUB_PATH}?returnTo=${returnTo}`, request.url),
        );
      }
    }

    console.log("[middleware] SE/QA → passthrough → next()");
    return NextResponse.next();
  }

  console.log(
    "[middleware] no block matched → implicit next() (e.g. /connect-github)",
  );
  return NextResponse.next();
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
