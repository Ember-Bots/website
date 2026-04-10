import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ember Bots | Enterprise AI Automation",
  description: "Enterprise-grade workflow systems for service-based businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0A0A0A] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
