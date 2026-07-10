import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tsReleaseNotesUrl } from "./ts-target-map.ts";
import { fetchFinishedProposals, type Proposal } from "./parse-proposals.ts";
import { fetchMinTsPerTarget } from "./fetch-ts-min-versions.ts";
import { fetchActiveStages } from "./fetch-stage3.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "../src/data/matrix.json");

const TSCONFIG_BASES_TREE =
  "https://api.github.com/repos/tsconfig/bases/contents/bases";
const NODE_SCHEDULE =
  "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json";
const NPM_TS_REGISTRY = "https://registry.npmjs.org/typescript";

type TsconfigBase = {
  display?: string;
  _version?: string;
  compilerOptions?: {
    target?: string;
    lib?: string[];
    module?: string;
  };
};

type NodeSchedule = Record<
  string,
  {
    start: string;
    lts?: string;
    maintenance?: string;
    end: string;
    codename?: string;
  }
>;

type MatrixRow = {
  nodeMajor: number;
  nodeCodename?: string;
  status: "current" | "active-lts" | "maintenance" | "eol" | "future";
  ltsStart?: string;
  maintenanceStart?: string;
  eol: string;
  target?: string;
  lib?: string[];
  module?: string;
  minTsVersion: string;
  minTsVersionSource: "typescript-lib" | "unknown";
  minTsReleaseNotesUrl?: string;
  targetProposals?: Proposal[];
  nativeTsStripping: boolean;
  tsconfigDisplay?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "user-agent": "node-es-ts-matrix-builder",
      accept: "application/vnd.github+json, application/json",
      ...(process.env.GITHUB_TOKEN
        ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function fetchTsconfigBases(): Promise<Map<number, TsconfigBase>> {
  const listing = await fetchJson<Array<{ name: string; download_url: string }>>(
    TSCONFIG_BASES_TREE,
  );
  const nodeFiles = listing.filter((f) => /^node(\d+)\.json$/.test(f.name));
  const map = new Map<number, TsconfigBase>();
  await Promise.all(
    nodeFiles.map(async (f) => {
      const major = Number(f.name.match(/^node(\d+)\.json$/)![1]);
      const body = await fetchJson<TsconfigBase>(f.download_url);
      map.set(major, body);
    }),
  );
  return map;
}

function classifyStatus(
  now: Date,
  entry: NodeSchedule[string],
): MatrixRow["status"] {
  const start = new Date(entry.start);
  const end = new Date(entry.end);
  if (now < start) return "future";
  if (now >= end) return "eol";
  if (entry.maintenance && now >= new Date(entry.maintenance))
    return "maintenance";
  if (entry.lts && now >= new Date(entry.lts)) return "active-lts";
  return "current";
}

function supportsNativeTsStripping(major: number): boolean {
  // Node 22.6 introduced --experimental-strip-types; Node 24 enabled it by default.
  return major >= 22;
}

async function main() {
  const now = new Date();

  const [bases, schedule, tsRegistry, proposalsByYear, liveMinTs, activeStages] =
    await Promise.all([
      fetchTsconfigBases(),
      fetchJson<NodeSchedule>(NODE_SCHEDULE),
      fetchJson<{ "dist-tags": Record<string, string> }>(NPM_TS_REGISTRY),
      fetchFinishedProposals(),
      fetchMinTsPerTarget().catch((err) => {
        console.warn(
          "fetchMinTsPerTarget failed — affected rows will show 'unknown':",
          err.message,
        );
        return {} as Record<string, string>;
      }),
      fetchActiveStages(["3"]).catch((err) => {
        console.warn(
          "fetchActiveStages failed — Stage 3 list will be empty:",
          err.message,
        );
        return {} as Record<string, Proposal[]>;
      }),
    ]);

  const tsDistTags = tsRegistry["dist-tags"] ?? {};

  const rows: MatrixRow[] = [];
  for (const [key, entry] of Object.entries(schedule)) {
    const major = Number(key.replace(/^v/, ""));
    if (!Number.isFinite(major) || major < 12) continue;

    const status = classifyStatus(now, entry);
    const base = bases.get(major);
    const target = base?.compilerOptions?.target;

    // Fully dynamic: min-TS resolved from microsoft/TypeScript's git tags.
    // If the live scan didn't find a result (e.g. rate-limited without a
    // GITHUB_TOKEN), we surface "unknown" rather than lie with stale data.
    let minTsVersion: string;
    let minTsVersionSource: MatrixRow["minTsVersionSource"];
    const liveHit = target ? liveMinTs[target.toLowerCase()] : undefined;
    if (liveHit) {
      minTsVersion = liveHit;
      minTsVersionSource = "typescript-lib";
    } else {
      minTsVersion = "unknown";
      minTsVersionSource = "unknown";
    }

    rows.push({
      nodeMajor: major,
      nodeCodename: entry.codename,
      status,
      ltsStart: entry.lts,
      maintenanceStart: entry.maintenance,
      eol: entry.end,
      target,
      lib: base?.compilerOptions?.lib,
      module: base?.compilerOptions?.module,
      minTsVersion,
      minTsVersionSource,
      minTsReleaseNotesUrl:
        minTsVersion !== "unknown" ? tsReleaseNotesUrl(minTsVersion) : undefined,
      targetProposals: target ? proposalsByYear[target.replace(/^es/i, "")] : undefined,
      nativeTsStripping: supportsNativeTsStripping(major),
      tsconfigDisplay: base?.display,
    });
  }

  rows.sort((a, b) => b.nodeMajor - a.nodeMajor);

  // Backwards-compatible summary consumed by the table's meta pill.
  const nextNode = rows.find((r) => r.status === "future");
  const nextReleases = {
    typescript: {
      latest: tsDistTags.latest,
      next: tsDistTags.next,
      beta: tsDistTags.beta,
      rc: tsDistTags.rc,
    },
    node: nextNode
      ? {
          major: nextNode.nodeMajor,
          codename: nextNode.nodeCodename,
          eol: nextNode.eol,
          ltsStart: nextNode.ltsStart,
        }
      : undefined,
  };

  // Richer "what's next" news block for the page.
  const currentYear = now.getUTCFullYear();
  const upcomingFinishedYears = Object.keys(proposalsByYear)
    .filter((y) => Number(y) >= currentYear)
    .sort()
    .map((year) => ({ year, proposals: proposalsByYear[year] }));

  const upcoming = {
    ecmascript: {
      stage3: activeStages["3"] ?? [],
      finishedByYear: upcomingFinishedYears,
      proposalsUrl: "https://github.com/tc39/proposals",
      processDocumentUrl: "https://tc39.es/process-document/",
      specDraftUrl: "https://tc39.es/ecma262/",
    },
    typescript: {
      latest: tsDistTags.latest,
      next: tsDistTags.next,
      beta: tsDistTags.beta,
      rc: tsDistTags.rc,
      npmLatestUrl: "https://www.npmjs.com/package/typescript",
      roadmapUrl: "https://github.com/microsoft/TypeScript/wiki/Roadmap",
      iterationPlansUrl:
        "https://github.com/microsoft/TypeScript/issues?q=is%3Aissue+label%3A%22Planning%22+%22Iteration+Plan%22",
      releasesUrl: "https://github.com/microsoft/TypeScript/releases",
      devBlogUrl: "https://devblogs.microsoft.com/typescript/",
    },
    node: {
      upcomingMajors: rows
        .filter((r) => r.status === "future")
        .map((r) => ({
          major: r.nodeMajor,
          codename: r.nodeCodename,
          ltsStart: r.ltsStart,
          maintenanceStart: r.maintenanceStart,
          eol: r.eol,
        })),
      scheduleUrl: "https://github.com/nodejs/Release#release-schedule",
      releasesUrl: "https://nodejs.org/en/about/previous-releases",
      changelogUrl: "https://github.com/nodejs/node/blob/main/CHANGELOG.md",
      blogUrl: "https://nodejs.org/en/blog",
    },
  };

  const output = {
    generatedAt: now.toISOString(),
    sources: {
      tsconfigBases: "https://github.com/tsconfig/bases",
      nodeSchedule: "https://github.com/nodejs/Release",
      typescriptRegistry: "https://registry.npmjs.org/typescript",
      typescriptRepo: "https://github.com/microsoft/TypeScript",
      tc39Proposals: "https://github.com/tc39/proposals",
    },
    nextReleases,
    upcoming,
    rows,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(
    `wrote ${rows.length} rows to ${OUT_PATH} (TS latest: ${tsDistTags.latest ?? "?"}, next: ${tsDistTags.next ?? "-"})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
