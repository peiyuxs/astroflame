import FlameSimulator from "@/app/components/FlameSimulator";
import SaffireTimeSeries from "@/app/components/SaffireTimeSeries";

type RingedPlanetProps = {
  id: string;
  x: number;
  y: number;
  scale: number;
  colors: {
    highlight: string;
    shadow: string;
    surface: string;
    ring: string;
    ringLight: string;
  };
};

function RingedPlanet({ id, x, y, scale, colors }: RingedPlanetProps) {
  return (
    <g className="ringed-planet" transform={`translate(${x} ${y}) scale(${scale})`}>
      <defs>
        <radialGradient id={`${id}-shading`} cx="34%" cy="28%" r="74%">
          <stop offset="0%" stopColor={colors.highlight} />
          <stop offset="100%" stopColor={colors.shadow} />
        </radialGradient>
        <clipPath id={`${id}-disc`} clipPathUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r="17" />
        </clipPath>
      </defs>
      <ellipse
        cx="0"
        cy="4"
        rx="32"
        ry="9"
        fill="none"
        stroke={colors.ring}
        strokeOpacity=".65"
        strokeWidth="2"
        transform="rotate(-18)"
      />
      <circle cx="0" cy="0" r="17" fill={`url(#${id}-shading)`} />
      <g clipPath={`url(#${id}-disc)`}>
        <path
          d="M-18 1Q0-5 18 2v5Q0 1-18 7z"
          fill={colors.surface}
          opacity=".55"
        />
      </g>
      <path
        d="M-31 0C-22 19 22 19 31 0"
        fill="none"
        stroke={colors.ringLight}
        strokeWidth="3"
        transform="rotate(-18)"
      />
      <path
        d="M-28 1C-18 15 18 15 28 1"
        fill="none"
        stroke={colors.ring}
        strokeOpacity=".8"
        strokeWidth="1"
        transform="rotate(-18)"
      />
    </g>
  );
}

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

      <g transform="translate(95 500) rotate(12) scale(.8)">
        <path
          d="M0-16 3-4 10-10 5-2 16 0 5 2 10 10 3 4 0 16-3 4-10 10-5 2-16 0-5-2-10-10-3-4z"
          fill="#fff1d2"
          opacity=".85"
        />
        <circle r="2" fill="#fff" />
      </g>

      <g transform="translate(100 680) rotate(-18) scale(.85)">
        <path
          d="M-20-4-14-16-2-19 8-14 18-7 17 5 7 15-7 18-17 9z"
          fill="#737b87"
          stroke="#bac2ce"
          strokeWidth="1.5"
        />
        <path d="m-15-5 7-7 8-2 4 6-5 6-12 3z" fill="#939aa4" opacity=".7" />
        <ellipse cx="9" cy="-2" rx="4" ry="3" fill="#525a66" opacity=".75" />
        <circle cx="2" cy="9" r="2.5" fill="#59616d" opacity=".8" />
        <path d="m-8 13 11 3 10-6" fill="none" stroke="#a5adb8" strokeWidth="1.3" />
      </g>

      <g transform="translate(1480 820)">
        <circle r="22" fill="#d6dbe2" />
        <path
          d="M-11-6a5 5 0 1 0 10 0 5 5 0 1 0-10 0M5-12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M4 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M-14 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0"
          fill="#aeb6c1"
          opacity=".72"
        />
        <path d="M-17-12a22 22 0 0 1 29-5" fill="none" stroke="#f4f6f9" strokeWidth="1.5" opacity=".75" />
      </g>

      <g transform="translate(1510 505) rotate(-22) scale(.36)">
        <rect
          x="-126"
          y="-20"
          width="83"
          height="40"
          fill="#162e52"
          stroke="#9bb6d7"
          strokeWidth="2"
        />
        <path d="M-105-20v40M-84-20v40M-63-20v40M-126 0h83" stroke="#7392ba" />
        <rect
          x="43"
          y="-20"
          width="83"
          height="40"
          fill="#162e52"
          stroke="#9bb6d7"
          strokeWidth="2"
        />
        <path d="M64-20v40M85-20v40M106-20v40M43 0h83" stroke="#7392ba" />
        <path
          d="M-40-26h80l16 14v24L40 26h-80l-16-14v-24z"
          fill="#cbd3dc"
          stroke="#f1d8a8"
          strokeWidth="3"
        />
        <rect x="-13" y="-18" width="28" height="36" rx="4" fill="#8999ad" />
        <path d="M0-26v-31l13-14M-5-57h20" fill="none" stroke="#d6dfeb" strokeWidth="4" />
        <circle cx="0" cy="-26" r="5" fill="#f3d9a8" />
      </g>

      <RingedPlanet
        id="saturn"
        x={120}
        y={240}
        scale={1}
        colors={{
          highlight: "#fff0c9",
          shadow: "#a86e3d",
          surface: "#c48b51",
          ring: "#bccbe2",
          ringLight: "#f3d7a3",
        }}
      />
      <RingedPlanet
        id="ringed-planet-blue"
        x={1340}
        y={390}
        scale={0.78}
        colors={{
          highlight: "#e1efff",
          shadow: "#49658c",
          surface: "#7294b9",
          ring: "#95abc7",
          ringLight: "#dce9fa",
        }}
      />
      <RingedPlanet
        id="ringed-planet-rose"
        x={960}
        y={350}
        scale={0.88}
        colors={{
          highlight: "#f8ddbf",
          shadow: "#875055",
          surface: "#b87669",
          ring: "#bf9a9c",
          ringLight: "#f0d2c2",
        }}
      />
      <g transform="translate(1060 332) rotate(35) scale(.55)">
        <path d="M-2-53V-70h4v17M-8-53l8-10 8 10M-6-51H6l-2 7H-4z" fill="#d9e0e8" stroke="#f7f8fb" strokeWidth="1.5" />
        <path d="M-7-44 0-49 7-44 8-31H-8z" fill="#d8dfe8" stroke="#f4f6fa" strokeWidth="1.5" />
        <circle cx="0" cy="-39" r="2.2" fill="#22364f" />
        <path d="M-8-31H8v7H-8z" fill="#9eaab8" stroke="#e4e9ef" strokeWidth="1" />
        <path d="M-9-24H9V-5H-9z" fill="#f3f4f2" stroke="#c4cbd3" strokeWidth="1" />
        <path d="M-9-20h18M-9-8h18" stroke="#303b48" strokeWidth="2" />
        <path d="M-10-5H10v4H-10z" fill="#252f3c" />
        <path d="M-10-1H10v24H-10z" fill="#f3f4f2" stroke="#c4cbd3" strokeWidth="1" />
        <path d="M-10 4h20M-10 19h20" stroke="#303b48" strokeWidth="2" />
        <path d="M-11 23H11v4H-11z" fill="#252f3c" />
        <path d="M-11 27H11v27H-11z" fill="#f3f4f2" stroke="#c4cbd3" strokeWidth="1" />
        <path d="M-11 32h22M-11 48h22" stroke="#303b48" strokeWidth="2" />
        <path d="M-9 54  -6 67H-2L0 59 2 67h4l3-13" fill="#4a4b4c" stroke="#c7cdd4" strokeWidth="1.5" />
        <path d="M-7 67Q0 78 7 67Q0 72-7 67z" fill="#ffb365" />
      </g>
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
