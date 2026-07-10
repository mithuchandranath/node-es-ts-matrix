import { useMemo, useState } from "react";
import type { MatrixData, MatrixRow, MatrixStatus } from "../types";

type Props = { data: MatrixData };

const statusLabel: Record<MatrixStatus, string> = {
  current: "Current",
  "active-lts": "Active LTS",
  maintenance: "Maintenance",
  eol: "EOL",
  future: "Future",
};

function tsconfigSnippet(row: MatrixRow): string {
  const target = row.target ?? "esnext";
  const lib = row.lib ?? [target];
  const module = row.module ?? "nodenext";
  return JSON.stringify(
    {
      compilerOptions: {
        target,
        lib,
        module,
        moduleResolution: "nodenext",
        esModuleInterop: true,
        skipLibCheck: true,
        strict: true,
      },
    },
    null,
    2,
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked; ignore */
  }
}

export default function MatrixTable({ data }: Props) {
  const [hideEol, setHideEol] = useState(true);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return data.rows.filter((row) => {
      if (hideEol && row.status === "eol") return false;
      if (query.trim()) {
        const needle = query.toLowerCase();
        const hay = [
          `node ${row.nodeMajor}`,
          row.nodeCodename ?? "",
          row.target ?? "",
          row.minTsVersion,
          statusLabel[row.status],
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data.rows, hideEol, query]);

  return (
    <div className="matrix">
      <div className="controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={hideEol}
            onChange={(e) => setHideEol(e.target.checked)}
          />
          Hide EOL versions
        </label>
        <input
          type="search"
          placeholder="filter (e.g. node 22, es2024, 5.7)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search"
        />
        <span className="meta">
          {rows.length} of {data.rows.length} rows · TS latest{" "}
          <code>{data.nextReleases.typescript.latest ?? "?"}</code>
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Node</th>
              <th>Status</th>
              <th>EOL</th>
              <th>Target</th>
              <th>Min TS</th>
              <th>Native .ts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.nodeMajor} data-status={row.status}>
                <td>
                  <strong>{row.nodeMajor}</strong>
                  {row.nodeCodename ? (
                    <span className="codename"> {row.nodeCodename}</span>
                  ) : null}
                </td>
                <td>
                  <span className={`badge badge-${row.status}`}>
                    {statusLabel[row.status]}
                  </span>
                </td>
                <td>{row.eol}</td>
                <td>
                  {row.target ? (
                    <>
                      <code>{row.target}</code>
                      {" "}
                      <button
                        type="button"
                        className="copy-link"
                        onClick={() => copy(tsconfigSnippet(row))}
                        title="Copy recommended tsconfig snippet"
                      >
                        copy tsconfig
                      </button>
                      {row.targetProposals && row.targetProposals.length > 0 ? (
                        <details className="proposals">
                          <summary>
                            {row.targetProposals.length} proposal
                            {row.targetProposals.length === 1 ? "" : "s"}
                          </summary>
                          <ul>
                            {row.targetProposals.map((p) => (
                              <li key={p.url}>
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {p.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {row.minTsVersion === "unknown" ? (
                    "—"
                  ) : row.minTsReleaseNotesUrl ? (
                    <a
                      href={row.minTsReleaseNotesUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        row.minTsVersionSource === "typescript-lib"
                          ? `Resolved live from microsoft/TypeScript: lib.${row.target}.d.ts first shipped in TS ${row.minTsVersion}`
                          : `Unresolved — live scan of microsoft/TypeScript did not find a match`
                      }
                    >
                      <code>{row.minTsVersion}</code>
                    </a>
                  ) : (
                    <code>{row.minTsVersion}</code>
                  )}
                </td>
                <td>{row.nativeTsStripping ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
