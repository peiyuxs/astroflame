export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
          NASA Space Apps
        </p>
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Astroflame
        </h1>
        <p className="text-lg leading-8 text-slate-700">
          Explore public spacecraft-fire research from NASA. Astroflame imports
          BASS experiment records and SAFFIRE-III telemetry into TigerData and
          makes them available through a read-only API.
        </p>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Available data</h2>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-700">
            <li>
              <a className="underline" href="/api/investigations">
                Investigation list
              </a>
            </li>
            <li>
              <a className="underline" href="/api/investigations/PSI-26/experiments">
                PSI-26 BASS experiments
              </a>
            </li>
            <li>
              <a className="underline" href="/api/investigations/PSI-100/measurements">
                PSI-100 SAFFIRE-III measurements
              </a>
            </li>
          </ul>
        </div>

        <p className="text-sm text-slate-600">
          API responses are JSON. Read the project README for setup instructions,
          query filters, and more details.
        </p>
      </section>
    </main>
  );
}
