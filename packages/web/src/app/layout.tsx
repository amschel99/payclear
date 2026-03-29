import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/providers";
import Header from "@/components/header";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PayClear Protocol — Compliant Stablecoin Payments on Solana",
  description:
    "Institutional-grade compliance layer for Solana stablecoin transfers. KYC, KYT, Travel Rule, and on-chain attestation in one seamless flow.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body className="font-sans min-h-screen">
        <AppProviders>
          <Header />
          <main className="pt-16">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
