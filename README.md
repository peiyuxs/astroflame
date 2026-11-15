# AstroFlame

AstroFlame is a NASA Space Apps 2026 project. It includes an evidence-bounded
microgravity flame-spread simulator and read-only API endpoints for selected
NASA Physical Sciences Informatics (PSI) data. Imported PSI data is stored in
TigerData (TimescaleDB); Cloudflare Workers and Hyperdrive provide the hosted
application and its database connection.

The UI uses React and TypeScript with Next.js App Router-style files, built and
run through vinext and Vite for Cloudflare Workers. The simulator logic is
TypeScript and works independently of imported database data. The Analysis
section is intentionally blank, and the Documentation page is currently a
plain-text placeholder.

## What the application does

- Imports the BASS experiment table from NASA investigation **PSI-26**.
- Imports the SAFFIRE-III telemetry table from NASA investigation **PSI-100**.
- Preserves NASA source rows and records the source file for each import.
- Stores telemetry as time-series measurements in a TimescaleDB hypertable.
- Keeps measurements with invalid timestamps in a rejection table for review.
- Serves investigation details, experiments, measurements, and rejected rows
  from read-only API endpoints. The UI does not currently display a telemetry
  chart.
- Estimates BASS flame-spread rate from the supplied exploratory model results.
- Simulates opposed and concurrent flame spread using BASS and SAFFIRE-5
  experimental datasets.
- Provides a blank Analysis section for future project-specific analysis.
- Provides a Documentation page with placeholder text for the future model
  methodology write-up.

The importer downloads only the selected public CSV files, not NASA's large
raw-data archives.

## Simulator and model boundaries

The test selector offers two source-like regimes. BASS models smooth PMMA with
bounded airflow (2–21 cm/s), oxygen (17.9–22.2%), and thickness (0.1–0.5 cm)
controls. Its surface geometry is 10 × 2.2 cm for the visualization (the
reference reports specimen widths of 1.2 or 2.2 cm and assumes a 10 cm length).
The airflow-inclusive comparison regression represents opposed-flow spread,
against the incoming airflow vector. It is used to honor the airflow control,
although it performed slightly worse in grouped validation than the
thickness-plus-oxygen equation; it is not a validated physical law.

SAFFIRE-5 models a 40 × 20 cm ribbed PMMA specimen, 1 cm thick, with 3 cm
high ribs, at the reported 76.1 kPa and 26.9% oxygen. Airflow is restricted to
the two measured settings, 5 or 20 cm/s. Rib-width-dependent opposed FSR uses
piecewise interpolation between the approximate digitizations in
`elig-data/combine_fsr_data.csv`, never extrapolating beyond available values
for the selected airflow. The data are from one experiment and are not
independently validated.

Both regimes use an angular front: lateral rate is 0.85 times opposed rate,
and concurrent rate is `k` times opposed rate. The default `k = 2.1` reflects
reported NASA microgravity tests; the user may explore 0.5–4.0, with 1.5–4.0
recommended. The map shows directional propagation over the sample's actual
planform dimensions. Outputs include simulated full-surface spread time,
instantaneous and average burned-area growth, burned percentage, and opposed,
lateral, and concurrent front velocities. Animation is accelerated for
demonstration; reported values use model time. The simulator stays within a
viewport-height section; its controls collapse when the section comes into view
and can be reopened with the edge tab. The model-time clock and growth chart use
the same simulated-time samples.

A persistent warning explains that predictions near or outside the empirical
dataset ranges are physically uncertain. BASS and SAFFIRE-5 are separate
source-like regimes and must not be mixed into unsupported input combinations.
The models do not estimate ignition, probability of spread, burn duration, or
a limiting oxygen concentration. Do not use the simulator for fire-safety
decisions.

The simulator does not query TigerData. Its calculations use the TypeScript
model and local empirical inputs. The blank Analysis section has no telemetry
widget or dataset chart. Database-backed data remains available through the
read-only API routes listed below.

## What each technology does

