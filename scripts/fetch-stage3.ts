// Parses the tc39/proposals README.md to extract in-flight proposals per
// stage (Stage 3 = "Candidate", specification is complete and awaiting
// implementer feedback; Stage 2.7 = spec-complete, awaiting Stage 3 review).
//
// The README structure is:
//   ## Active proposals
//   ### Stage 3
//   | [Title][ref] | Author | Champion | ... |
//   ### Stage 2.7
//   | ... |
//   ### Stage 2
//   | ... |
//   ## Contributing to proposals
//   [ref]: https://github.com/tc39/proposal-...

import type { Proposal } from "./parse-proposals.ts";

const README_URL =
  "https://raw.githubusercontent.com/tc39/proposals/main/README.md";

export async function fetchActiveStages(
  stages: readonly string[] = ["3", "2.7"],
): Promise<Record<string, Proposal[]>> {
  const res = await fetch(README_URL, {
    headers: { "user-agent": "node-es-ts-matrix-builder" },
  });
  if (!res.ok) {
    throw new Error(
      `fetch tc39/proposals README → ${res.status} ${res.statusText}`,
    );
  }
  const md = await res.text();
  return parseActiveStages(md, stages);
}

export function parseActiveStages(
  md: string,
  stages: readonly string[],
): Record<string, Proposal[]> {
  // Pass 1: collect reference-style link definitions.
  const linkDefs = new Map<string, string>();
  const defRe = /^\[([^\]]+)\]:\s*(\S+)/;
  for (const line of md.split(/\r?\n/)) {
    const m = defRe.exec(line);
    if (m) linkDefs.set(m[1].trim(), m[2].trim());
  }

  const result: Record<string, Proposal[]> = {};
  for (const stage of stages) result[stage] = [];

  // Pass 2: walk lines, tracking which `### Stage N` section we're in.
  // Any top-level `## ` heading terminates the active-proposals region.
  const lines = md.split(/\r?\n/);
  const stageRe = /^###\s+Stage\s+(\S+)\s*$/;
  let currentStage: string | null = null;
  const wanted = new Set(stages);

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      // Left the "## Active proposals" region entirely.
      currentStage = null;
      continue;
    }
    const h = stageRe.exec(line);
    if (h) {
      currentStage = wanted.has(h[1]) ? h[1] : null;
      continue;
    }
    if (!currentStage) continue;
    if (!line.startsWith("|")) continue;
    if (/^\|\s*-+/.test(line)) continue;

    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    const proposalCell = cells[0];
    if (!proposalCell) continue;
    // Skip the table's header row.
    if (/^proposal\b/i.test(proposalCell)) continue;

    // `[Title]` or `[Title][ref]` — ref defaults to Title.
    const labelMatch = /^\[([^\]]+)\](?:\[([^\]]*)\])?/.exec(proposalCell);
    if (!labelMatch) continue;
    const label = labelMatch[1].trim();
    const refKey = (labelMatch[2] ?? label).trim();
    const url = linkDefs.get(refKey) ?? linkDefs.get(label);
    if (!url) continue;

    result[currentStage].push({
      title: label.replace(/`/g, ""),
      url,
    });
  }

  return result;
}
