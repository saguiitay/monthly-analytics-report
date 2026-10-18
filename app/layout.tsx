import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monthly — a clearer view of your projects",
  description: "Compare your projects’ Google Analytics traffic, understand what changed, and export a useful report. Bring your own key. Keep your workspace in your browser.",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