- **React and TypeScript** build the interactive pages and simulator. TypeScript
  is also used for the flame-spread equations and simulation state.
- **Next.js conventions** organize pages under `app/`, with `page.tsx` files
  defining pages and `app/api/**/route.ts` files defining HTTP endpoints.
  This repository does not run the standard `next dev` or `next build`
  commands: vinext supplies the Next-compatible app runtime through Vite.
- **Vite** runs the local development server and production build. The
  Cloudflare Vite plugin configures the app to run as a Cloudflare Worker.
- **Cloudflare Workers** run the deployed site and API code. **Hyperdrive**
  provides the Worker a managed connection to TigerData without putting a
  database password in browser code.
- **TigerData** is the hosted PostgreSQL database with TimescaleDB features.
  It stores imported source rows and timestamped measurements. It is not
  required by the simulator's calculations. The project currently uses
  Cloudflare's beta `cf` CLI and Vite plugin; follow the repository's npm
  scripts rather than assuming a standard Wrangler or Next.js workflow.
- **Node.js scripts** download and validate the selected public NASA CSV files
  and write them to TigerData. The active application does not use Python for
  its model or database pipeline.

### Adding a page or API route

This project uses the Next.js App Router file layout through vinext:

1. Add a folder below `astroflame/app/` for the URL you want.
2. Add `page.tsx` in that folder and export a React page component. For
   example, `app/documentation/page.tsx` serves `/documentation`.
3. For an HTTP endpoint instead of a page, add
   `app/api/<name>/route.ts` and export a method such as `GET`.
4. Run `npm run dev` to check it locally, then `npm run build` to validate the
   production Worker bundle.

The shared navigation, footer, and global page metadata live in
`astroflame/app/layout.tsx`. Do not use `next dev` or `next build`; the
repository's Vite/vinext scripts provide the runtime and build.

## How it works

1. The Node.js importer downloads two selected public NASA CSV files and
   validates their rows.
2. The migration script applies the schema in
   [`astroflame/db/schema.sql`](astroflame/db/schema.sql). The importer then
   connects directly to TigerData with `TIGER_DATABASE_URL` and writes the
   imported rows.
3. The web/API runtime connects through Cloudflare's `HYPERDRIVE` binding.
   `cloudflare.config.ts` reads the binding ID from the local `.env` file.
4. The React pages and API route handlers live under
   [`astroflame/app`](astroflame/app). API handlers return JSON; the browser
   does not connect directly to PostgreSQL.

## Cloudflare, in beginner-friendly terms

Think of the data path as three separate parts:

- **TigerData is the database.** It stores the imported NASA rows and
  timestamped SAFFIRE sensor readings.
- **Cloudflare Workers runs the website and its API.** When someone opens the
  deployed site, the Worker serves the page and runs API routes. Cloudflare is
  not where the scientific data is stored.
- **Hyperdrive is the connection between the Worker and TigerData.** It gives
  the Worker a managed PostgreSQL connection and keeps database connection
  details out of browser code. It is not another database and does not import,
  clean, or analyze NASA data.

The page and database paths are separate:

```text
Visitor browser ──page request──→ Cloudflare Worker
API client ──JSON request───────→ Cloudflare Worker ──Hyperdrive──→ TigerData
Local importer ──CSV download───→ NASA PSI
Local importer ──database write───────────────────────────────→ TigerData
```

The browser only talks to the Worker; it never receives the database password.
The importer is different: it runs on your computer and connects directly to
TigerData using `TIGER_DATABASE_URL`. For local development,
`cloudflare.config.ts` also uses that URL as the local Hyperdrive connection
when it is set. The deployed Worker uses the connection saved in its
Hyperdrive configuration.

In short, **Cloudflare hosts and runs the web app/API, TigerData stores the
data, and Hyperdrive connects the two**. The simulator calculations do not
read from TigerData. The database is used by the optional read-only data API.

## Requirements

- Node.js 22.23+, 24.22+, or 26.12+ (supported Cloudflare CLI versions), and
  npm.
