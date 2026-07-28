// app/connect-github/ConnectGithubClient.tsx
"use client";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.15-.02-2.09-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.35.95.1-.75.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.16 0 1.56-.01 2.82-.01 3.2 0 .31.2.66.79.55A11.5 11.5 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

interface ConnectGithubClientProps {
  githubAuthUrl: string;
  returnTo: string;
}

export function ConnectGithubClient({
  githubAuthUrl,
}: ConnectGithubClientProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-900">
          <GithubIcon className="h-7 w-7 text-white" />
        </div>

        <h1 className="mb-2 text-[18px] font-semibold text-gray-900">
          Connect your GitHub account
        </h1>

        <p className="mb-6 text-[13px] leading-relaxed text-gray-500">
          This platform needs access to your GitHub issues to continue.
          Connecting is required before you can access this page.
        </p>

        <a
          href={githubAuthUrl}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-gray-800"
        >
          <GithubIcon className="h-4 w-4" />
          Connect GitHub
        </a>
      </div>
    </div>
  );
}
