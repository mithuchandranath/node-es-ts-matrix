import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";

// Update these two when you rename the repo or move to a custom domain.
// GitHub Pages under a project repo lives at https://<user>.github.io/<repo>/
// so `site` is the origin and `base` is the sub-path (with trailing slash).
const SITE = process.env.SITE_URL ?? "https://mithuchandranath.github.io";
const BASE = process.env.BASE_PATH ?? "/node-es-ts-matrix/";

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: "ignore",
  integrations: [react(), sitemap()],
});
