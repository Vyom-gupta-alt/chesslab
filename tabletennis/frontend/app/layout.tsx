import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TT Analyzer",
  description: "Automatic rally clipping, stroke tagging and pro technique comparison for table tennis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
