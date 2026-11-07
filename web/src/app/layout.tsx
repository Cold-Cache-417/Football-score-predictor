import type { Metadata } from "next";
import { Newsreader, Archivo } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-newsreader",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-archivo",
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
    <html lang="en" className={`${newsreader.variable} ${archivo.variable}`}>
      <body className="min-h-screen bg-pine-950 text-pine-100 antialiased">
        {children}
      </body>
    </html>
  );
}
