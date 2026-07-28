export function extractRepo(url: string | undefined | null): string | null {
  if (!url) return null;
  const parts = url.split('/');
  // https:, '', api.github.com, repos, {owner}, {repo}, issues, {id}
  const owner = parts[4];
  const repoName = parts[5];
  if (!owner || !repoName) return null;
  return `${owner}/${repoName}`;
}
