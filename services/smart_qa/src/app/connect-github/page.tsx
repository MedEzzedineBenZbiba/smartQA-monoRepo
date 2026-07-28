import {
  getGithubAuthUrl,
  getGithubStatus,
  syncIssues,
} from "@/services/ingestion.service";
import { redirect } from "next/navigation";
import { ConnectGithubClient } from "./ConnectGithubClient";

interface PageProps {
  searchParams: Promise<{ returnTo?: string; github?: string }>;
}

export default async function ConnectGithubPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const returnTo = params.returnTo ?? "/dashboard";

  // Just came back from GitHub OAuth — finish the ingest (attaches the
  // pending token to this user), THEN send them to the real destination.
  if (params.github === "connected") {
    await syncIssues();
    redirect(returnTo);
  }

  // Already connected (e.g. user manually navigated here) — skip straight through.
  const status = await getGithubStatus();
  if (status.connected) {
    redirect(returnTo);
  }

  const { url: githubAuthUrl } = await getGithubAuthUrl(returnTo);

  return (
    <ConnectGithubClient githubAuthUrl={githubAuthUrl} returnTo={returnTo} />
  );
}
