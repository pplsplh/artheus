import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./quest.css";

const pixel = localFont({
  src: "./fonts/dotgothic16-latin-400-normal.woff2",
  variable: "--nf-pixel",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

const body = localFont({
  src: [
    { path: "./fonts/chakra-petch-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/chakra-petch-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/chakra-petch-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--nf-body",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = { title: "Quest Log — Artheus" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060912",
};

export default function QuestLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${pixel.variable} ${body.variable} quest-root`}>{children}</div>;
}
