import FlameSimulator from "@/app/components/FlameSimulator";
import BassComparison from "@/app/components/BassComparison";
import BassReport from "@/app/components/BassReport";

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

export default function Page() {
  return (
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
            <div className="section-content about-layout">
              <h2 id="about-title">About the project</h2>
              <div className="about-copy">
                <p className="section-lead">
                  AstroFlame Study Simulator is an interactive website that
                  helps people explore how fire behaves in microgravity. It has
                  been created for the NASA Space Apps Challenge to make NASA’s
                  fire research easier to understand. Fire behaves differently
                  in space, so understanding how oxygen and airflow affect
                  flames is important for protecting astronauts. However, the
                  research can be difficult to follow when it is spread across
                  technical papers and datasets.
                </p>
                <p className="section-lead">
                  The project brings this research into a visual experience
                  that users can explore for themselves. Users can choose a
                  material, change oxygen and airflow settings, and select
                  where ignition begins. A colored map shows the estimated
                  spread of the fire, while a graph shows how the modeled flame
                  front moves over time. NASA’s research has been used to
                  inform these estimates and show the sources and assumptions
                  behind them. The website combines an interactive interface
                  with data processing to turn complex information into
                  something easier to explore. AstroFlame is designed for
                  students, researchers, and anyone curious about fire in
                  space, with estimates meant for learning rather than real
                  world safety decisions.
                </p>
              </div>
              <div className="about-images">
                <img
                  alt="Bright flame during a combustion experiment."
                  src="/about-flame.png"
                />
                <img
                  alt="Close-up of a material sample in an experimental fixture."
                  src="/about-material-sample.png"
                />
              </div>
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
          aria-label="Analysis"
          className="page-section analysis-section"
          id="analysis"
        >
          <BassComparison />
          <BassReport />
        </section>
    </main>
  );
}
