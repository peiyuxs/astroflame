import FlameSimulator from "@/app/components/FlameSimulator";
import SaffireTimeSeries from "@/app/components/SaffireTimeSeries";

const sections = [
  { href: "#about", label: "About" },
  { href: "#simulation", label: "Simulation" },
  { href: "#analysis", label: "Analysis" },
];

export default function Page() {
  return (
    <>
      <header className="site-header">
        <a aria-label="AstroFlame home" className="brand-link" href="#home">
          <img alt="" className="nav-wordmark" src="/nav-wordmark.png" />
        </a>
        <nav aria-label="Main navigation" className="site-nav">
          {sections.map((section) => (
            <a href={section.href} key={section.href}>
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <div className="hero-about-background">
          <section
            aria-labelledby="home-title"
            className="page-section hero"
            id="home"
          >
            <div className="hero-content">
              <h1
                aria-label="AstroFlame Study Simulator"
                className="hero-wordmark-heading"
                id="home-title"
              >
                <img
                  alt=""
                  className="hero-wordmark"
                  src="/astroflame-wordmark.png"
                />
              </h1>
            </div>
          </section>

          <section
            aria-labelledby="about-title"
            className="page-section project-section"
            id="about"
          >
            <div className="section-content">
              <h2 id="about-title">About the project</h2>
              <p className="section-lead">
                AstroFlame makes NASA spacecraft-fire research from the BASS
                experiments and SAFFIRE-III telemetry available through a
                read-only data API.
              </p>
            </div>
          </section>
        </div>

        <div aria-hidden="true" className="atmosphere-transition">
          <img
            alt=""
            className="transition-image"
            src="/simulation-transition.png"
          />
        </div>

        <section
          aria-labelledby="simulation-title"
          className="page-section simulation-section"
          id="simulation"
        >
          <FlameSimulator />
        </section>

        <div aria-hidden="true" className="analysis-transition" />

        <section
          aria-labelledby="analysis-title"
          className="page-section analysis-section"
          id="analysis"
        >
          <div className="section-content">
            <h2 id="analysis-title">Analysis</h2>
            <p className="section-lead">
              Explore BASS model estimates and available SAFFIRE-III telemetry.
              SAFFIRE readings appear here when imported into TigerData.
            </p>
            <SaffireTimeSeries />
            <p>
              <a className="text-link" href="/api/investigations">
                Investigation list
              </a>
            </p>
            <p>
              <a
                className="text-link"
                href="/api/investigations/PSI-26/experiments"
              >
                PSI-26 BASS experiments
              </a>
            </p>
            <p>
              <a
                className="text-link"
                href="/api/investigations/PSI-100/measurements"
              >
                PSI-100 SAFFIRE-III measurements
              </a>
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a href="#home">AstroFlame</a>
        <p>NASA Space Apps 2026</p>
        <a href="#home">Back to top</a>
      </footer>
    </>
  );
}
