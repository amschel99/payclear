"use client";

import React, { useEffect, useState } from "react";

const LINES = [
  { x: 20, speed: 4, delay: 0, accent: true },
  { x: 38, speed: 6, delay: 1.5, accent: false },
  { x: 52, speed: 7, delay: 0.8, accent: true },
  { x: 64, speed: 5, delay: 2.2, accent: false },
];

function StreamSide({ side }: { side: "left" | "right" }) {
  return (
    <div
      className="fixed top-0 h-screen pointer-events-none"
      style={{
        [side]: 0,
        width: 80,
        opacity: 0.4,
        zIndex: 0,
        transform: side === "right" ? "rotate(180deg)" : undefined,
        transformOrigin: side === "right" ? "center center" : undefined,
      }}
    >
      {LINES.map((line, i) => (
        <React.Fragment key={i}>
          <div
            className="absolute top-0 h-full"
            style={{
              left: line.x,
              width: 0.5,
              background: line.accent
                ? "rgba(6,182,212,0.15)"
                : "rgba(39,39,42,0.5)",
            }}
          />
          <div
            className="absolute"
            style={{
              left: line.x - 1,
              width: 3,
              height: 12,
              borderRadius: 1,
              background: line.accent
                ? "linear-gradient(to bottom, #06B6D4, transparent)"
                : "linear-gradient(to bottom, #3f3f46, transparent)",
              animation: `dataPacket ${line.speed}s linear infinite`,
              animationDelay: `${line.delay}s`,
              willChange: "transform",
            }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export default function DataStreams() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      <StreamSide side="left" />
      <StreamSide side="right" />
    </>
  );
}
