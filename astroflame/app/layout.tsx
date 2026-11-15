import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AstroFlame",
  description:
    "NASA Space Apps 2026 @ NYC Hackathon Entry.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a aria-label="AstroFlame home" className="brand-link" href="/#home">
            <img alt="" className="nav-wordmark" src="/nav-wordmark.png" />
          </a>
          <nav aria-label="Main navigation" className="site-nav">
            <a href="/#about">About</a>
            <a href="/#simulation">Simulation</a>
            <a href="/#analysis">Analysis</a>
            <a href="/documentation">Documentation</a>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <a href="/#home">AstroFlame</a>
          <p>NASA Space Apps 2026</p>
          <a href="/documentation">Documentation</a>
          <a href="/#home">Back to top</a>
        </footer>
      </body>
    </html>
  );
}
