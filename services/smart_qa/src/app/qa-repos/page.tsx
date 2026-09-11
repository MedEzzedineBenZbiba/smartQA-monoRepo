import { QaReposClient } from "./QaReposClient";
import {
  getGithubAuthUrl,
  getGithubStatus,
  getOrgRepos,
  getSyncJobs,
  getUserOrgs,
} from "@/services/ingestion.service";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Repositories",
};

export default async function QaReposPage() {
  const [statusRes, authUrlRes] = await Promise.all([
    getGithubStatus(),
    getGithubAuthUrl("/qa-repos"),
  ]);

  const connected = statusRes.connected;

  const orgs = connected ? await getUserOrgs() : [];
  const org = orgs[0];

  const [repos, syncJobs] =
    connected && org
      ? await Promise.all([getOrgRepos(org.installationId), getSyncJobs()])
      : [[], []];

  return (
    <QaReposClient
      initialConnected={connected}
      initialRepos={repos}
      initialSyncJobs={syncJobs}
      githubAuthUrl={authUrlRes.url}
      orgName={org?.login ?? ""}
    />
  );
}