- A [TigerData](https://console.cloud.timescale.com/) account with a
  PostgreSQL service that has TimescaleDB enabled.
- A [Cloudflare](https://dash.cloudflare.com/) account with Workers access.
- Git, if you are cloning the repository.
- Python is not required for the active web app, simulator, or database
  importer. The optional archived downloader is described below.

## Set up the project locally

### 1. Download the project and install JavaScript dependencies

Open a terminal, clone the repository, and install the locked dependencies:

```bash
git clone https://github.com/peiyuxs/nasaspaceapps26.git
cd nasaspaceapps26/astroflame
npm ci
```

`npm ci` installs the versions recorded in `package-lock.json`. If you change
dependencies, use `npm install` to update that lock file.

### 2. Create the local environment file

Copy the example file. In PowerShell, run:

```powershell
Copy-Item .env.example .env
```

In Bash, use `cp .env.example .env`. Fill in both values in `.env` after
following the TigerData and Cloudflare setup steps below. The file is ignored
by Git; never commit database passwords or API secrets.

The local Cloudflare config checks for a Hyperdrive ID when the app starts, so
set up Cloudflare even if you only want to try the simulator. The simulator
itself does not make database queries, but the development server still loads
the Cloudflare configuration.

### 3. Set up TigerData and Cloudflare

Follow [Set up TigerData](#set-up-tigerdata), then
[Connect Cloudflare to TigerData](#connect-cloudflare-to-tigerdata). Run the
migration and import steps if you want the database API to return data.

### 4. Authenticate and start the local app

From the `astroflame` directory, sign in to Cloudflare and start the server:

```bash
npx cf auth login
npm run dev
```

Open the URL printed in the terminal (normally
`http://localhost:5173`). Stop the server with `Ctrl+C`.

The API's database endpoints need a migrated, populated database and a working
Hyperdrive connection. The homepage and simulator do not depend on imported
data.

## Set up TigerData

1. Sign in to the [TigerData console](https://console.cloud.timescale.com/).
2. Create a PostgreSQL service, or choose a service you already own. Confirm
   that TimescaleDB is enabled; the schema creates a hypertable using
   `tsdb.hypertable`.
3. Open the service's connection details and copy its **direct PostgreSQL
   connection string**. Keep the password private.
4. Open `.env` in the `astroflame` folder and replace `TIGER_DATABASE_URL`
   with the connection string
   from TigerData. It should look similar to this:

   ```dotenv
   TIGER_DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require
   ```

   Use TigerData's connection string if its format differs. If the password
   contains special URL characters, use the URL-encoded value provided by
   TigerData. The `.env` file is ignored by Git; do not commit or share it.
   The `CLOUDFLARE_HYPERDRIVE_ID` value is needed to start the local app; add
   the Hyperdrive configuration ID as described in the Cloudflare section
   below. The ID is not a password, but the database credentials must remain
   private.
5. Create the database tables and indexes:

   ```bash
   npm run db:migrate
   ```

   A successful run prints `Database schema is ready.` The migration uses
   `CREATE ... IF NOT EXISTS` and can be run again.
6. Preview the selected NASA files before importing:

   ```bash
   npm run data:preview
   ```

   Preview downloads and validates the CSV files but does not connect to or
   change the database.
7. Import the datasets:

   ```bash
   npm run data:import
   ```

   The importer can be run again safely. It updates investigation and source
   file details, upserts BASS rows, and ignores duplicate telemetry
   measurements.

The schema separates investigation and file metadata from the source data.
`bass_experiments` keeps each imported BASS CSV row, while
`telemetry_measurements` stores timestamped SAFFIRE-III channel values in a
TimescaleDB hypertable. Rows with unusable timestamps are recorded in
`telemetry_import_rejections` instead of being assigned invented times.
`source_files` links imported rows back to their NASA file and version.

## Connect Cloudflare to TigerData

The Worker uses Cloudflare Hyperdrive to reach the same TigerData database.
The settings below connect Cloudflare to the database; they do not upload the
NASA CSV files. The importer step above is what imports data.

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/) and
   open **Workers & Pages → Hyperdrive**.
2. Create a Hyperdrive configuration for PostgreSQL, using the TigerData
   service's host, port, database name, username, and password. Keep SSL
   enabled or required. Hyperdrive stores the database credentials; do not
   place them in this repository.
3. Copy the Hyperdrive configuration ID into `CLOUDFLARE_HYPERDRIVE_ID` in
   the `astroflame/.env` file. The project reads this value in
   [`astroflame/cloudflare.config.ts`](astroflame/cloudflare.config.ts) when
   starting or deploying the Worker.
4. From the `astroflame` folder, authenticate the Cloudflare CLI:

   ```bash
   npx cf auth login
   ```

5. To run locally, use `npm run dev`. To deploy the application, run:

   ```bash
   npm run deploy
   ```

The deployed Worker gets its database connection through the `HYPERDRIVE`
binding, not through `TIGER_DATABASE_URL`. The direct URL is used by local
database scripts and, when provided, the local Hyperdrive connection.

## Check the deployed application

After deployment, the CLI prints the Worker URL. Replace
`https://<worker-url>` in the following examples with that URL.

First check the database connection:

```text
https://<worker-url>/api/health/db
```

On success, the endpoint responds with:

```json
{"status":"ok","database":"connected"}
```

The health endpoint does not expose database credentials. The read-only data
endpoints are:

| Endpoint | Returns |
| --- | --- |
| `/api/investigations` | Imported investigation metadata |
| `/api/investigations/PSI-26/experiments?limit=100` | Up to 100 BASS experiment rows |
| `/api/investigations/PSI-100/measurements?limit=100` | Up to 100 SAFFIRE-III measurements |
| `/api/investigations/PSI-100/timeseries?channel=<channel>&limit=500` | Up to 500 recent SAFFIRE-III readings for a sensor channel; without `channel`, returns available channels and the first channel's readings |
| `/api/investigations/PSI-100/rejections?limit=100` | Up to 100 telemetry rows rejected for invalid timestamps |

The optional `limit` parameter defaults to 100 and must be between 1 and 500.
The measurements endpoint also accepts `from`, `to`, and `channel` filters.
For example:

```text
/api/investigations/PSI-100/measurements?from=2017-06-06T14:00:00Z&to=2017-06-06T15:00:00Z&channel=ChannelA
```

The `from` and `to` values can be ISO dates or timestamps. Invalid IDs or
filters return `400`; database failures return `503`.

## Useful commands

Run these commands from `astroflame`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite development server |
| `npm run build` | Build the application for Cloudflare Workers |
| `npm run start` | Preview a previously built application |
| `npm run preview` | Build, then preview the production output |
| `npm run deploy` | Deploy the Worker to Cloudflare |
| `npm run db:migrate` | Create the TigerData tables and indexes |
| `npm run data:preview` | Download and validate NASA CSVs without database writes |
| `npm run data:import` | Import the selected NASA CSV data |
| `npm run test:import` | Run the focused importer tests |
| `npm run test:model` | Run the BASS model and flame-simulation tests |
| `npx tsc --noEmit` | Check TypeScript types without emitting files |

Run the importer tests with:

```bash
npm run test:import
```

## Python utilities (archived and optional)

The active simulator, web app, database migration, and NASA data importer do
not use Python. The older `archive/misc/downloadfiles.py` utility is separate:
it can browse and download files from a NASA PSI investigation to a local
folder, or upload them to Cloudflare R2. It does not populate the AstroFlame
database.

To run that archived utility, install Python 3, then from the repository root:

```powershell
cd archive/misc
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python downloadfiles.py --list-only
python -m unittest -v test_downloadfiles.py
```

In macOS or Linux shells, activate the environment with
`source .venv/bin/activate` instead. Downloading to a local folder does not
need Cloudflare credentials. To use its optional R2 destination, copy
`archive/misc/.env.example` to `archive/misc/.env` and fill in the R2 account
ID and access keys. Keep those credentials private; never commit `.env`.

## Browser testing with Playwright (not configured)

This repository currently has no Playwright dependency, config, or browser
tests. The existing automated tests use Node's built-in test runner (see
`npm run test:model` and `npm run test:import`).

If you want to add end-to-end browser tests later:

1. From `astroflame`, install Playwright's test package:
   `npm install --save-dev @playwright/test`.
2. Install a browser for Playwright:
   `npx playwright install`.
3. Add a `playwright.config.ts` and tests under a test folder. Configure
   Playwright's `webServer` to run `npm run dev`, and set the test `baseURL`
   to the local address printed by Vite.
4. Add a package script such as `"test:e2e": "playwright test"` and run
   `npm run test:e2e`.

The local app still needs a valid `CLOUDFLARE_HYPERDRIVE_ID` to start. Tests
that call database endpoints also need a reachable database, the migrated
schema, and imported data. Do not put credentials in test files.

## Project layout

```text
nasaspaceapps26/
├── README.md
├── astroflame/
│   ├── app/
│   │   ├── api/                 # Health check and read-only JSON endpoints
│   │   ├── components/
│   │   │   └── FlameSimulator.tsx
│   │   ├── documentation/
│   │   │   └── page.tsx         # Placeholder methodology page
│   │   ├── globals.css          # Global styles
│   │   ├── layout.tsx           # Shared navigation, footer, and metadata
│   │   └── page.tsx             # Home page and blank Analysis section
│   ├── db/
│   │   └── schema.sql           # PostgreSQL and TimescaleDB schema
│   ├── lib/
│   │   ├── bass-model.ts        # BASS FSR equations and observed input ranges
│   │   ├── flame-simulation.ts  # Material estimates and flame-map simulation
│   │   ├── bass-model.test.mjs  # BASS model regression tests
│   │   ├── flame-simulation.test.mjs
│   │   └── database.ts          # Shared database and request helpers
│   ├── scripts/
│   │   ├── import-nasa-data.mjs # Download, validate, and import NASA CSVs
│   │   ├── import-nasa-data.test.mjs
│   │   └── migrate-db.mjs       # Apply the SQL schema
│   ├── cloudflare.config.ts     # Worker and Hyperdrive binding
│   ├── vite.config.ts           # vinext and Cloudflare Vite plugins
│   ├── .env.example             # Local environment variable names
│   └── package.json             # Dependencies and npm commands
├── archive/
│   └── misc/                    # Optional legacy Python NASA/R2 downloader
└── elig-data/                   # Research data, model outputs, and references
```

## Troubleshooting

- **`Set TIGER_DATABASE_URL`**: Make sure `.env` is in the `astroflame` folder
  and contains TigerData's direct PostgreSQL connection string.
- **Database login, SSL, or connection error**: Re-copy the connection
  details, check that the database service is running, and use the exact
  encoded password TigerData provided. If the database restricts incoming
  connections, allow access from your local machine and Cloudflare Hyperdrive.
- **`tsdb.hypertable` is unavailable**: Confirm that TimescaleDB is enabled for
  the TigerData service before running the migration.
- **`/api/health/db` returns `503`**: Check that the Hyperdrive ID and
  credentials point to the right database, then confirm the schema migration
  completed.
- **NASA download or CSV validation fails**: The importer uses NASA's public
  PSI API and stops if NASA is unavailable or a selected file has changed.
  Retry later and review the reported error before importing.

## Data sources and documentation

- [NASA PSI investigation PSI-26](https://psi.nasa.gov/physci/repo/data/investigations/PSI-26)
- [NASA PSI investigation PSI-100](https://psi.nasa.gov/physci/repo/data/investigations/PSI-100)
- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Vite documentation](https://vite.dev/guide/)
- [Cloudflare Hyperdrive documentation](https://developers.cloudflare.com/hyperdrive/)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [TigerData documentation](https://docs.tigerdata.com/)
- [Playwright documentation](https://playwright.dev/docs/intro)
