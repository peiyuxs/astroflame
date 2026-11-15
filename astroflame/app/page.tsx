import FlameSimulator from "@/app/components/FlameSimulator";
import SaffireTimeSeries from "@/app/components/SaffireTimeSeries";

function HeroSky() {
  let seed = 2026;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const backgroundStars = Array.from({ length: 84 }, (_, index) => {
    const column = index % 14;
    const row = Math.floor(index / 14);

    return {
      x: 30 + (column + random()) * 110,
      y: 30 + (row + random()) * 140,
      radius: index % 13 === 0 ? 1.8 : 0.8 + random() * 0.8,
      opacity: 0.55 + random() * 0.45,
    };
  });
  const brightStars = [
    { x: 95, y: 500, scale: 0.8 },
    { x: 850, y: 240, scale: 0.58 },
    { x: 1520, y: 500, scale: 0.65 },
    { x: 80, y: 700, scale: 0.62 },
    { x: 1515, y: 720, scale: 0.7 },
  ];

  return (
    <svg
      aria-hidden="true"
      className="hero-sky"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1600 900"
    >
      <g className="background-stars" fill="#eaf3ff">
        {backgroundStars.map((star, index) => (
          <circle
            cx={star.x}
            cy={star.y}
            key={index}
            opacity={star.opacity}
            r={star.radius}
          />
        ))}
      </g>

      {brightStars.map((star) => (
        <g
          key={`${star.x}-${star.y}`}
          transform={`translate(${star.x} ${star.y}) rotate(12) scale(${star.scale})`}
        >
          <path
            d="M0-16 3-4 10-10 5-2 16 0 5 2 10 10 3 4 0 16-3 4-10 10-5 2-16 0-5-2-10-10-3-4z"
            fill="#fff1d2"
            opacity=".85"
          />
          <circle r="2" fill="#fff" />
        </g>
      ))}
    </svg>
  );
}

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
            <HeroSky />
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
