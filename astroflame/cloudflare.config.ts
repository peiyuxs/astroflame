import { bindings, defineConfig, defineWorker } from "cf/config";

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
        id: "364d4927590d4c0a8309834e4d85d927",
      }),
    },
  }),
});
