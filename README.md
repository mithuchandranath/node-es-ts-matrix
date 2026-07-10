# Node ↔ ECMAScript ↔ TypeScript Compatibility Matrix

**Live site:** https://mithuchandranath.github.io/node-es-ts-matrix/

A single-page reference that answers "I'm on Node X — which ECMAScript target should I set in `tsconfig.json`, and what's the minimum TypeScript version that accepts it?"

Every row (one per Node major) shows:

- LTS / EOL status and end-of-life date
- Recommended ECMAScript `target` (from [`@tsconfig/bases`](https://github.com/tsconfig/bases))
- Minimum TypeScript version that ships `lib.<target>.d.ts` (resolved live from [`microsoft/TypeScript`](https://github.com/microsoft/TypeScript) git tags)
- Whether Node can run `.ts` files natively (type stripping — Node ≥ 22)
- The finished TC39 proposals bundled in that ES year
- One-click copy of a matching `tsconfig.json` snippet

The "Upcoming" strip shows the next TypeScript pre-releases (`next` / `rc` / `beta`) from the npm registry and the next planned Node major from `nodejs/Release`.

## Why

There's no single reference for the Node × ES × TS three-way. You end up cross-referencing `node.green`, `@tsconfig/bases`, and the TypeScript release notes — and usually discover the mismatch only when the compiler errors with `'es2025' is an invalid target`.

## How it stays fresh

Zero hand-curated data. Everything is fetched from authoritative live sources at build time and refreshed automatically:

| Axis | Source |
| --- | --- |
| Node LTS / EOL dates | `nodejs/Release/main/schedule.json` |
| Node → recommended `target`/`lib` | `tsconfig/bases` GitHub repo |
| Min TypeScript per ES target | `microsoft/TypeScript` git tags (walks `lib/lib.esYYYY.d.ts` presence) |
| Latest / next / rc / beta TS | `registry.npmjs.org/typescript` `dist-tags` |
| Finished ES proposals per year | `tc39/proposals/finished-proposals.md` |

A weekly GitHub Actions cron (`.github/workflows/refresh-data.yml`, Mondays 06:17 UTC) re-runs the fetcher and opens a PR if `src/data/matrix.json` changed. Merging the PR triggers `deploy.yml`, which rebuilds and publishes to GitHub Pages.

## Local development

```bash
npm install
npm run dev            # http://localhost:4321
```

The dev server reads the checked-in `src/data/matrix.json` — you don't need to hit any live APIs.

To regenerate the data locally:

```bash
export GITHUB_TOKEN=$(gh auth token)   # avoids the 60/hr unauth GitHub rate limit
npm run fetch-data
```

## Stack

- [Astro 5](https://astro.build) — static output, one React island for the interactive table
- [React 19](https://react.dev) — filter / hide-EOL / copy-tsconfig controls
- [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/) — `sitemap-index.xml` at build

The page renders server-side; the React island only hydrates the controls. Works with JavaScript disabled (loses filter + copy).

## Project layout

```
├── astro.config.mjs
├── public/                     # static assets (favicon, robots.txt)
├── scripts/
│   ├── fetch-data.ts           # orchestrator; writes src/data/matrix.json
│   ├── fetch-ts-min-versions.ts  # scans microsoft/TypeScript git tags
│   ├── parse-proposals.ts      # parses tc39/proposals/finished-proposals.md
│   └── ts-target-map.ts        # small pure helpers (release-notes URL, etc.)
├── src/
│   ├── components/MatrixTable.tsx
│   ├── data/matrix.json        # generated, committed
│   ├── pages/index.astro
│   ├── styles/global.css
│   └── types.ts
└── .github/workflows/
    ├── refresh-data.yml        # weekly cron → PR on change
    └── deploy.yml              # push to main → GitHub Pages
```

## Deployment

The `deploy.yml` workflow builds and publishes to GitHub Pages on every push to `main`. `actions/configure-pages` supplies the correct origin + base path at build time, so `astro.config.mjs` needs no changes if you fork.

To host it yourself under a different repo/domain, either fork and let the workflow pick up the new Pages URL automatically, or override `SITE_URL` / `BASE_PATH` env vars when running `npm run build`.

## License

MIT.
