import "dotenv/config";
import { bindings, defineConfig, defineWorker } from "cf/config";

const hyperdriveId =
  process.env.CLOUDFLARE_HYPERDRIVE_ID?.trim() ||
  "replace-with-your-hyperdrive-id";
const localDatabaseUrl = process.env.TIGER_DATABASE_URL?.trim();

export default defineConfig({
  worker: defineWorker({
    name: "astroflame",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-14",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      HYPERDRIVE: bindings.hyperdrive({
        id: hyperdriveId,
        ...(localDatabaseUrl
          ? { dev: { connectionString: localDatabaseUrl } }
          : {}),
      }),
    },
  }),
});
