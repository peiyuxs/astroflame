# Astroflame

Astroflame is a NASA Space Apps project for making selected spacecraft-fire
research data easier to import and explore. It downloads two public NASA
Physical Sciences Informatics (PSI) CSV files, stores their contents in
TigerData (TimescaleDB), and exposes read-only JSON API routes from a
Cloudflare Worker.

The current version is API-first: the home page introduces the project, while
the data is available through the API endpoints below. It does not yet include
a charting or analysis dashboard.

## What the application does

<<<<<<< Updated upstream
=======
- Imports the BASS experiment table from NASA investigation **PSI-26**.
- Imports the SAFFIRE-III telemetry table from NASA investigation **PSI-100**.
- Preserves each NASA source row and records which source file it came from.
- Stores telemetry as time-series measurements in a TimescaleDB hypertable.
- Keeps telemetry rows with invalid timestamps in a separate rejection table
  rather than silently discarding them.
- Provides read-only endpoints for investigation metadata, experiment rows,
  telemetry measurements, and rejected rows.
- Connects the Cloudflare Worker to PostgreSQL through Cloudflare Hyperdrive.

The importer selects specific public CSV files; it does not download NASA's
large raw-data archives.

## How the pieces fit together

1. The import scripts use a direct TigerData PostgreSQL connection. This
   connection is for local setup and one-time data imports.
2. `db/schema.sql` creates the tables and indexes. The telemetry table is
   configured as a TimescaleDB hypertable.
3. The API routes use the Cloudflare `HYPERDRIVE` binding to query the
   database. The Worker does not read the local `.env` file.
4. `app/page.tsx` contains the home page. The API routes live under
   `app/api/`.

## Requirements

