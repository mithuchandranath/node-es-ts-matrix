// Utility helpers for TypeScript version reasoning. No hand-curated data —
// the min-TS-per-target map is resolved dynamically at build time by
// scripts/fetch-ts-min-versions.ts.

// Extract the minimum concrete version from a semver range like ">=5.7",
// "^5.0", "5.7.x", etc. Returns null if it can't be parsed.
export function minVersionFromRange(range: string): string | null {
  const m = /(\d+(?:\.\d+)?(?:\.\d+)?)/.exec(range);
  if (!m) return null;
  const parts = m[1].split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0];
}

// Canonical TypeScript release-notes URL. typescriptlang.org keeps a stable
// path per major.minor: /docs/handbook/release-notes/typescript-5-7.html
export function tsReleaseNotesUrl(version: string): string | undefined {
  const m = /^(\d+)\.(\d+)/.exec(version);
  if (!m) return undefined;
  return `https://www.typescriptlang.org/docs/handbook/release-notes/typescript-${m[1]}-${m[2]}.html`;
}
