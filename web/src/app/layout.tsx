import type { Metadata } from "next";
import { Archivo, Courier_Prime } from "next/font/google";
import "./globals.css";

/**
 * One superfamily, two optical roles — the same logic LALIGA uses with its
 * bespoke Headline/Text pair. Archivo (OFL) carries both a weight axis
 * (100-900) and a width axis (62-125), so hierarchy comes from width as well
 * as weight: expanded for scorelines and numbers, condensed for labels.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/**
 * Reading + caption face. A typewriter roman: labels, the snapshot stamp and
 * body copy read like a wire-service match report pinned beside the
 * scoreboard, instead of like default product UI.
 */
const courier = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "La Liga Predictor — Football Intelligence",
  description:
    "Dixon-Coles + CatBoost blend for La Liga: calibrated probabilities, scorelines, bookmaker benchmark.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${courier.variable}`}>
      <body className="min-h-screen bg-pine-950 text-pine-100 antialiased">{children}</body>
    </html>
  );
}
