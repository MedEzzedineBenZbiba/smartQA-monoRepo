// services/ingestion.service.ts
"use server";

import { cookies } from "next/headers";
import axios from "axios";
import { decrypt } from "@/lib/encryptSession";

import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types/sessionData.type";

interface DecryptedSession {
  access_token: string;
}

const API_BASE = "http://localhost:8002";

export async function getGithubAuthUrl(
  returnTo?: string,
): Promise<{ url: string }> {
  const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  const { data } = await axios.get(`${API_BASE}/ingestion/authorize${params}`);
  return { url: data.url };
}

export async function syncIssues(): Promise<{ synced: number }> {
  const session = (await cookies()).get("session")?.value ?? null;
  let decryptSession = null;
  if (session) {
    decryptSession = (await decrypt(session)) as SessionData;
  }
  const token = decryptSession?.access_token;

  try {
    const { data } = await axios.get(`${API_BASE}/ingestion/ingest`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { synced: data.synced ?? 0 };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      // Treat both 401 and 404 as "GitHub not connected"
      if (status === 401 || status === 404) {
        throw new Error("GITHUB_NOT_CONNECTED");
      }

      throw new Error(
        `Sync failed: ${error.response?.statusText ?? error.message}`,
      );
    }
    throw error;
  }
}

export async function getGithubStatus(): Promise<{ connected: boolean }> {
  const session = (await cookies()).get("session")?.value ?? null;
  let token = null;
  if (session) {
    const decryptSession = (await decrypt(session)) as SessionData;
    token = decryptSession?.access_token;
  }
  const { data } = await axios.get(`${API_BASE}/ingestion/github/status`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data;
}

interface SyncJob {
  id: string;
  repoName: string;
  orgName: string;
  repoUrl: string;
  frequency: "1h" | "6h" | "12h" | "24h";
  status: "active" | "paused" | "syncing" | "failed";
  lastSyncedAt: string | null;
  nextSyncAt: string;
  issueCount: number;
}

export async function getSyncJobs(): Promise<SyncJob[]> {
  const session = (await cookies()).get("session")?.value ?? null;
  let token = null;
  if (session) {
    const decryptSession = (await decrypt(session)) as SessionData;
    token = decryptSession?.access_token;
  }
  const { data } = await axios.get(`${API_BASE}/ingestion/sync-jobs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data ?? [];
}

export async function createSyncJob(body: {
  repoUrl: string;
  repoName: string;
  orgName: string;
  frequency: string;
}): Promise<void> {
  const session = (await cookies()).get("session")?.value ?? null;
  let token = null;
  if (session) {
    const decryptSession = (await decrypt(session)) as SessionData;
    token = decryptSession?.access_token;
  }
  await axios.post(`${API_BASE}/ingestion/sync-jobs`, body, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/**
 * Internal function to pause a sync job.
 * Expects the job ID and an access token.
 */
async function pauseSyncJob(id: string, token: string | null) {
  const res = await fetch(`${API_BASE}/ingestion/sync-jobs/${id}/pause`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  return { data, status: res.status };
}

/**
 * Internal function to resume a sync job.
 * Expects the job ID and an access token.
 */
async function resumeSyncJob(id: string, token: string | null) {
  const res = await fetch(`${API_BASE}/ingestion/sync-jobs/${id}/resume`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json();
  return { data, status: res.status };
}

/**
 * POST handler – dispatches to pause or resume based on the URL path.
 * Supports:
 *   POST /api/ingestion/sync-jobs/[id]/pause
 *   POST /api/ingestion/sync-jobs/[id]/resume
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params; // ✅ Await the params Promise

    if (!id) {
      return NextResponse.json(
        { message: "Sync job ID is required" },
        { status: 400 },
      );
    }

    // Extract the session token
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    const token = session
      ? ((await decrypt(session)) as DecryptedSession)?.access_token
      : null;

    // Determine which action to perform based on the request URL
    const url = new URL(request.url);
    const path = url.pathname;

    let result;
    if (path.endsWith("/pause")) {
      result = await pauseSyncJob(id, token);
    } else if (path.endsWith("/resume")) {
      result = await resumeSyncJob(id, token);
    } else {
      return NextResponse.json(
        { message: "Invalid action. Use /pause or /resume." },
        { status: 400 },
      );
    }

    return NextResponse.json(result.data, { status: result.status });
  } catch (error) {
    console.error("Error in sync job action:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE handler to remove a sync job.
 * DELETE /api/ingestion/sync-jobs/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params; // ✅ Await the params Promise

    if (!id) {
      return NextResponse.json(
        { message: "Sync job ID is required" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    const token = session
      ? ((await decrypt(session)) as DecryptedSession)?.access_token
      : null;

    const res = await fetch(`${API_BASE}/ingestion/sync-jobs/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Error deleting sync job:", error);
    return NextResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export interface OrgInfo {
  login: string;
  id: number;
  installationId: number;
  type: string;
}

export async function getUserOrgs(): Promise<OrgInfo[]> {
  const session = (await cookies()).get("session")?.value ?? null;
  let token = null;
  if (session) {
    const decryptSession = (await decrypt(session)) as SessionData;
    token = decryptSession?.access_token;
  }
  const { data } = await axios.get(`${API_BASE}/ingestion/orgs`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return data ?? [];
}

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  isPrivate: boolean;
}

export async function getOrgRepos(installationId: number): Promise<RepoInfo[]> {
  const session = (await cookies()).get("session")?.value ?? null;
  let token = null;
  if (session) {
    const decryptSession = (await decrypt(session)) as SessionData;
    token = decryptSession?.access_token;
  }
  const { data } = await axios.get(
    `${API_BASE}/ingestion/installations/${installationId}/repos`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  return data ?? [];
}
