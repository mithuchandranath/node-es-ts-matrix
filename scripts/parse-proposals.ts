// Parses the tc39/proposals finished-proposals.md file into a list of finished
// proposals grouped by their "Expected Publication Year" column.
//
// The file has a single markdown table with reference-style links, e.g.
//   | [Explicit Resource Management] | Ron Buckton | ... | 2027 |
// and link definitions at the bottom, e.g.
//   [Explicit Resource Management]: https://github.com/tc39/proposal-...

export type Proposal = { title: string; url: string };

export type ProposalsByYear = Record<string, Proposal[]>;

const FINISHED_PROPOSALS_URL =
  "https://raw.githubusercontent.com/tc39/proposals/main/finished-proposals.md";

export async function fetchFinishedProposals(): Promise<ProposalsByYear> {
  const res = await fetch(FINISHED_PROPOSALS_URL, {
    headers: { "user-agent": "node-es-ts-matrix-builder" },
  });
  if (!res.ok) {
    throw new Error(
      `fetch finished-proposals.md → ${res.status} ${res.statusText}`,
    );
  }
  const md = await res.text();
  return parseFinishedProposals(md);
}

export function parseFinishedProposals(md: string): ProposalsByYear {
  // Pass 1: collect reference-style link definitions.
  const linkDefs = new Map<string, string>();
  const defRe = /^\[([^\]]+)\]:\s*(\S+)/;
  for (const line of md.split(/\r?\n/)) {
    const m = defRe.exec(line);
    if (m) linkDefs.set(m[1].trim(), m[2].trim());
  }

  // Pass 2: pick out real table rows (skip header + separator).
  const rows = md
    .split(/\r?\n/)
    .filter((l) => l.startsWith("|") && !/^\|\s*-+/.test(l))
    .map((l) => l.trim());

  const grouped: ProposalsByYear = {};
  for (const row of rows) {
    // Trim leading/trailing pipes, then split.
    const cells = row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 5) continue;

    const proposalCell = cells[0];
    const yearCell = cells[cells.length - 1];
    if (!/^\d{4}$/.test(yearCell)) continue; // skip header row and stray rows

    // Extract label from `[Label]` — the label may itself contain inline code.
    const labelMatch = /^\[([^\]]+)\](?:\[([^\]]*)\])?/.exec(proposalCell);
    if (!labelMatch) continue;
    const label = labelMatch[1].trim();
    const refKey = (labelMatch[2] ?? label).trim();
    const url = linkDefs.get(refKey) ?? linkDefs.get(label);
    if (!url) continue;

    const title = label.replace(/`/g, ""); // strip inline-code backticks
    (grouped[yearCell] ??= []).push({ title, url });
  }

  return grouped;
}
