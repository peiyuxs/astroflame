import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | AstroFlame",
  description: "A placeholder for AstroFlame project documentation.",
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
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer
            nec odio. Praesent libero. Sed cursus ante dapibus diam. Sed nisi.
            Nulla quis sem at nibh elementum imperdiet.
          </p>
          <p>
            Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue
            semper porta. Mauris massa. Vestibulum lacinia arcu eget nulla.
            Class aptent taciti sociosqu ad litora torquent per conubia nostra.
          </p>
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
        </div>
      </section>
    </main>
  );
}
