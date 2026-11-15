# Astroflame

Astroflame is a NASA Space Apps 26-hour hackathon project that imports selected spacecraft-fire
research data and makes it available through a read-only JSON API. It imports
public NASA Physical Sciences Informatics (PSI) CSV files, stores them in
TigerData (TimescaleDB), and connects a Cloudflare Worker to the database using
Cloudflare Hyperdrive.

The current application is API-first. Its home page explains the project and
includes a BASS flame-spread simulator and a SAFFIRE-III telemetry chart.

## What the application does

- Imports the BASS experiment table from NASA investigation **PSI-26**.
- Imports the SAFFIRE-III telemetry table from NASA investigation **PSI-100**.
- Preserves NASA source rows and records the source file for each import.
- Stores telemetry as time-series measurements in a TimescaleDB hypertable.
- Keeps measurements with invalid timestamps in a rejection table for review.
- Serves investigation details, experiments, measurements, and rejected rows
  from read-only API endpoints.
- Estimates BASS flame-spread rate from the supplied exploratory model results.
- Displays imported SAFFIRE-III sensor measurements as a time series.

The importer downloads only the selected public CSV files, not NASA's large
raw-data archives.

## Simulator and charts

The simulator lets users choose PMMA, SIBAL/cotton-fiberglass fabric, Nomex,
or Ultem, set oxygen from 0–100% (with Earth's 21% marked), and set airflow
from 0–40 cm/s. Running it starts a conceptual flame map: green is unburned,
yellow is vulnerable, red is burning, and black is burned. The timer measures
real elapsed time and stops when the map is fully burned or the model
self-extinguishes. A second chart plots simulated flame-front distance against
model time; the animation is accelerated for demonstration. Users can choose
the ignition cell by clicking the map or adjusting its row and column. The map
and chart use separate tabs, settings collapse into a sidebar, and a fullscreen
control expands the simulator to the available display.

The default PMMA rate is based on the supplied BASS-II analysis (39
observations across 18 experiment IDs). It is a PSI-25 model, separate from the
PSI-26 BASS table imported into TigerData. The reference fuel thickness is
fixed at 0.30 cm. The fit was measured over oxygen 17.9–22.2% and airflow
2–21 cm/s, so most slider settings are extrapolations. Adding airflow did not
improve grouped validation; airflow remains an exploratory control because
the simulator is intended to show its potential influence.

Ignition location changes the sample geometry and the distance-to-edge
estimate. The prototype spreads symmetrically from the selected cell; it does
not yet model directional airflow or material-specific flame behavior.

The SIBAL profile uses five supplied spread-rate observations as a reference
and transfers the PMMA fit's relative oxygen/airflow response. Nomex and
Ultem use clearly marked temporary PMMA-relative multipliers. These are
prototypes, not validated material-specific models. Material-specific
extinction thresholds are also missing: their code entries are `null`, so
the current model only stops a run at 0% oxygen or when its rate estimate is
not positive. Replace these placeholders when analyzed experimental data is
available. Do not use the simulator for fire-safety decisions.

The simulator is independent of TigerData and continues to work when SAFFIRE
readings are unavailable. The SAFFIRE-III time-series chart reads up to 500
recent measurements for a chosen sensor channel from TigerData through the
`/api/investigations/PSI-100/timeseries` endpoint. If no measurements have
been imported, the chart explains that instead of displaying invented data.

## How it works

1. The import scripts use a direct PostgreSQL connection to TigerData. The
   connection string is stored in a local, Git-ignored `.env` file.
2. The migration script applies the SQL schema in
   [`astroflame/db/schema.sql`](astroflame/db/schema.sql).
3. `cloudflare.config.ts` uses values from the local `.env` file to configure
   the local Worker. The API code queries the database through the Worker's
   `HYPERDRIVE` binding; it does not send database credentials to the browser.
4. The web page and API routes are in [`astroflame/app`](astroflame/app).

## Cloudflare, in beginner-friendly terms

Think of the project as three separate parts:

- **TigerData is the database.** It stores the imported NASA rows and
  timestamped SAFFIRE sensor readings.
- **Cloudflare Workers runs the website and its API.** When someone opens the
  deployed site, the Worker returns the page. When the page asks for database
  data, the Worker runs the API route and sends back JSON. Cloudflare is not
  where the scientific data is stored.
- **Hyperdrive is the connection between the Worker and TigerData.** It gives
  the Worker a managed PostgreSQL connection and keeps database connection
  details out of browser code. It is not another database and does not import,
  clean, or analyze NASA data.

The normal data flow looks like this:

```text
Visitor's browser → Cloudflare Worker → Hyperdrive → TigerData database
Your import command ───────────────────────────────→ TigerData database
```

The browser only talks to the Worker API; it never receives the database
password. The import scripts are different: they run from your computer and
connect directly to TigerData using `TIGER_DATABASE_URL`. During local Worker
development, the optional `TIGER_DATABASE_URL` also lets the local Hyperdrive
binding use that database. The deployed Worker instead uses its configured
Hyperdrive connection.

In short, **Cloudflare hosts and runs the web app/API, TigerData stores the
data, and Hyperdrive connects the two**. Cloudflare is needed to deploy the
current app and to run its Worker-based API; it is not needed to understand
the BASS equation itself. The web interface can still show the BASS simulator
without SAFFIRE readings, but the live SAFFIRE chart needs an available
database connection and imported measurements.

## Requirements

- Node.js 22.23+, 24.22+, or 26.12+ (supported Cloudflare CLI versions), and
  npm.
- A [TigerData](https://console.cloud.timescale.com/) account with a
  PostgreSQL service that has TimescaleDB enabled.
- A [Cloudflare](https://dash.cloudflare.com/) account with Workers access.
- Git, if you are cloning the repository.

## Set up the project locally

Open a terminal in the folder where you want the project, then clone it and
install its dependencies:

```bash
git clone https://github.com/peiyuxs/nasaspaceapps26.git
cd nasaspaceapps26/astroflame
npm install
```

Start the local development server:

```bash
npm run dev
```

Open the address printed in the terminal (Vite normally uses
`http://localhost:5173`). Stop the server with `Ctrl+C`.

The home page can be viewed without a database. The data API routes need a
populated TigerData database and an available Cloudflare `HYPERDRIVE` binding
in the local Worker environment.
The BASS simulator itself does not query the database. To start the local
Worker, `CLOUDFLARE_HYPERDRIVE_ID` in `.env` must contain the ID of a
Hyperdrive configuration (see [Connect Cloudflare to TigerData](#connect-cloudflare-to-tigerdata)).

## Set up TigerData

1. Sign in to the [TigerData console](https://console.cloud.timescale.com/).
2. Create a PostgreSQL service, or choose a service you already own. Confirm
   that TimescaleDB is enabled; the schema creates a hypertable using
   `tsdb.hypertable`.
3. Open the service's connection details and copy its **direct PostgreSQL
   connection string**. Keep the password private.
4. In the `astroflame` folder, copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and replace `TIGER_DATABASE_URL` with the connection string
   from TigerData. It should look similar to this:

   ```dotenv
   TIGER_DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require
   ```

   Use TigerData's connection string if its format differs. If the password
   contains special URL characters, use the URL-encoded value provided by
   TigerData. The `.env` file is ignored by Git; do not commit or share it.
   The `CLOUDFLARE_HYPERDRIVE_ID` value is needed to start the local Worker;
   add the Hyperdrive configuration ID as described in the Cloudflare section
   below. The ID is not a password, but the database credentials must remain
   private.
6. Create the database tables and indexes:

   ```bash
   npm run db:migrate
   ```

   A successful run prints `Database schema is ready.` The migration uses
   `CREATE ... IF NOT EXISTS` and can be run again.
7. Preview the selected NASA files before importing:

   ```bash
   npm run data:preview
   ```

   Preview downloads and validates the CSV files but does not connect to or
   change the database.
8. Import the datasets:

   ```bash
   npm run data:import
   ```

   The importer can be run again safely. It updates investigation and source
   file details, upserts BASS rows, and ignores duplicate telemetry
   measurements.

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

5. Deploy the application:

   ```bash
   npm run deploy
   ```

The Worker gets its database connection through the `HYPERDRIVE` binding, not
through `TIGER_DATABASE_URL`.

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

Run the importer tests with:

```bash
npm run test:import
```

## Project layout

```text
nasaspaceapps26/
├── README.md
├── astroflame/
│   ├── app/
│   │   ├── api/                 # Health check and read-only data endpoints
│   │   │   └── investigations/[psiId]/timeseries/route.ts
│   │   ├── components/          # Flame simulator and SAFFIRE time-series chart
│   │   ├── globals.css          # Global styles
│   │   ├── layout.tsx           # Shared layout and page metadata
│   │   └── page.tsx             # Home page
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
│   ├── cloudflare.config.ts     # Cloudflare Worker and Hyperdrive binding
│   └── package.json             # Dependencies and npm commands
├── archive/
│   ├── astroflame-README.md     # Superseded short app README
│   └── misc/                    # Legacy downloads, notebooks, and Python files
└── elig-data/                   # Supplied research data and analysis materials
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
- [Cloudflare Hyperdrive documentation](https://developers.cloudflare.com/hyperdrive/)
- [TigerData documentation](https://docs.tigerdata.com/)
