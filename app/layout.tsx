import type { Metadata } from "next";
import { Archivo } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/components/theme-toggle/theme";

import "./globals.css";

/* Archivo is a variable font, so the 400–800 range DESIGN.md asks for is covered. */
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Portal de Innovación Lima Expresa",
  description: "Portal de innovación de Lima Expresa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      {/*
        The theme script must run before paint but after <body> exists, because
        DESIGN.md keys the dark palette on `body[data-lx-dark="1"]`. As the first
        child of <body> it is blocking and still precedes any rendered content.
      */}
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
