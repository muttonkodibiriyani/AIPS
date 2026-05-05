import type { Metadata } from "next";
import { Outfit, Fraunces } from "next/font/google";

import "./globals.css";
import { DeploymentEnvBanner } from "@/components/deployment-env-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Commerce AI | Enterprise Product Discovery",
  description:
    "Hybrid semantic commerce search with natural-language queries, multilingual catalog support, and enterprise-grade ingestion — built for modern retail catalogs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="font-sans min-h-screen flex flex-col">
        <SiteHeader />
        <DeploymentEnvBanner />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
