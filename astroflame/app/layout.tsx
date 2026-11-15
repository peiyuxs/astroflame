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
      <body>{children}</body>
    </html>
  );
}
