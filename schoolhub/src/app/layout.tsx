import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SIPlat — School Interoperability Platform",
  description: "SIPlat connects the school systems you already use into one secure place for parents and staff.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
