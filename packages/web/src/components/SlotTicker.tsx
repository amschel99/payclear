"use client";

import React, { useState, useEffect, useMemo } from "react";

export default function SlotTicker() {
  const [slot, setSlot] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com";

    fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.result) setSlot(data.result);
      })
      .catch(() => {});

    const interval = setInterval(() => {
      setSlot((s) => (s !== null ? s + 1 : s));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  const chars = useMemo(() => {
    if (slot === null) return [];
    const digits = slot.toString().split("");
    const result: { char: string; key: string; isSep: boolean }[] = [];
    for (let i = 0; i < digits.length; i++) {
      const fromRight = digits.length - 1 - i;
      result.push({
        char: digits[i],
        key: `d${i}-${digits[i]}`,
        isSep: false,
      });
      if (fromRight > 0 && fromRight % 3 === 0) {
        result.push({ char: " ", key: `sep-${i}`, isSep: true });
      }
    }
    return result;
  }, [slot]);

  if (slot === null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em]">
          Solana Slot
        </span>
        <div className="flex gap-px">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-[0.65em] h-5 rounded skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em]">
        Solana Slot
      </span>
      <div className="flex items-center font-mono tabular-nums">
        {chars.map((c) =>
          c.isSep ? (
            <span key={c.key} className="w-1.5" />
          ) : (
            <span
              key={c.key}
              className="inline-block w-[0.65em] text-center text-base font-bold text-cyan-400 animate-slot-flip"
              style={{ willChange: "transform" }}
            >
              {c.char}
            </span>
          )
        )}
      </div>
    </div>
  );
}
