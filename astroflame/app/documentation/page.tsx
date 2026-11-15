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
        </div>
      </section>
    </main>
  );
}
