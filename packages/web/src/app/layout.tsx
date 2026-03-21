import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/providers";
import Header from "@/components/header";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "PayClear Protocol — Compliant Stablecoin Payments on Solana",
  description:
    "Institutional-grade compliance layer for Solana stablecoin transfers. KYC, KYT, Travel Rule, and on-chain attestation in one seamless flow.",
  keywords: [
    "Solana",
    "USDC",
    "compliance",
    "KYC",
    "KYT",
    "Travel Rule",
    "stablecoin",
    "payments",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans min-h-screen">
        <AppProviders>
          <Header />
          <main>{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
