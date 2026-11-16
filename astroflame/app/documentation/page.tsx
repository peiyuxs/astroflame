import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | AstroFlame",
  description: "AstroFlame system architecture, AI tools, and references.",
};

export default function DocumentationPage() {
  return (
    <main>
      <section
        aria-labelledby="documentation-title"
        className="page-section documentation-section"
      >
        <div className="section-content">
          <h1 id="documentation-title">Documentation</h1>
          <h2>References</h2>
          <ul>
            <li>
              NASA Physical Sciences Informatics.{" "}
              <a
                href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-26"
                rel="noreferrer"
                target="_blank"
              >
                PSI-26: Burning and Suppression of Solids (BASS)
              </a>
              .
            </li>
            <li>
              NASA TechPort.{" "}
              <a
                href="https://techport.nasa.gov/projects/13543"
                rel="noreferrer"
                target="_blank"
              >
                SAFFIRE-V: Spacecraft Fire Safety Demonstration (Saffire)
              </a>
              .
            </li>
            <li>
              Olson &amp; Ferkul.{" "}
              <a
                href="https://ntrs.nasa.gov/api/citations/20140011099/downloads/20140011099.pdf"
                rel="noreferrer"
                target="_blank"
              >
                NASA Glenn Research Center BASS-II / POIWG
              </a>
              .
            </li>
            <li>
              <a
                href="https://www.researchgate.net/publication/255013038_Microgravity_Flame_Spread_in_Exploration_Atmospheres_Pressure_Oxygen_and_Velocity_Effects_on_Opposed_and_Concurrent_Flame_Spread"
                rel="noreferrer"
                target="_blank"
              >
                Microgravity Flame Spread in Exploration Atmospheres: Pressure,
                Oxygen, and Velocity Effects on Opposed and Concurrent Flame
                Spread
              </a>
              .
            </li>
          </ul>
          <div className="documentation-report">
            <h2>Documentation</h2>
            <h3>System Architecture</h3>
            <p>
              AstroFlame was implemented as a modern web application using:
            </p>
            <h4>Frontend</h4>
            <ul>
              <li>Next.js</li>
              <li>TypeScript</li>
              <li>Tailwind CSS</li>
            </ul>
            <h4>Backend</h4>
            <ul>
              <li>Python data processing</li>
              <li>Cloudflare Workers</li>
            </ul>
            <h4>Data Infrastructure</h4>
            <ul>
              <li>TigerData (TimescaleDB)</li>
              <li>Cloudflare Hyperdrive</li>
              <li>NASA PSI datasets</li>
            </ul>
            <p>
              The architecture enables users to interact with NASA combustion
              data through lightweight API endpoints while maintaining
              separation between visualization and analytical layers.
            </p>
            <h3>Utilized AI-Tools</h3>
            <ul>
              <li>Google Gemini</li>
              <li>Co-Pilot</li>
              <li>Claude</li>
              <li>DeepSeek</li>
              <li>Chat-GPT</li>
            </ul>
            <h2>References</h2>
            <ul>
              <li>
                NASA Physical Science Informatics Repository. PSI-26: Burning
                and Suppression of Solids (BASS).{" "}
                <a
                  href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-26"
                  rel="noreferrer"
                  target="_blank"
                >
                  https://psi.nasa.gov/physci/repo/data/investigations/PSI-26
                </a>
              </li>
              <li>
                NASA Physical Science Informatics Repository. PSI-100:
                Spacecraft Fire Safety Demonstration (SAFFIRE-III).{" "}
                <a
                  href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-100"
                  rel="noreferrer"
                  target="_blank"
                >
                  https://psi.nasa.gov/physci/repo/data/investigations/PSI-100
                </a>
              </li>
              <li>
                NASA TechPort. Spacecraft Fire Safety Demonstration (SAFFIRE-V)
                Program.{" "}
                <a
                  href="https://techport.nasa.gov/projects/13543"
                  rel="noreferrer"
                  target="_blank"
                >
                  https://techport.nasa.gov/projects/13543
                </a>
              </li>
              <li>
                Olson, S., Ferkul, P., and collaborators. BASS-II Program
                Science and Operations Documentation.{" "}
                <a
                  href="https://ntrs.nasa.gov/api/citations/20140011099/downloads/20140011099.pdf"
                  rel="noreferrer"
                  target="_blank"
                >
                  https://ntrs.nasa.gov/api/citations/20140011099/downloads/20140011099.pdf
                </a>
              </li>
              <li>
                Olson et al. Microgravity Flame Spread in Exploration
                Atmospheres: Pressure, Oxygen and Velocity Effects on Opposed
                and Concurrent Flame Spread.{" "}
                <a
                  href="https://www.researchgate.net/publication/255013038_Microgravity_Flame_Spread_in_Exploration_Atmospheres_Pressure_Oxygen_and_Velocity_Effects_on_Opposed_and_Concurrent_Flame_Spread"
                  rel="noreferrer"
                  target="_blank"
                >
                  https://www.researchgate.net/publication/255013038_Microgravity_Flame_Spread_in_Exploration_Atmospheres_Pressure_Oxygen_and_Velocity_Effects_on_Opposed_and_Concurrent_Flame_Spread
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
