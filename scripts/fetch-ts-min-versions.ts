// Resolves the minimum TypeScript version that first shipped support for each
// ECMAScript target, by walking microsoft/TypeScript's git tags and checking
// when `lib/lib.es<YEAR>.d.ts` first appears.
//
// Since target support is monotonic (once added, never removed), we share a
// pointer across years — total API cost is O(distinct minor versions).

type Tag = { name: string; major: number; minor: number; patch: number };

const REPO = "microsoft/TypeScript";
const TAG_URL = `https://api.github.com/repos/${REPO}/tags`;
const LIB_URL = (ref: string) =>
  `https://api.github.com/repos/${REPO}/contents/lib?ref=${ref}`;

async function ghJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "node-es-ts-matrix-builder",
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN
        ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });
  // Transient 5xx from the GitHub CDN — retry once with backoff.
  if (res.status >= 500 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    return ghJson<T>(url, attempt + 1);
  }
  if (!res.ok) {
    const err = new Error(
      `GET ${url} → ${res.status} ${res.statusText}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

async function fetchAllStableTags(): Promise<Tag[]> {
  const tags: Tag[] = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await ghJson<Array<{ name: string }>>(
      `${TAG_URL}?per_page=100&page=${page}`,
    );
    if (batch.length === 0) break;
    for (const { name } of batch) {
      const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(name);
      if (!m) continue; // skip rc/beta/etc.
      tags.push({
        name,
        major: +m[1],
        minor: +m[2],
        patch: +m[3],
      });
    }
    if (batch.length < 100) break;
  }
  // Keep the lowest patch per (major, minor) — the first stable of that minor.
  const firstStable = new Map<string, Tag>();
  for (const t of tags) {
    const key = `${t.major}.${t.minor}`;
    const prev = firstStable.get(key);
    if (!prev || t.patch < prev.patch) firstStable.set(key, t);
  }
  return [...firstStable.values()].sort(
    (a, b) => a.major - b.major || a.minor - b.minor,
  );
}

async function libFilesAt(ref: string): Promise<Set<string>> {
  try {
    const entries = await ghJson<Array<{ name: string }>>(LIB_URL(ref));
    return new Set(entries.map((e) => e.name));
  } catch (err) {
    // 404 is expected — very old tags predate `lib/` being tracked at the
    // repo root. Anything else (403 rate limit, 401 auth, 5xx after retry)
    // is a real problem; propagate so the caller can decide, instead of
    // silently poisoning every row with "unknown".
    const status = (err as { status?: number }).status;
    if (status === 404) return new Set();
    throw err;
  }
}

export async function fetchMinTsPerTarget(): Promise<Record<string, string>> {
  const tags = await fetchAllStableTags();
  // Check years spanning ES2015 → current year + 1.
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2015; y <= currentYear + 1; y++) years.push(y);

  const result: Record<string, string> = {};
  let startIdx = 0; // monotonic pointer: next year starts where the last one found the file
  for (const year of years) {
    const filename = `lib.es${year}.d.ts`;
    for (let i = startIdx; i < tags.length; i++) {
      const files = await libFilesAt(tags[i].name);
      if (files.has(filename)) {
        result[`es${year}`] = `${tags[i].major}.${tags[i].minor}`;
        startIdx = i;
        break;
      }
    }
  }
  return result;
}
