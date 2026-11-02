import { Cairo } from "next/font/google";

// Variable font: all weights (400/500/700 etc.) are real, so Arabic bold is
// not synthesized by the browser. Covers both Arabic and Latin.
export const arabicFont = Cairo({
  subsets: ["arabic", "latin"],
  display: "swap",
});