"use client";

import React from "react";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solanaDevnet } from "@reown/appkit/networks";

const solanaAdapter = new SolanaAdapter();

createAppKit({
  adapters: [solanaAdapter],
  networks: [solanaDevnet],
  projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "",
  metadata: {
    name: "PayClear Protocol",
    description:
      "Institutional-grade compliance layer for Solana stablecoin transfers.",
    url: "https://payclear.io",
    icons: [],
  },
  features: {
    analytics: false,
  },
});

export default function AppProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
