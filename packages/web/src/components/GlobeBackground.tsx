"use client";

import React, { useRef, useEffect } from "react";
import * as THREE from "three";

export default function GlobeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      1,
      2000
    );
    camera.position.z = 800;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    scene.add(globe);

    const RADIUS = 320;
    const CYAN = 0x06b6d4;

    // --- Wireframe overlay ---
    const wireGeo = new THREE.IcosahedronGeometry(RADIUS, 4);
    const wireMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    });
    globe.add(new THREE.Mesh(wireGeo, wireMat));

    // --- Dot texture: 2000 randomly distributed dots ---
    const dotPositions: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = RADIUS + 2;
      dotPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dotPositions, 3)
    );
    const dotMat = new THREE.PointsMaterial({
      color: CYAN,
      size: 2,
      transparent: true,
      opacity: 0.35,
      sizeAttenuation: true,
    });
    globe.add(new THREE.Points(dotGeo, dotMat));

    // --- Arc lines: 12 great-circle arcs ---
    const arcGroup = new THREE.Group();
    globe.add(arcGroup);

    for (let i = 0; i < 12; i++) {
      let startV: THREE.Vector3;
      let endV: THREE.Vector3;
      let angle: number;

      do {
        const sp = Math.acos(2 * Math.random() - 1);
        const st = 2 * Math.PI * Math.random();
        const ep = Math.acos(2 * Math.random() - 1);
        const et = 2 * Math.PI * Math.random();
        startV = new THREE.Vector3(
          Math.sin(sp) * Math.cos(st),
          Math.sin(sp) * Math.sin(st),
          Math.cos(sp)
        );
        endV = new THREE.Vector3(
          Math.sin(ep) * Math.cos(et),
          Math.sin(ep) * Math.sin(et),
          Math.cos(ep)
        );
        angle = startV.angleTo(endV);
      } while (angle < 0.5 || angle > 2.6);

      const startNorm = startV.clone().normalize();
      const endNorm = endV.clone().normalize();
      const sinAngle = Math.sin(angle);
      const points: THREE.Vector3[] = [];
      const segments = 64;

      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        let point: THREE.Vector3;
        if (sinAngle < 0.001) {
          point = startNorm.clone().lerp(endNorm, t);
        } else {
          const a = Math.sin((1 - t) * angle) / sinAngle;
          const b = Math.sin(t * angle) / sinAngle;
          point = startNorm
            .clone()
            .multiplyScalar(a)
            .add(endNorm.clone().multiplyScalar(b));
        }
        const elevation = RADIUS + 20 * Math.sin(t * Math.PI);
        point.normalize().multiplyScalar(elevation);
        points.push(point);
      }

      const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
      const arcMat = new THREE.LineDashedMaterial({
        color: CYAN,
        transparent: true,
        opacity: 0.5,
        dashSize: 8,
        gapSize: 8,
        scale: 1,
      });
      const arc = new THREE.Line(arcGeo, arcMat);
      arc.computeLineDistances();
      arc.userData = {
        offset: Math.random() * 100,
        speed: 0.15 + Math.random() * 0.2,
      };
      arcGroup.add(arc);
    }

    // --- Atmosphere glow ---
    const atmosGeo = new THREE.SphereGeometry(350, 32, 32);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
    });
    globe.add(new THREE.Mesh(atmosGeo, atmosMat));

    // --- Mouse parallax ---
    let mouseX = 0;
    let mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMouseMove);

    // --- Resize handler ---
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // --- Animation loop ---
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      globe.rotation.y += 0.0008;

      const targetX = mouseY * 0.087;
      const targetZ = mouseX * 0.087;
      globe.rotation.x += (targetX - globe.rotation.x) * 0.02;
      globe.rotation.z += (targetZ - globe.rotation.z) * 0.02;

      arcGroup.children.forEach((child) => {
        const arc = child as THREE.Line;
        const mat = arc.material as THREE.LineDashedMaterial & { dashOffset: number };
        arc.userData.offset += arc.userData.speed;
        mat.dashOffset = -arc.userData.offset;
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

      scene.traverse((obj) => {
        if (
          obj instanceof THREE.Mesh ||
          obj instanceof THREE.Points ||
          obj instanceof THREE.Line
        ) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
