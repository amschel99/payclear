"use client";

import dynamic from "next/dynamic";
import DataStreams from "./DataStreams";
import CursorGlow from "./CursorGlow";

const ParticleGrid = dynamic(() => import("./ParticleGrid"), { ssr: false });

export default function AmbientEffects() {
  return (
    <>
      <ParticleGrid />
      <DataStreams />
      <CursorGlow />
    </>
  );
}
