# Astroflame: NASA combustion data backend

This Next.js-style app runs on Cloudflare Workers using vinext. The first backend
stores selected NASA PSI investigation data in TigerData PostgreSQL. Cloudflare
Hyperdrive connects the Worker to TigerData.

## How the pieces fit together

```text
Browser
  -> Cloudflare Worker (this website and its read-only API)
  -> Cloudflare Hyperdrive (secure, pooled database connection)
  -> TigerData PostgreSQL (searchable records and measurements)

NASA PSI public API
  -> local import script
  -> TigerData PostgreSQL
```

The browser never connects directly to the database. The import script downloads
only two small public CSV files: the BASS experiment table (PSI-26) and the
SAFFIRE-III telemetry table (PSI-100). It does not download the investigations'
large raw-data archives or upload files to R2.

## 1. Create a TigerData database

1. Create or sign in to a TigerData account at [Tiger Cloud](https://console.cloud.tigerdata.com/).
2. Select **New service** and follow the setup wizard.
3. Wait until the service is ready.
4. Open the service's connection details and copy its PostgreSQL connection string.
5. Keep that connection string private. It contains a database password.

The SQL schema uses a TigerData time-series hypertable for SAFFIRE-III readings.
The BASS CSV is an experiment/run table, not a sensor time series, so it is
stored as regular relational rows.

## 2. Add your local database settings

Open a terminal in this `astroflame` folder. Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` in VS Code and replace `TIGER_DATABASE_URL` with the connection
string copied from TigerData. Leave `CLOUDFLARE_HYPERDRIVE_ID` as the example
value until you create Hyperdrive in the next step.

Do not add quotes unless TigerData's connection string itself requires them. Do
not commit or share `.env`; this project ignores it in Git.

## 3. Create the tables in TigerData

In the terminal, from the `astroflame` folder, run:

```bash
npm run db:migrate
```

The script runs [`db/schema.sql`](./db/schema.sql), which creates:

- `investigations`: NASA study IDs and titles.
- `source_files`: the public NASA file name, path, size, and source link.
- `bass_experiments`: typed columns plus the original CSV row for each BASS test.
- `telemetry_measurements`: one timestamped row per SAFFIRE sensor/channel value.

You should see `Database schema is ready.` If the command fails, check the
terminal message and verify `TIGER_DATABASE_URL` before continuing.

## 4. Connect Cloudflare to TigerData with Hyperdrive

Hyperdrive is Cloudflare's managed connection between a Worker and a
PostgreSQL-compatible database. It keeps the database connection details out of
browser code.

1. Open [Cloudflare Hyperdrive](https://dash.cloudflare.com/?to=/:account/workers/hyperdrive).
2. Choose **Create configuration** (or the equivalent button).
3. Name the configuration, for example `astroflame-tiger`.
4. Paste the TigerData PostgreSQL connection string into the connection field.
5. Create the configuration and copy its ID.
6. Put that ID on the `CLOUDFLARE_HYPERDRIVE_ID` line in `astroflame/.env`.
7. Keep the same `TIGER_DATABASE_URL` in `.env`. Local development and the
   import script use it directly; the deployed Worker uses the Hyperdrive
   binding instead.

The Hyperdrive ID is not a password. Never paste the TigerData connection
string into source code, a public issue, or a chat message.

This project declares the binding in [`cloudflare.config.ts`](./cloudflare.config.ts).
The local connection string is used only by local development; production
requests use the Cloudflare Hyperdrive ID.

## 5. Import the NASA data

Before connecting TigerData, you can preview the NASA files and validate how
many rows and channel values will be imported:

```bash
npm run data:preview
```

This downloads only the two selected small CSV files, validates their values,
and does not connect to or change the database.

Run this from the `astroflame` folder:

```bash
npm run data:import
```

The script fetches the current NASA file listing, verifies the files are public
and within its size limits, then downloads and imports only:

- `PSI-26_Experimental table_BASS.csv` (BASS experiment/test records).
- `PSI-100_Raw Data_Saffire_Data_Table2017.161.00.42.03-EU.csv`
  (SAFFIRE telemetry).

The SAFFIRE file has 11,450 data rows and 47 columns in the current NASA listing.
The importer converts its numeric sensor columns from wide CSV columns into
timestamped database rows. It uses `CygnusTimestamp` (milliseconds since the
Unix epoch) for the observation time and retains `RelativeSeconds` and the
original channel name.

The NASA CSV does not specify engineering units in its headers. The importer
therefore leaves `unit` empty rather than guessing. Negative values and zeroes
are kept as provided by NASA; they are not silently treated as missing data.
The original row number and source file are recorded so each database value can
be traced back to the NASA file.

The current NASA CSV contains a row with an invalid timestamp. The importer
keeps that entire original row in `telemetry_import_rejections` rather than
inventing a time or dropping it without notice. The rejections API shows the
row number and reason.

Importing is safe to repeat: existing BASS rows are updated and existing
telemetry points are not duplicated.

## 6. Check the API locally

Start the app:

```bash
npm run dev
```

Use the local URL printed by Vite. Add these paths to that URL in your browser:

- `/api/health/db` — confirms that the app can query TigerData.
- `/api/investigations` — lists the imported NASA investigations.
- `/api/investigations/PSI-26/experiments` — returns BASS experiment rows.
- `/api/investigations/PSI-100/measurements?limit=100` — returns up to 100
  SAFFIRE-III measurements.
- `/api/investigations/PSI-100/rejections` — explains source rows whose NASA
  timestamps are not valid measurement times.
- `/api/investigations/PSI-100/measurements?channel=P%40sfsHk.Radiometer1value&limit=100`
  — filters telemetry to one sensor channel.

The measurements endpoint accepts optional ISO date/time filters named `from`
and `to`, and a `limit` from 1 to 500. For example:

```text
/api/investigations/PSI-100/measurements?from=2017-06-06T14:15:00Z&limit=25
```

These are read-only endpoints. The import script is the only project code that
writes investigation records.

## 7. Deploy the updated Worker

After the local API works and the Hyperdrive ID is saved in `.env`, deploy from
this folder:

```bash
npm run deploy
```

The Worker should then serve the same API paths on your public domain. The local
development server does not need to stay running for the deployed site to work.

## About R2 and the large raw-data archives

Cloudflare R2 is object storage for files; TigerData is the SQL database for
records and measurements. The existing `misc/downloadfiles.py` can stream
selected NASA files to R2, but the current NASA listings show approximately
152.28 GiB of BASS raw files and 32.77 GiB of SAFFIRE-III raw files. This
backend intentionally does not download or upload those archives. Add only the
specific original files you need to R2 later; store their R2 object keys in
`source_files` if you want the app to link to them.

## Learn the database concepts

- **SQL table:** a collection of records with named columns.
- **Row:** one record. A BASS row describes a test; a telemetry row describes
  one channel value at one time.
- **Hypertable:** TigerData's time-partitioned PostgreSQL table, used here for
  SAFFIRE telemetry. You still query it with regular SQL.
- **Hyperdrive binding:** a server-side connection available to Worker code as
  `env.HYPERDRIVE`; it is not exposed to the browser.
- **NASA source file:** the importer records the NASA path and study page so
  imported values can be traced to their source.