- Node.js 20.19 or newer (or 22.12 or newer) and npm.
- A [TigerData](https://console.cloud.timescale.com/) account and a PostgreSQL
  service with the TimescaleDB extension.
- A [Cloudflare](https://dash.cloudflare.com/) account with Workers access.
- Git, if you are cloning this repository.

Run all commands below from the `astroflame` folder.

## 1. Get the project running locally

Clone the repository if you have not already, then open a terminal in its
`astroflame` folder:

```bash
git clone https://github.com/peiyuxs/nasaspaceapps26.git
cd nasaspaceapps26/astroflame
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local address printed in the terminal (Vite normally uses
`http://localhost:5173`). Stop the server with `Ctrl+C`.
The home page can be viewed without a database. The data API routes need the
database to be populated and the Cloudflare `HYPERDRIVE` binding to be
available in the local Worker environment.

## 2. Create and prepare a TigerData database

1. Sign in to the [TigerData console](https://console.cloud.timescale.com/).
2. Create a PostgreSQL service, or select a service you already own. Make sure
   it has the TimescaleDB extension enabled; the schema creates a hypertable
   using `tsdb.hypertable`.
3. In the service's connection details, find and copy its **direct PostgreSQL
   connection string**. Keep the password private. Do not paste it into source
   code, an issue, or a chat.
4. In `astroflame`, copy `.env.example` to `.env` and replace the example value
   with the connection string:

   ```powershell
   Copy-Item .env.example .env
   ```

   ```dotenv
   TIGER_DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE?sslmode=require
   ```

   Use the connection string provided by TigerData if its format differs. If
   the password contains reserved URL characters, use the URL-encoded value
   from TigerData rather than editing the password by hand. The `.env` file is
   ignored by Git.
5. Create the tables and indexes:

   ```bash
   npm run db:migrate
   ```

   A successful run prints `Database schema is ready.` The migration can be
   run again safely; it uses `CREATE ... IF NOT EXISTS`.
6. Preview the selected NASA files before writing any data:

   ```bash
   npm run data:preview
   ```

   This downloads and validates the selected CSVs, reports how many rows would
   be imported, and does not connect to or change the database.
7. Import the datasets:

   ```bash
   npm run data:import
   ```

   The import may take a little while because NASA's CSV files must be
   downloaded. The operation can be safely rerun: investigation and source-file
   records are upserted, BASS rows are upserted, and duplicate telemetry rows
   are ignored.

## 3. Connect Cloudflare to TigerData with Hyperdrive

The Worker needs a Cloudflare Hyperdrive configuration that points to the same
TigerData database.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), open
   **Workers & Pages → Hyperdrive** and create a Hyperdrive configuration for
   PostgreSQL.
2. Enter TigerData's database host, port, database name, username, and
   password from the service's connection details. Keep SSL enabled/required.
   Hyperdrive stores and manages these connection details; do not put the
   password in this repository.
3. Copy the Hyperdrive configuration ID.
4. Open `cloudflare.config.ts` and replace the `id` in
   `bindings.hyperdrive({ id: "..." })` with your configuration ID. The
   existing ID in the file is for the current project environment and may not
   be available in your Cloudflare account.
5. From `astroflame`, authenticate the Cloudflare CLI for the account that
   owns this Hyperdrive configuration:

   ```bash
   npx cf auth login
   ```

6. Deploy the application:

   ```bash
   npm run deploy
   ```

The project configuration binds that Hyperdrive resource as `HYPERDRIVE`.
The deployed Worker gets its database connection through this binding, not
through `TIGER_DATABASE_URL`.

## 4. Check the deployed application

After deployment, the CLI prints the Worker URL. Replace
`https://<worker-url>` in the examples with that URL.

First check the database connection:

```text
https://<worker-url>/api/health/db
```

A successful response looks like:

```json
{"status":"ok","database":"connected"}
```

The health endpoint does not return database credentials. Then try the data
routes:

| Endpoint | What it returns |
| --- | --- |
| `/api/investigations` | Imported investigation metadata |
| `/api/investigations/PSI-26/experiments?limit=100` | Up to 100 BASS experiment rows |
| `/api/investigations/PSI-100/measurements?limit=100` | Up to 100 SAFFIRE-III measurements |
| `/api/investigations/PSI-100/rejections?limit=100` | Up to 100 telemetry rows rejected for invalid timestamps |

The `limit` parameter is optional, defaults to 100, and must be from 1 to 500.
The measurements endpoint also accepts optional `from`, `to`, and `channel`
filters. For example:

```text
/api/investigations/PSI-100/measurements?from=2017-06-06T14:00:00Z&to=2017-06-06T15:00:00Z&channel=ChannelA
```

Dates may be ISO dates or timestamps. Invalid IDs, limits, dates, and channel
filters return a `400` response with an error message. Database failures return
a `503` response.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite development server |
| `npm run build` | Build the application for Cloudflare Workers |
| `npm run start` | Preview a previously built application locally |
| `npm run preview` | Build, then preview the production output |
| `npm run deploy` | Deploy the Worker to Cloudflare |
| `npm run db:migrate` | Create the TigerData tables and indexes |
| `npm run data:preview` | Download and validate the selected NASA CSVs without database writes |
| `npm run data:import` | Import the selected NASA CSV data |
| `npm run test:import` | Run the focused importer tests |

Run the importer tests with:

```bash
npm run test:import
```

## Project layout

```text
astroflame/
├── app/
│   ├── api/                 # Health check and read-only data endpoints
│   ├── globals.css          # Global styles
│   ├── layout.tsx           # Shared page layout and metadata
│   └── page.tsx             # Home page
├── db/
│   └── schema.sql           # PostgreSQL and TimescaleDB schema
├── lib/
│   └── database.ts          # Shared database and request helpers
├── scripts/
│   ├── import-nasa-data.mjs # NASA CSV download, validation, and import
│   ├── import-nasa-data.test.mjs
│   └── migrate-db.mjs       # Applies the database schema
├── cloudflare.config.ts     # Cloudflare Worker and Hyperdrive binding
└── package.json             # Dependencies and npm commands
```

## Troubleshooting

- **`Set TIGER_DATABASE_URL`**: Make sure `.env` exists in the `astroflame`
  folder and contains the direct TigerData connection string. The migration
  and importer load this file automatically.
- **Database login, SSL, or network error**: Re-copy the connection details
  from TigerData, make sure the service is running, and confirm the password
  is URL-encoded as supplied. If the service restricts incoming connections,
  allow the connections required by your local machine and Cloudflare
  Hyperdrive.
- **`tsdb.hypertable` is unavailable**: The selected database must have the
  TimescaleDB extension enabled. Check the TigerData service and its extension
  settings before running the migration.
- **`/api/health/db` returns an error**: Confirm that the Worker is using the
  Hyperdrive ID for the correct database, that the Hyperdrive credentials are
  current, and that the schema migration has completed.
- **NASA download or CSV validation fails**: The importer reads the current
  public NASA PSI API and stops with an error if NASA is unavailable or the
  selected file has changed. Retry later and review the reported error before
  importing again.

## Data sources

- [NASA PSI investigation PSI-26](https://psi.nasa.gov/physci/repo/data/investigations/PSI-26)
- [NASA PSI investigation PSI-100](https://psi.nasa.gov/physci/repo/data/investigations/PSI-100)
- [Cloudflare Hyperdrive documentation](https://developers.cloudflare.com/hyperdrive/)
- [TigerData documentation](https://docs.tigerdata.com/)
>>>>>>> Stashed changes
