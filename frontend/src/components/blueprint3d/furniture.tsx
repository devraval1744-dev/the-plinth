/**
 * Procedural furniture & fixtures for the premium 3D view.
 *
 * Convention: every item's origin is the BACK-CENTRE of its footprint on the
 * floor; the item extends towards local +z (its front) for `d` metres and is
 * `w` wide along local x.
 */
import { memo, type ReactElement } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { Placed } from './layout';

// ─── shared materials ────────────────────────────────────────────────────────

const std = (color: string, roughness = 0.7, metalness = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export const M = {
  oak:       std('#c9a77c', 0.55),
  walnut:    std('#6a4a35', 0.5),
  white:     std('#f3f0ea', 0.55),
  offwhite:  std('#e9e3d7', 0.8),
  cream:     std('#e6dccb', 0.9),
  linen:     std('#d9cfbf', 0.95),
  navy:      std('#33415c', 0.9),
  slate:     std('#5b6b7f', 0.9),
  sage:      std('#8fa68e', 0.9),
  terracotta:std('#b97a5a', 0.9),
  charcoal:  std('#2a2c32', 0.5, 0.2),
  black:     std('#14151a', 0.35, 0.3),
  steel:     std('#c3c8cf', 0.3, 0.85),
  brass:     std('#c9a14a', 0.3, 0.9),
  ceramic:   std('#fbfbfa', 0.18),
  granite:   std('#3c3f46', 0.35, 0.1),
  marble:    std('#e7e4de', 0.25),
  leaf:      std('#4f7a4a', 0.8),
  leaf2:     std('#6a9a5b', 0.8),
  soil:      std('#3b2f27', 1),
  pot:       std('#d8d2c8', 0.8),
  glass:     new THREE.MeshPhysicalMaterial({
    color: '#cfe8f5', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28,
    transmission: 0, side: THREE.DoubleSide,
  }),
  mirror:    std('#d9e6ee', 0.04, 0.95),
  lampShade: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe2a0', emissiveIntensity: 0.55, roughness: 0.9 }),
  screen:    std('#0b0d12', 0.15, 0.5),
};

// ─── primitives ──────────────────────────────────────────────────────────────

type V3 = [number, number, number];

/** Box whose bottom-centre sits at `pos`. */
function Box({ pos, size, m, rot }: { pos: V3; size: V3; m: THREE.Material; rot?: V3 }) {
  return (
    <mesh position={[pos[0], pos[1] + size[1] / 2, pos[2]]} rotation={rot} material={m} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Soft({ pos, size, m, r = 0.04, rot }: { pos: V3; size: V3; m: THREE.Material; r?: number; rot?: V3 }) {
  return (
    <RoundedBox
      args={size}
      radius={Math.min(r, Math.min(...size) / 2 - 0.001)}
      smoothness={3}
      position={[pos[0], pos[1] + size[1] / 2, pos[2]]}
      rotation={rot}
      material={m}
      castShadow
      receiveShadow
    />
  );
}

function Cyl({ pos, r, h, m, seg = 24, r2 }: { pos: V3; r: number; h: number; m: THREE.Material; seg?: number; r2?: number }) {
  return (
    <mesh position={[pos[0], pos[1] + h / 2, pos[2]]} material={m} castShadow receiveShadow>
      <cylinderGeometry args={[r2 ?? r, r, h, seg]} />
    </mesh>
  );
}

// ─── bedroom ─────────────────────────────────────────────────────────────────

function Bed({ w, d }: { w: number; d: number }) {
  const mw = w - 0.08;
  return (
    <group>
      {/* frame + legs */}
      <Box pos={[0, 0.08, d / 2]} size={[w, 0.22, d - 0.04]} m={M.walnut} />
      {/* headboard */}
      <Soft pos={[0, 0.1, 0.05]} size={[w + 0.12, 1.05, 0.1]} m={M.slate} r={0.04} />
      <Box pos={[0, 0.0, 0.05]} size={[w + 0.12, 0.1, 0.1]} m={M.walnut} />
      {/* mattress */}
      <Soft pos={[0, 0.3, d / 2 + 0.04]} size={[mw, 0.24, d - 0.16]} m={M.white} r={0.07} />
      {/* duvet */}
      <Soft pos={[0, 0.5, d * 0.62]} size={[mw + 0.03, 0.07, d * 0.62]} m={M.navy} r={0.03} />
      <Soft pos={[0, 0.55, d * 0.4]} size={[mw + 0.04, 0.05, 0.34]} m={M.cream} r={0.02} />
      {/* pillows */}
      {(w > 1.5 ? [-1, 1] : [0]).map((k, i) => (
        <Soft key={i} pos={[k * mw * 0.26, 0.54, 0.38]} size={[w > 1.5 ? mw * 0.44 : mw * 0.7, 0.14, 0.42]} m={i ? M.cream : M.linen} r={0.06} rot={[-0.18, 0, 0]} />
      ))}
      <Soft pos={[0, 0.54, 0.62]} size={[mw * 0.4, 0.11, 0.26]} m={M.terracotta} r={0.05} rot={[-0.1, 0, 0]} />
    </group>
  );
}

function Nightstand() {
  return (
    <group>
      <Box pos={[0, 0.06, 0.19]} size={[0.42, 0.4, 0.36]} m={M.walnut} />
      <Box pos={[0, 0.0, 0.07]} size={[0.38, 0.06, 0.1]} m={M.charcoal} />
      <Box pos={[0, 0.3, 0.375]} size={[0.3, 0.012, 0.012]} m={M.brass} />
      <Cyl pos={[0, 0.46, 0.19]} r={0.05} h={0.03} m={M.brass} />
      <Cyl pos={[0, 0.49, 0.19]} r={0.01} h={0.18} m={M.brass} />
      <Cyl pos={[0, 0.64, 0.19]} r={0.11} r2={0.07} h={0.15} m={M.lampShade} />
    </group>
  );
}

function Wardrobe({ w, d, h }: { w: number; d: number; h: number }) {
  const doors = Math.max(2, Math.round(w / 0.6));
  const dw = w / doors;
  return (
    <group>
      <Box pos={[0, 0, d / 2]} size={[w, h, d - 0.02]} m={M.offwhite} />
      <Box pos={[0, 0, 0.0]} size={[w, 0.08, 0.04]} m={M.charcoal} />
      {Array.from({ length: doors }).map((_, i) => {
        const x = -w / 2 + dw * (i + 0.5);
        return (
          <group key={i}>
            <Box pos={[x, 0.09, d - 0.006]} size={[dw - 0.016, h - 0.14, 0.022]} m={i % 2 ? M.oak : M.cream} />
            <Box pos={[x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), 0.95, d + 0.014]} size={[0.014, 0.3, 0.014]} m={M.brass} />
          </group>
        );
      })}
    </group>
  );
}

function Desk({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box pos={[0, 0.72, d / 2]} size={[w, 0.035, d]} m={M.oak} />
      {[-1, 1].map((k) => <Box key={k} pos={[k * (w / 2 - 0.03), 0, d - 0.04]} size={[0.04, 0.72, 0.04]} m={M.charcoal} />)}
      {[-1, 1].map((k) => <Box key={k} pos={[k * (w / 2 - 0.03), 0, 0.04]} size={[0.04, 0.72, 0.04]} m={M.charcoal} />)}
      {/* laptop */}
      <Box pos={[0, 0.755, d * 0.55]} size={[0.32, 0.012, 0.22]} m={M.steel} />
      <Box pos={[0, 0.76, d * 0.4]} size={[0.32, 0.22, 0.01]} m={M.charcoal} rot={[-0.2, 0, 0]} />
      {/* chair */}
      <Cyl pos={[0.05, 0.44, d + 0.35]} r={0.22} h={0.06} m={M.slate} />
      <Cyl pos={[0.05, 0, d + 0.35]} r={0.03} h={0.44} m={M.black} />
      <Soft pos={[0.05, 0.5, d + 0.55]} size={[0.42, 0.45, 0.06]} m={M.slate} r={0.03} />
    </group>
  );
}

// ─── living / dining ─────────────────────────────────────────────────────────

function Sofa({ w, d }: { w: number; d: number }) {
  const arm = 0.18;
  const seatW = w - arm * 2;
  const n = w > 1.9 ? 3 : 2;
  return (
    <group>
      <Box pos={[0, 0.0, d / 2]} size={[w - 0.1, 0.12, d - 0.1]} m={M.charcoal} />
      <Soft pos={[0, 0.12, 0.17]} size={[w, 0.7, 0.3]} m={M.slate} r={0.08} />
      <Soft pos={[-w / 2 + arm / 2, 0.12, d / 2]} size={[arm, 0.5, d]} m={M.slate} r={0.07} />
      <Soft pos={[w / 2 - arm / 2, 0.12, d / 2]} size={[arm, 0.5, d]} m={M.slate} r={0.07} />
      {Array.from({ length: n }).map((_, i) => (
        <Soft key={i} pos={[-seatW / 2 + (seatW / n) * (i + 0.5), 0.2, 0.3 + (d - 0.3) / 2]} size={[seatW / n - 0.02, 0.2, d - 0.34]} m={M.slate} r={0.06} />
      ))}
      {Array.from({ length: n }).map((_, i) => (
        <Soft key={i} pos={[-seatW / 2 + (seatW / n) * (i + 0.5), 0.4, 0.3]} size={[seatW / n - 0.06, 0.4, 0.14]} m={M.navy} r={0.06} rot={[-0.22, 0, 0]} />
      ))}
      <Soft pos={[-w / 2 + arm + 0.2, 0.42, 0.44]} size={[0.38, 0.38, 0.1]} m={M.terracotta} r={0.05} rot={[-0.3, 0.3, 0.1]} />
      <Soft pos={[w / 2 - arm - 0.2, 0.42, 0.44]} size={[0.38, 0.38, 0.1]} m={M.sage} r={0.05} rot={[-0.3, -0.3, -0.1]} />
    </group>
  );
}

function Armchair({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Soft pos={[0, 0.08, 0.17]} size={[w, 0.72, 0.3]} m={M.terracotta} r={0.1} />
      <Soft pos={[0, 0.08, d / 2 + 0.05]} size={[w, 0.34, d - 0.1]} m={M.terracotta} r={0.08} />
      <Soft pos={[0, 0.3, d / 2 + 0.12]} size={[w - 0.3, 0.14, d - 0.34]} m={M.cream} r={0.06} />
      {[-1, 1].map((k) => <Cyl key={k} pos={[k * (w / 2 - 0.1), 0, d - 0.1]} r={0.02} h={0.1} m={M.brass} />)}
      {[-1, 1].map((k) => <Cyl key={k} pos={[k * (w / 2 - 0.1), 0, 0.1]} r={0.02} h={0.1} m={M.brass} />)}
    </group>
  );
}

function CoffeeTable({ w, d }: { w: number; d: number }) {
  return (
    <group position={[0, 0, d / 2]}>
      <Soft pos={[0, 0.36, 0]} size={[w, 0.04, d]} m={M.marble} r={0.015} />
      <Box pos={[0, 0.34, 0]} size={[w - 0.08, 0.02, d - 0.08]} m={M.brass} />
      {[-1, 1].map((a) => [-1, 1].map((b) => (
        <Cyl key={`${a}${b}`} pos={[a * (w / 2 - 0.07), 0, b * (d / 2 - 0.07)]} r={0.014} h={0.34} m={M.brass} seg={10} />
      )))}
      <Cyl pos={[-0.18, 0.4, 0]} r={0.09} h={0.1} m={M.ceramic} />
      <Cyl pos={[-0.18, 0.5, 0]} r={0.015} h={0.2} m={M.leaf} seg={8} />
      <Soft pos={[0.2, 0.4, 0.02]} size={[0.26, 0.03, 0.18]} m={M.terracotta} r={0.01} rot={[0, 0.3, 0]} />
    </group>
  );
}

function SideTable() {
  return (
    <group>
      <Cyl pos={[0, 0.0, 0.225]} r={0.2} h={0.46} m={M.walnut} />
      <Cyl pos={[0, 0.46, 0.225]} r={0.22} h={0.03} m={M.oak} />
      <Cyl pos={[0, 0.49, 0.225]} r={0.06} h={0.14} m={M.ceramic} />
    </group>
  );
}

function FloorLamp() {
  return (
    <group position={[0, 0, 0.17]}>
      <Cyl pos={[0, 0, 0]} r={0.13} h={0.02} m={M.charcoal} />
      <Cyl pos={[0, 0.02, 0]} r={0.012} h={1.45} m={M.brass} seg={8} />
      <Cyl pos={[0, 1.38, 0]} r={0.2} r2={0.12} h={0.26} m={M.lampShade} />
    </group>
  );
}

function TVUnit({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box pos={[0, 0.1, d / 2]} size={[w, 0.4, d]} m={M.walnut} />
      <Box pos={[0, 0.0, d / 2]} size={[w - 0.1, 0.1, d - 0.08]} m={M.charcoal} />
      {[-0.25, 0.25].map((x) => <Box key={x} pos={[x * w, 0.18, d + 0.004]} size={[w * 0.46, 0.22, 0.01]} m={M.oak} />)}
      {/* TV */}
      <Box pos={[0, 0.9, 0.05]} size={[1.25, 0.72, 0.04]} m={M.screen} />
      <Box pos={[0, 0.5, 0.05]} size={[0.5, 0.01, 0.12]} m={M.black} />
    </group>
  );
}

function Sideboard({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box pos={[0, 0.12, d / 2]} size={[w, 0.7, d]} m={M.walnut} />
      <Box pos={[0, 0, d / 2]} size={[w - 0.1, 0.12, d - 0.06]} m={M.charcoal} />
      {[-1, 0, 1].map((k) => <Box key={k} pos={[k * (w / 3), 0.62, d + 0.006]} size={[0.012, 0.2, 0.012]} m={M.brass} />)}
      <Cyl pos={[-0.35, 0.82, d / 2]} r={0.07} h={0.2} m={M.ceramic} />
      <Cyl pos={[-0.35, 1.02, d / 2]} r={0.012} h={0.25} m={M.leaf} seg={8} />
    </group>
  );
}

function Chair({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <Soft pos={[0, 0.44, 0]} size={[0.42, 0.05, 0.42]} m={M.slate} r={0.02} />
      <Soft pos={[0, 0.5, -0.2]} size={[0.4, 0.44, 0.04]} m={M.slate} r={0.02} />
      {[-1, 1].map((a) => [-1, 1].map((b) => (
        <Box key={`${a}${b}`} pos={[a * 0.18, 0, b * 0.18]} size={[0.03, 0.44, 0.03]} m={M.oak} />
      )))}
    </group>
  );
}

function DiningTable({ w, d, variant = 4 }: { w: number; d: number; variant?: number }) {
  const n = Math.max(4, Math.min(8, variant * 2));
  const per = n / 2;
  return (
    <group position={[0, 0, d / 2]}>
      <Soft pos={[0, 0.73, 0]} size={[w, 0.04, d]} m={M.oak} r={0.015} />
      {[-1, 1].map((a) => [-1, 1].map((b) => (
        <Box key={`${a}${b}`} pos={[a * (w / 2 - 0.08), 0, b * (d / 2 - 0.08)]} size={[0.06, 0.73, 0.06]} m={M.walnut} />
      )))}
      {Array.from({ length: per }).map((_, i) => {
        const x = -w / 2 + (w / per) * (i + 0.5);
        return (
          <group key={i}>
            <Chair x={x} z={-d / 2 - 0.2} rot={0} />
            <Chair x={x} z={d / 2 + 0.2} rot={Math.PI} />
          </group>
        );
      })}
      <Cyl pos={[0, 0.77, 0]} r={0.08} h={0.14} m={M.ceramic} />
      <Cyl pos={[0, 0.91, 0]} r={0.02} h={0.15} m={M.leaf2} seg={8} />
    </group>
  );
}

// ─── kitchen ─────────────────────────────────────────────────────────────────

function KitchenRun({ w, d, variant = 0 }: { w: number; d: number; variant?: number }) {
  const unit = 0.6;
  const n = Math.max(2, Math.round(w / unit));
  const uw = w / n;
  const sinkAt = Math.floor(n / 2);
  const hobAt = variant === 0 ? Math.max(0, sinkAt - 2) : n - 1;
  return (
    <group>
      {/* plinth */}
      <Box pos={[0, 0, d / 2 - 0.03]} size={[w, 0.1, d - 0.08]} m={M.charcoal} />
      {Array.from({ length: n }).map((_, i) => {
        const x = -w / 2 + uw * (i + 0.5);
        return (
          <group key={i}>
            <Box pos={[x, 0.1, d / 2]} size={[uw - 0.01, 0.74, d - 0.02]} m={variant ? M.sage : M.navy} />
            <Box pos={[x, 0.72, d + 0.002]} size={[0.2, 0.012, 0.012]} m={M.brass} />
          </group>
        );
      })}
      {/* worktop */}
      <Box pos={[0, 0.84, d / 2 + 0.015]} size={[w + 0.01, 0.04, d + 0.03]} m={M.granite} />
      {/* sink */}
      {variant === 0 && (
        <group position={[-w / 2 + uw * (sinkAt + 0.5), 0.88, d / 2 + 0.02]}>
          <Box pos={[0, 0, 0]} size={[uw * 0.75, 0.004, d * 0.62]} m={M.steel} />
          <Cyl pos={[0, 0, -d * 0.28]} r={0.012} h={0.26} m={M.steel} seg={8} />
          <Box pos={[0, 0.24, -d * 0.2]} size={[0.012, 0.012, 0.16]} m={M.steel} />
        </group>
      )}
      {/* hob */}
      <group position={[-w / 2 + uw * (hobAt + 0.5), 0.88, d / 2 + 0.02]}>
        <Box pos={[0, 0, 0]} size={[uw * 0.9, 0.008, d * 0.78]} m={M.black} />
        {[[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.12], [0.12, 0.12]].map(([a, b], i) => (
          <Cyl key={i} pos={[a, 0.008, b]} r={i % 2 ? 0.07 : 0.055} h={0.004} m={M.charcoal} />
        ))}
      </group>
      {/* wall cabinets */}
      {w > 1.5 && Array.from({ length: n }).map((_, i) => {
        const x = -w / 2 + uw * (i + 0.5);
        return (
          <group key={`u${i}`}>
            <Box pos={[x, 1.5, 0.19]} size={[uw - 0.01, 0.7, 0.34]} m={M.offwhite} />
            <Box pos={[x, 1.5, 0.362]} size={[uw - 0.04, 0.66, 0.012]} m={variant ? M.cream : M.white} />
            <Box pos={[x, 1.52, 0.372]} size={[0.012, 0.18, 0.012]} m={M.brass} />
          </group>
        );
      })}
      {/* backsplash */}
      <Box pos={[0, 0.88, 0.012]} size={[w, 0.5, 0.012]} m={M.marble} />
    </group>
  );
}

function Fridge({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <group>
      <Soft pos={[0, 0.0, d / 2]} size={[w - 0.02, h, d - 0.02]} m={M.steel} r={0.03} />
      <Box pos={[0, h * 0.62, d]} size={[w - 0.02, 0.01, 0.01]} m={M.charcoal} />
      <Box pos={[-w / 2 + 0.1, h * 0.7, d + 0.02]} size={[0.02, 0.32, 0.03]} m={M.charcoal} />
      <Box pos={[-w / 2 + 0.1, h * 0.35, d + 0.02]} size={[0.02, 0.4, 0.03]} m={M.charcoal} />
    </group>
  );
}

// ─── bathroom / utility ──────────────────────────────────────────────────────

function Toilet({ d }: { d: number }) {
  return (
    <group>
      <Soft pos={[0, 0.0, 0.1]} size={[0.38, 0.78, 0.2]} m={M.ceramic} r={0.04} />
      <mesh position={[0, 0.2, d * 0.55]} scale={[0.19, 0.2, 0.3]} material={M.ceramic} castShadow receiveShadow>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <Cyl pos={[0, 0.0, d * 0.5]} r={0.1} r2={0.13} h={0.2} m={M.ceramic} />
      <Cyl pos={[0.12, 0.78, 0.1]} r={0.025} h={0.02} m={M.steel} />
    </group>
  );
}

function Vanity({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box pos={[0, 0.1, d / 2]} size={[w, 0.65, d]} m={M.walnut} />
      <Box pos={[0, 0, d / 2]} size={[w - 0.08, 0.1, d - 0.06]} m={M.charcoal} />
      <Box pos={[0, 0.75, d / 2 + 0.01]} size={[w + 0.02, 0.04, d + 0.02]} m={M.marble} />
      <mesh position={[0, 0.8, d / 2 + 0.03]} scale={[0.19, 0.06, 0.15]} material={M.ceramic} castShadow>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      <Cyl pos={[0, 0.79, 0.1]} r={0.012} h={0.14} m={M.brass} seg={8} />
      <Box pos={[0, 0.93, 0.1]} size={[0.012, 0.012, 0.09]} m={M.brass} />
    </group>
  );
}

function Mirror({ w }: { w: number }) {
  return (
    <group>
      <Box pos={[0, 1.15, 0.01]} size={[w + 0.04, 0.78, 0.02]} m={M.brass} />
      <Box pos={[0, 1.17, 0.024]} size={[w, 0.74, 0.006]} m={M.mirror} />
    </group>
  );
}

function Shower({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Box pos={[0, 0, d / 2]} size={[w, 0.05, d]} m={M.marble} />
      {/* glass screens on the two open sides (front and one side) */}
      <mesh position={[0, 1.05, d - 0.01]} material={M.glass}>
        <boxGeometry args={[w, 2.0, 0.012]} />
      </mesh>
      <mesh position={[w / 2 - 0.01, 1.05, d / 2]} material={M.glass}>
        <boxGeometry args={[0.012, 2.0, d]} />
      </mesh>
      <Box pos={[0, 2.0, d - 0.01]} size={[w, 0.02, 0.02]} m={M.steel} />
      <Box pos={[w / 2 - 0.01, 2.0, d / 2]} size={[0.02, 0.02, d]} m={M.steel} />
      {/* rain head */}
      <Cyl pos={[0, 1.25, 0.04]} r={0.012} h={0.9} m={M.steel} seg={8} />
      <Cyl pos={[0, 2.12, 0.18]} r={0.11} h={0.015} m={M.steel} />
      <Box pos={[0, 2.12, 0.1]} size={[0.012, 0.012, 0.1]} m={M.steel} />
    </group>
  );
}

function Washer({ w, d }: { w: number; d: number }) {
  return (
    <group>
      <Soft pos={[0, 0, d / 2]} size={[w - 0.02, 0.85, d - 0.02]} m={M.white} r={0.02} />
      <mesh position={[0, 0.42, d]} rotation={[Math.PI / 2, 0, 0]} material={M.glass}>
        <cylinderGeometry args={[0.2, 0.2, 0.02, 28]} />
      </mesh>
      <mesh position={[0, 0.42, d - 0.005]} rotation={[Math.PI / 2, 0, 0]} material={M.steel}>
        <torusGeometry args={[0.2, 0.015, 8, 28]} />
      </mesh>
      <Box pos={[0, 0.75, d + 0.002]} size={[w * 0.6, 0.05, 0.004]} m={M.charcoal} />
    </group>
  );
}

function Shelf({ w, d }: { w: number; d: number }) {
  return (
    <group>
      {[-1, 1].map((k) => <Box key={k} pos={[k * (w / 2 - 0.015), 0, d / 2]} size={[0.03, 1.8, d]} m={M.charcoal} />)}
      {[0.02, 0.5, 0.95, 1.4, 1.78].map((y) => <Box key={y} pos={[0, y, d / 2]} size={[w, 0.03, d]} m={M.oak} />)}
      {[0.53, 0.98].map((y, i) => (
        <group key={y}>
          <Soft pos={[-0.2, y, d / 2]} size={[0.24, 0.22, 0.24]} m={i ? M.sage : M.terracotta} r={0.02} />
          <Soft pos={[0.15, y, d / 2]} size={[0.28, 0.18, 0.22]} m={M.linen} r={0.02} />
        </group>
      ))}
    </group>
  );
}

// ─── decor ───────────────────────────────────────────────────────────────────

function Plant({ w, h, variant = 0 }: { w: number; h: number; variant?: number }) {
  const r = Math.min(w / 2, 0.22);
  const leaves = variant === 1 ? 7 : 5;
  return (
    <group position={[0, 0, w / 2]}>
      <Cyl pos={[0, 0, 0]} r={r * 0.9} r2={r} h={r * 1.4} m={M.pot} />
      <Cyl pos={[0, r * 1.38, 0]} r={r * 0.86} h={0.02} m={M.soil} />
      {Array.from({ length: leaves }).map((_, i) => {
        const a = (i / leaves) * Math.PI * 2;
        const rr = r * 0.5;
        const hh = h * (0.55 + 0.3 * ((i * 37) % 10) / 10);
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * rr, r * 1.4 + hh * 0.5, Math.sin(a) * rr]}
            rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]}
            scale={[0.12, hh * 0.5, 0.05]}
            material={i % 2 ? M.leaf : M.leaf2}
            castShadow
          >
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Rug({ w, d }: { w: number; d: number }) {
  return (
    <group position={[0, 0, d / 2]}>
      <Soft pos={[0, 0.004, 0]} size={[w, 0.014, d]} m={M.linen} r={0.006} />
      <Soft pos={[0, 0.012, 0]} size={[w - 0.22, 0.012, d - 0.22]} m={M.sage} r={0.006} />
    </group>
  );
}

function BalconySet({ w, d }: { w: number; d: number }) {
  return (
    <group position={[0, 0, d / 2]}>
      <Cyl pos={[0, 0.0, 0]} r={0.28} h={0.02} m={M.charcoal} />
      <Cyl pos={[0, 0.02, 0]} r={0.02} h={0.52} m={M.charcoal} seg={10} />
      <Cyl pos={[0, 0.54, 0]} r={0.3} h={0.025} m={M.oak} />
      {[-1, 1].map((k) => (
        <group key={k} position={[k * Math.min(0.5, w / 2 - 0.2), 0, 0]} rotation={[0, k < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
          <Soft pos={[0, 0.42, 0]} size={[0.42, 0.04, 0.42]} m={M.terracotta} r={0.02} />
          <Soft pos={[0, 0.46, -0.2]} size={[0.4, 0.4, 0.04]} m={M.terracotta} r={0.02} />
          {[-1, 1].map((a) => [-1, 1].map((b) => (
            <Box key={`${a}${b}`} pos={[a * 0.18, 0, b * 0.18]} size={[0.025, 0.42, 0.025]} m={M.charcoal} />
          )))}
        </group>
      ))}
      <Cyl pos={[0, 0.575, 0]} r={0.05} h={0.03} m={M.ceramic} />
    </group>
  );
}

function Railing({ w }: { w: number }) {
  const posts = Math.max(2, Math.round(w / 1.0) + 1);
  return (
    <group>
      <mesh position={[0, 0.55, 0]} material={M.glass}>
        <boxGeometry args={[w, 0.9, 0.012]} />
      </mesh>
      <Box pos={[0, 1.0, 0]} size={[w, 0.04, 0.05]} m={M.charcoal} />
      <Box pos={[0, 0.06, 0]} size={[w, 0.04, 0.05]} m={M.charcoal} />
      {Array.from({ length: posts }).map((_, i) => (
        <Box key={i} pos={[-w / 2 + (w / (posts - 1)) * i, 0.05, 0]} size={[0.04, 0.98, 0.04]} m={M.charcoal} />
      ))}
    </group>
  );
}

// ─── dispatcher ──────────────────────────────────────────────────────────────

function renderKind(p: Placed): ReactElement | null {
  const h = p.h ?? 1;
  switch (p.kind) {
    case 'bed':          return <Bed w={p.w} d={p.d} />;
    case 'nightstand':   return <Nightstand />;
    case 'wardrobe':     return <Wardrobe w={p.w} d={p.d} h={h} />;
    case 'desk':         return <Desk w={p.w} d={p.d} />;
    case 'sofa':         return <Sofa w={p.w} d={p.d} />;
    case 'armchair':     return <Armchair w={p.w} d={p.d} />;
    case 'coffeeTable':  return <CoffeeTable w={p.w} d={p.d} />;
    case 'sideTable':    return <SideTable />;
    case 'floorLamp':    return <FloorLamp />;
    case 'tvUnit':       return <TVUnit w={p.w} d={p.d} />;
    case 'diningTable':  return <DiningTable w={p.w} d={p.d} variant={p.variant} />;
    case 'sideboard':    return <Sideboard w={p.w} d={p.d} />;
    case 'kitchenRun':   return <KitchenRun w={p.w} d={p.d} variant={p.variant} />;
    case 'fridge':       return <Fridge w={p.w} d={p.d} h={h} />;
    case 'toilet':       return <Toilet d={p.d} />;
    case 'vanity':       return <Vanity w={p.w} d={p.d} />;
    case 'mirror':       return <Mirror w={p.w} />;
    case 'shower':       return <Shower w={p.w} d={p.d} />;
    case 'washer':       return <Washer w={p.w} d={p.d} />;
    case 'shelf':        return <Shelf w={p.w} d={p.d} />;
    case 'plant':        return <Plant w={p.w} h={h} variant={p.variant} />;
    case 'rug':          return <Rug w={p.w} d={p.d} />;
    case 'balconySet':   return <BalconySet w={p.w} d={p.d} />;
    case 'railing':      return <Railing w={p.w} />;
    default:             return null;
  }
}

export const FurnitureItem = memo(function FurnitureItem({ item }: { item: Placed }) {
  const inner = renderKind(item);
  if (!inner) return null;
  // free-standing items are positioned by their centre; shift back to the back-centre origin
  const shift = item.freeStanding ? -item.d / 2 : 0;
  return (
    <group position={[item.x, 0, item.z]} rotation={[0, item.rot, 0]}>
      <group position={[0, 0, shift]}>{inner}</group>
    </group>
  );
});
