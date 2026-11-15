import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Astroflame | NASA Space Apps",
  description:
    "Explore NASA spacecraft-fire research data through the Astroflame API.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
