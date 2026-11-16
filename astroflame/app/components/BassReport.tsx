export default function BassReport() {
  return (
    <article aria-label="Analysis and write-up" className="research-report">
      <section className="research-report-page">
        <h2>Analysis and Write-up</h2>
        <h3>Abstract</h3>
        <p>
          Our project, AstroFlame Study, was an AI-assisted educational and
          analytical tool that transforms NASA microgravity combustion data into
          an interactive fire-safety exploration tool. This project was
          developed for NASA Space Apps’ <strong>Flame in Freefall</strong>{" "}
          challenge, and aims to make the dynamics of burning materials in
          spacecraft under micro-gravity environments easier to understand.
          With our tool, users can interactively explore how environmental
          variables, such as airflow velocity, can affect the rate at which
          flame spreads; trained off of evidence from NASA investigations.
        </p>
        <p>
          This platform combines predictive modeling, visual storytelling, and
          web-based simulation: creating a bridge between raw scientific data
          and practical fire-safety understanding.
        </p>
        <h3>Problem Statement</h3>
        <p>
          Nasa’s PSI repository contains extensive combustion research data, but
          users often face 3 main challenges:
        </p>
        <ul>
          <li>Difficulty in identifying relevant data to specific fire-safety questions</li>
          <li>Difficulty in comparing investigations under different conditions</li>
          <li>Difficulty interpreting experimental outcomes without combustion expertise</li>
        </ul>
        <p>
          The hackathon challenge specifically requests tools capable of
          mitigating some, or all of these challenges.
        </p>
        <p>
          AstroFlame addresses these needs through visualization, simulation,
          and model-driven interpolation.
        </p>
      </section>

      <section className="research-report-page">
        <h3>Utilized Datasets</h3>
        <h4>BASS-II (Burning and Suppression of Solids)</h4>
        <ul>
          <li>
            Contains experiments involving polymethyl methacrylate (PMMA) fuels
            tested under varying airflow rates, oxygen concentrations, and
            material thicknesses. We utilized 39 dataset observations, collected
            across 18 experimental runs
          </li>
        </ul>
        <p>Measured data includes:</p>
        <ul>
          <li>Fuel thickness</li>
          <li>Airflow velocity</li>
          <li>Initial Oxygen Concentration</li>
          <li>Fire Spread Rate (FSR)</li>
        </ul>
        <p>Observed Ranges:</p>
        <ReportTable
          headers={["Variable", "Range"]}
          rows={[
            ["Thickness", "0.1 - 0.5 cm"],
            ["Oxygen", "17.9 - 22.2 %"],
            ["Airflow", "2 - 21 cm/s"],
          ]}
        />
        <h4>SAFFIRE-V (Spacecraft Fire Experiment)</h4>
        <ul>
          <li>
            Large scale spacecraft fire demonstrations under realistic
            spacecraft conscious
          </li>
          <li>
            Unlike BASS, Sapphire investigates large-scale environments more
            representative of operational spacecraft.
          </li>
        </ul>
        <p>Measured data includes:</p>
        <ul>
          <li>Airflow conditions</li>
          <li>Rib geometry measurements</li>
          <li>Large-scale flame spread observations</li>
          <li>Spacecraft-relevant combustion environments</li>
        </ul>
        <p>Observed Ranges:</p>
        <ReportTable
          headers={["Variable", "Range"]}
          rows={[
            ["Airflow Velocity", "5-20 cm/s"],
            ["Rib Width", "0.1-1.0 cm"],
            ["Oxygen Concentration", "26.9% (constant)"],
            ["Thickness", "1.0 cm (constant)"],
            ["Fire Spread Rate", "0.0065-0.088 cm/s"],
          ]}
        />
      </section>

      <section className="research-report-page">
        <h3>Predictive Model Development</h3>
        <p>
          Several candidate regression models were trained and developed
          utilizing grouped leave-one-out cross validation, creating models to
          predict the mechanisms behind fire spread rate in our two data-set
          cases.
        </p>
        <figure>
          <img
            alt="Grouped leave-one-ID-out BASS model comparison by equal-ID-weighted RMSE."
            loading="lazy"
            src="/research/bass_fsr_grouped_cv_model_comparison.png"
          />
        </figure>
        <figure>
          <img
            alt="Held-out BASS fire-spread predictions by experiment ID for two candidate models."
            loading="lazy"
            src="/research/bass_fsr_cross_validated_predictions.png"
          />
        </figure>
      </section>

      <section className="research-report-page">
        <h3>Results</h3>
        <p>Bass-II Fire Spread Model’s final predictive equation was:</p>
        <p className="research-equation">
          FSR=−0.004640+0.0001282⋅(thickness)
          <sup>(−1.7904)</sup>+0.0000202⋅(airflow)+0.0003471⋅(oxygen)
        </p>
        <p>Where:</p>
        <ul className="research-definitions">
          <li>FSR = Fire Spread Rate (cm/s)</li>
          <li>Thickness = PMMA thickness (cm)</li>
          <li>Airflow = velocity (cm/s)</li>
          <li>Oxygen = Oxygen Concentration (%)</li>
        </ul>
        <ReportTable
          headers={["Model", "RMSE"]}
          rows={[
            ["Thickness Only", "0.00203"],
            ["Thickness + Oxygen", "0.00208"],
            ["Thickness + Airflow", "0.00208"],
            ["Thickness + Airflow + Oxygen", "0.00211"],
          ]}
        />
        <p>SAFFIRE-V’s model was:</p>
        <p className="research-equation">
          FSR=0.05428+0.00138*(airflow)−0.17353*(rib)+0.12117*(rib)
          <sup>2</sup>
        </p>
        <p>Where:</p>
        <ul className="research-definitions">
          <li>FSR = Fire Spread Rate (cm/s)</li>
          <li>airflow = airflow velocity (cm/s)</li>
          <li>rib = rib width (cm)</li>
        </ul>
        <ReportTable
          headers={["Metric", "Value"]}
          rows={[["Validation RMSE", "0.01307 cm/s"]]}
        />
        <ReportTable
          headers={["Feature", "BASS-II", "SAFFIRE-V"]}
          rows={[
            ["Observations", "39", "18"],
            ["Scale", "Laboratory", "Spacecraft-relevant"],
            ["Thickness Variation", "Yes", "No"],
            ["Oxygen Variation", "Yes", "No"],
            ["Airflow Variation", "Yes", "Yes"],
            ["Geometry Effects", "Limited", "Significant"],
            ["Peak FSR", "~0.014 cm/s", "~0.088 cm/s"],
          ]}
        />
      </section>

      <section className="research-report-page">
        <h3>Impact and Contributions</h3>
        <p>AstroFlame contributes to aerospace fire-safety in three-ways:</p>
        <h4>Educational Accessibility</h4>
        <ul>
          <li>
            Complex datasets become accessible to undergraduate student
            engineers and researchers, through a friendly web-based interface
          </li>
        </ul>
        <h4>Data Interpretation</h4>
        <ul>
          <li>
            The platform provides context for understanding the difference
            between different experiments and scales for microgravity-flame
            experiments
          </li>
        </ul>
        <h4>Predictive Exploration</h4>
        <ul>
          <li>
            Users can investigate how the environmental factors such as oxygen
            content and material thickness can affect flame spread, without
            complex manual processing of NASA data.
          </li>
        </ul>
        <h3>Limitations and Flaws</h3>
        <ol>
          <li>This predictive model is derived from PMMA combustion experiments</li>
          <li>Predictions are only valid within observed experimental ranges</li>
          <li>SAFFIRE and BASS represent different physical scales and test configurations</li>
          <li>Limited experimental volume restrict generalization beyond tested conditions</li>
        </ol>
        <p>
          Accordingly, AstroFlame should be viewed as an educational and
          exploratory research platform, rather than a certified engineering
          tool.
        </p>
      </section>
    </article>
  );
}

function ReportTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="research-table-wrap">
      <table className="research-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={`${row[0]}-${index}`} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={`${row[0]}-${index}`}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
