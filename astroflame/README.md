# vinext app

This project was created with create-vinext-app.

## Scripts

- `pnpm run dev` starts the vinext dev server.
- `pnpm run build` builds the Cloudflare Worker output.
- `pnpm run start` previews the built Worker locally.
- `pnpm run deploy` deploys the Cloudflare Worker.

## Check the TigerData connection

The `/api/health/db` endpoint runs a read-only `SELECT 1` query through the
Worker's `HYPERDRIVE` binding. After deploying, open
`https://<your-site>/api/health/db`. A successful response is
`{"status":"ok","database":"connected"}`. The endpoint does not expose database
credentials.

