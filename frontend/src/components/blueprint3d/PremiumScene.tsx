/**
 * Premium 3D scene: textured floors, walls with real door / window openings,
 * door leaves, glazing, fully furnished rooms and soft labels.
 * Everything is derived deterministically from the SpatialAnalysis JSON.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { Opening, Plan, PlanRoom, Rect, Wall } from './plan';
import type { Placed } from './layout';
import { FurnitureItem, M } from './furniture';

export type WallMode = 'dollhouse' | 'cutaway' | 'full';

const WALL_H = 2.8;
const SPLIT_H = 1.05;           // walls are split here so the upper part can fold away
const FLOOR_Y = 0.004;

// ─── procedural textures ─────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function woodTexture(base: [number, number, number], seed: number) {
  return canvasTexture((g, s) => {
    const r = rng(seed);
    const rows = 8, h = s / rows;
    for (let i = 0; i < rows; i++) {
      const k = 0.88 + r() * 0.24;
      const joint = r() * s;
      const col = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
      g.fillStyle = col;
      g.fillRect(0, i * h, s, h);
      // grain
      for (let n = 0; n < 26; n++) {
        const y = i * h + r() * h;
        g.strokeStyle = `rgba(60,35,15,${0.03 + r() * 0.07})`;
        g.lineWidth = 0.6 + r() * 0.8;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 4, s * 0.6, y + (r() - 0.5) * 4, s, y + (r() - 0.5) * 2);
        g.stroke();
      }
      // butt joint + plank edges
      g.fillStyle = 'rgba(40,22,10,0.35)';
      g.fillRect(joint, i * h, 1.6, h);
      g.fillRect(0, i * h, s, 1.4);
    }
  });
}

function tileTexture(base: string, grout: string, seed: number, grid = 2) {
  return canvasTexture((g, s) => {
    const r = rng(seed);
    const n = grid, t = s / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = base;
        g.fillRect(x * t, y * t, t, t);
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.04})`;
        g.fillRect(x * t, y * t, t, t);
      }
    }
    g.fillStyle = grout;
    for (let i = 0; i < n; i++) {
      g.fillRect(i * t - 1.5, 0, 3, s);
      g.fillRect(0, i * t - 1.5, s, 3);
    }
  });
}

function stoneTexture(base: string, seed: number) {
  return canvasTexture((g, s) => {
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '90,80,70'},${r() * 0.05})`;
      g.fillRect(r() * s, r() * s, 2 + r() * 8, 2 + r() * 8);
    }
    g.strokeStyle = 'rgba(80,70,60,0.12)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
  });
}

interface FloorSpec { mat: THREE.MeshStandardMaterial; tile: number }

function useFloorSpecs() {
  return useMemo(() => {
    const mk = (map: THREE.Texture, rough: number, metal = 0): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal });
    const wood = { mat: mk(woodTexture([186, 140, 92], 11), 0.5), tile: 1.2 };
    const woodDark = { mat: mk(woodTexture([140, 102, 70], 23), 0.5), tile: 1.2 };
    const tileLight = { mat: mk(tileTexture('#dcdad4', '#bdb9b0', 31), 0.22), tile: 1.2 };
    const tileBath = { mat: mk(tileTexture('#cfd9de', '#aebcc4', 41), 0.18), tile: 1.2 };
    const tileUtil = { mat: mk(tileTexture('#c4c3c0', '#a5a39f', 53), 0.3), tile: 1.2 };
    const marble = { mat: mk(tileTexture('#e2ddd1', '#c2bbab', 67, 1), 0.2), tile: 1.8 };
    const slate = { mat: mk(tileTexture('#6c7078', '#53565d', 79), 0.5), tile: 1.2 };
    const stone = { mat: mk(stoneTexture('#c9c3b5', 97), 0.85), tile: 2.4 };
    return { wood, woodDark, tileLight, tileBath, tileUtil, marble, slate, stone } as Record<string, FloorSpec>;
  }, []);
}

function floorFor(type: string, specs: Record<string, FloorSpec>): FloorSpec {
  switch (type) {
    case 'bedroom':     return specs.wood;
    case 'living_room': return specs.woodDark;
    case 'dining':      return specs.woodDark;
    case 'kitchen':     return specs.tileLight;
    case 'bathroom':    return specs.tileBath;
    case 'utility':     return specs.tileUtil;
    case 'balcony':     return specs.slate;
    default:            return specs.marble;
  }
}

// ─── floors ──────────────────────────────────────────────────────────────────

function FloorPatch({ rect, spec, y }: { rect: Rect; spec: FloorSpec; y: number }) {
  const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / spec.tile, (uv.getY(i) * d) / spec.tile);
    return g;
  }, [w, d, spec.tile]);
  return (
    <mesh geometry={geo} material={spec.mat} position={[(rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2]} receiveShadow />
  );
}

function Floors({ plan, specs }: { plan: Plan; specs: Record<string, FloorSpec> }) {
  const b = plan.bounds;
  const pad = 0.55;
  const w = b.x1 - b.x0 + pad * 2, d = b.z1 - b.z0 + pad * 2;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  return (
    <group>
      {/* plinth base */}
      <mesh position={[cx, -0.34, cz]} receiveShadow castShadow>
        <boxGeometry args={[w + 0.16, 0.3, d + 0.16]} />
        <meshStandardMaterial color="#bdb6a8" roughness={0.9} />
      </mesh>
      <mesh position={[cx, -0.1, cz]} receiveShadow>
        <boxGeometry args={[w, 0.2, d]} />
        <meshStandardMaterial color="#cdc7ba" roughness={0.9} />
      </mesh>
      <FloorPatch rect={{ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }} spec={specs.stone} y={0.0015} />
      {plan.hall.map((r, i) => <FloorPatch key={`h${i}`} rect={r} spec={specs.marble} y={FLOOR_Y} />)}
      {plan.rooms.map((r, i) => {
        const pad2 = 0.1;
        const rect = { x0: r.rect.x0 - pad2, x1: r.rect.x1 + pad2, z0: r.rect.z0 - pad2, z1: r.rect.z1 + pad2 };
        return <FloorPatch key={r.id} rect={rect} spec={floorFor(r.type, specs)} y={FLOOR_Y + 0.001 * (i + 1)} />;
      })}
    </group>
  );
}

// ─── wall materials ──────────────────────────────────────────────────────────

const wallSide = new THREE.MeshStandardMaterial({ color: '#f1ece3', roughness: 0.92 });
const wallCap  = new THREE.MeshStandardMaterial({ color: '#2f3442', roughness: 0.6 });
const WALL_MATS = [wallSide, wallSide, wallCap, wallSide, wallSide, wallSide];

const frameMat = new THREE.MeshStandardMaterial({ color: '#f7f5f0', roughness: 0.5 });
const doorMat = new THREE.MeshStandardMaterial({ color: '#a88660', roughness: 0.55 });
const doorPanelMat = new THREE.MeshStandardMaterial({ color: '#a37b52', roughness: 0.6 });
const alu = new THREE.MeshStandardMaterial({ color: '#30343c', roughness: 0.4, metalness: 0.6 });
const arcMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 });

// ─── door / window fixtures ──────────────────────────────────────────────────

function DoorFixture({ o, thick }: { o: Opening; thick: number }) {
  const w = o.t1 - o.t0;
  const h = o.head;
  const ft = thick + 0.03;
  return (
    <group>
      {/* frame */}
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 2 - 0.025), h / 2, 0]} material={frameMat} castShadow>
          <boxGeometry args={[0.05, h, ft]} />
        </mesh>
      ))}
      <mesh position={[0, h - 0.025, 0]} material={frameMat} castShadow>
        <boxGeometry args={[w, 0.05, ft]} />
      </mesh>
      {/* leaf (hinged on the −x jamb, swung open ~75°) */}
      <group position={[-w / 2 + 0.05, 0, 0]} rotation={[0, -o.swing * 1.3, 0]}>
        <mesh position={[(w - 0.1) / 2, (h - 0.06) / 2, 0]} material={doorMat} castShadow receiveShadow>
          <boxGeometry args={[w - 0.1, h - 0.06, 0.04]} />
        </mesh>
        {[0.28, 0.74].map((f) => (
          <mesh key={f} position={[(w - 0.1) / 2, (h - 0.06) * f, 0.021 * o.swing]} material={doorPanelMat}>
            <boxGeometry args={[w - 0.3, (h - 0.06) * 0.36, 0.006]} />
          </mesh>
        ))}
        <mesh position={[w - 0.2, 1.0, 0.04 * o.swing]} material={M.brass} castShadow>
          <boxGeometry args={[0.12, 0.022, 0.03]} />
        </mesh>
      </group>
    </group>
  );
}

function SwingArc({ o }: { o: Opening }) {
  const line = useMemo(() => {
    const w = o.t1 - o.t0;
    const r = w - 0.1;
    const px = -w / 2 + 0.05;
    const pts: THREE.Vector3[] = [new THREE.Vector3(px, 0.02, 0)];
    const max = 1.3;
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * max;
      pts.push(new THREE.Vector3(px + r * Math.cos(a), 0.02, o.swing * r * Math.sin(a)));
    }
    pts.push(new THREE.Vector3(px, 0.02, 0));
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat);
  }, [o]);
  return <primitive object={line} />;
}

function WindowFixture({ o, thick }: { o: Opening; thick: number }) {
  const w = o.t1 - o.t0;
  const h = o.head - o.sill;
  const ft = Math.min(thick * 0.55, 0.12);
  const t = 0.045;
  return (
    <group position={[0, o.sill, 0]}>
      {/* frame */}
      <mesh position={[0, t / 2, 0]} material={alu} castShadow><boxGeometry args={[w, t, ft]} /></mesh>
      <mesh position={[0, h - t / 2, 0]} material={alu} castShadow><boxGeometry args={[w, t, ft]} /></mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 2 - t / 2), h / 2, 0]} material={alu} castShadow><boxGeometry args={[t, h, ft]} /></mesh>
      ))}
      <mesh position={[0, h / 2, 0]} material={alu}><boxGeometry args={[0.03, h, ft * 0.8]} /></mesh>
      {/* glazing */}
      <mesh position={[0, h / 2, 0]} material={M.glass}><boxGeometry args={[w - t, h - t, 0.01]} /></mesh>
      {/* sill ledge */}
      <mesh position={[0, -0.02, 0]} material={M.marble} castShadow receiveShadow>
        <boxGeometry args={[w + 0.14, 0.04, thick + 0.1]} />
      </mesh>
    </group>
  );
}

function SliderFixture({ o, thick }: { o: Opening; thick: number }) {
  const w = o.t1 - o.t0;
  const h = o.head;
  const ft = Math.min(thick * 0.5, 0.1);
  const t = 0.05;
  const panelW = w / 2;
  return (
    <group>
      <mesh position={[0, h - t / 2, 0]} material={alu}><boxGeometry args={[w, t, ft]} /></mesh>
      <mesh position={[0, t / 2, 0]} material={alu}><boxGeometry args={[w, t, ft]} /></mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 2 - t / 2), h / 2, 0]} material={alu}><boxGeometry args={[t, h, ft]} /></mesh>
      ))}
      {[-1, 1].map((k) => (
        <group key={k} position={[k * panelW * 0.5, 0, k * 0.012]}>
          <mesh position={[0, h / 2, 0]} material={M.glass}><boxGeometry args={[panelW - 0.04, h - 0.1, 0.01]} /></mesh>
          <mesh position={[k * (panelW / 2 - 0.03), h / 2, 0]} material={alu}><boxGeometry args={[0.04, h - 0.08, 0.03]} /></mesh>
          <mesh position={[-k * (panelW / 2 - 0.03), h / 2, 0]} material={alu}><boxGeometry args={[0.04, h - 0.08, 0.03]} /></mesh>
          <mesh position={[0, 1.0, 0.02 * k]} material={M.steel}><boxGeometry args={[0.02, 0.2, 0.02]} /></mesh>
        </group>
      ))}
    </group>
  );
}

// ─── walls ───────────────────────────────────────────────────────────────────

interface Piece { a: number; b: number; y0: number; y1: number }

function wallPieces(wall: Wall, index: number) {
  const ext = wall.thick / 2;
  const lower: Piece[] = [];
  const upper: Piece[] = [];
  const top = WALL_H + index * 0.0005;
  const range = (a: number, b: number, y0: number, y1: number) => {
    if (b - a < 0.005 || y1 - y0 < 0.005) return;
    if (y0 < SPLIT_H) lower.push({ a, b, y0, y1: Math.min(y1, SPLIT_H) });
    if (y1 > SPLIT_H) upper.push({ a, b, y0: Math.max(y0, SPLIT_H), y1 });
  };
  let cursor = -ext;
  wall.openings.forEach((o) => {
    range(cursor, o.t0, 0, top);
    if (o.sill > 0) range(o.t0, o.t1, 0, o.sill);
    range(o.t0, o.t1, o.head, top);
    cursor = o.t1;
  });
  range(cursor, wall.len + ext, 0, top);
  return { lower, upper };
}

function PieceMesh({ p, wall }: { p: Piece; wall: Wall }) {
  return (
    <mesh
      position={[(p.a + p.b) / 2 - wall.len / 2, (p.y0 + p.y1) / 2, 0]}
      material={WALL_MATS}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[p.b - p.a, p.y1 - p.y0, wall.thick]} />
    </mesh>
  );
}

function WallView({ wall, index, mode }: { wall: Wall; index: number; mode: WallMode }) {
  const upperRef = useRef<THREE.Group>(null);
  const { lower, upper } = useMemo(() => wallPieces(wall, index), [wall, index]);

  useFrame((state, dt) => {
    const g = upperRef.current;
    if (!g) return;
    let hide = mode === 'cutaway';
    if (mode === 'dollhouse') {
      const t = (state.controls as unknown as { target?: THREE.Vector3 } | null)?.target;
      const cam = state.camera.position;
      const dx = cam.x - (t?.x ?? 0), dz = cam.z - (t?.z ?? 0), dy = cam.y - (t?.y ?? 0);
      const hd = Math.hypot(dx, dz);
      const el = Math.atan2(dy, hd);
      const ux = hd > 1e-3 ? dx / hd : 0, uz = hd > 1e-3 ? dz / hd : 0;
      if (el > 1.15) hide = true;
      else if (wall.exterior) hide = wall.outX * ux + wall.outZ * uz > 0.12;
      else hide = el > 0.4 && Math.abs(wall.nx * ux + wall.nz * uz) > 0.55;
    }
    const target = hide ? 0.001 : 1;
    const s = THREE.MathUtils.lerp(g.scale.y, target, 1 - Math.exp(-9 * dt));
    g.scale.y = s;
    g.visible = s > 0.02;
  });

  return (
    <group position={[wall.mx, 0, wall.mz]} rotation={[0, wall.angle, 0]}>
      {/* lower body + floor swing arcs (always visible) */}
      {lower.map((p, i) => <PieceMesh key={`l${i}`} p={p} wall={wall} />)}
      {wall.openings.filter((o) => o.kind === 'door').map((o) => (
        <group key={`arc${o.id}`} position={[(o.t0 + o.t1) / 2 - wall.len / 2, 0, 0]}>
          <SwingArc o={o} />
        </group>
      ))}
      {/* upper body + fixtures: folds away in dollhouse / cutaway view */}
      <group ref={upperRef} position={[0, SPLIT_H, 0]}>
        <group position={[0, -SPLIT_H, 0]}>
          {upper.map((p, i) => <PieceMesh key={`u${i}`} p={p} wall={wall} />)}
          {wall.openings.map((o) => (
            <group key={o.id} position={[(o.t0 + o.t1) / 2 - wall.len / 2, 0, 0]}>
              {o.kind === 'door' && <DoorFixture o={o} thick={wall.thick} />}
              {o.kind === 'window' && <WindowFixture o={o} thick={wall.thick} />}
              {o.kind === 'slider' && <SliderFixture o={o} thick={wall.thick} />}
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

// ─── labels ──────────────────────────────────────────────────────────────────

function RoomLabel({ room }: { room: PlanRoom }) {
  const sqft = Math.round(room.areaSqft);
  return (
    <Html position={[room.cx, 0.12, room.cz]} center distanceFactor={11} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(4px)',
          borderRadius: 999,
          padding: '3px 10px 4px',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(30,40,80,0.22)',
          border: '1px solid rgba(30,58,138,0.12)',
          lineHeight: 1.15,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e2f6b', letterSpacing: 0.3 }}>{room.name}</div>
        {sqft > 0 && <div style={{ fontSize: 9, fontWeight: 500, color: '#6b7494' }}>{sqft} sq ft</div>}
      </div>
    </Html>
  );
}

// ─── scene ───────────────────────────────────────────────────────────────────

interface SceneProps {
  plan: Plan;
  furniture: Placed[];
  mode: WallMode;
  showFurniture: boolean;
  showLabels: boolean;
}

export default function PremiumScene({ plan, furniture, mode, showFurniture, showLabels }: SceneProps) {
  const specs = useFloorSpecs();
  // label the largest un-named enclosed space as the hall
  const hallRoom = useMemo<PlanRoom | null>(() => {
    const big = [...plan.hall].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
    if (!big || (big.x1 - big.x0) * (big.z1 - big.z0) < 2.2) return null;
    const empty = { side: 'N' as const, line: 0, a0: 0, a1: 0, len: 0, covered: 0, openings: [] };
    return {
      id: 'hall', name: 'Hall', type: 'hall', rect: big,
      cx: (big.x0 + big.x1) / 2, cz: (big.z0 + big.z1) / 2, areaSqft: 0,
      sides: { N: empty, S: empty, W: empty, E: empty },
    };
  }, [plan]);
  return (
    <group>
      <Floors plan={plan} specs={specs} />
      {plan.walls.map((w, i) => <WallView key={w.id + i} wall={w} index={i} mode={mode} />)}
      {showFurniture && furniture.map((f, i) => <FurnitureItem key={`${f.kind}${i}`} item={f} />)}
      {showLabels && plan.rooms.map((r) => <RoomLabel key={r.id} room={r} />)}
      {showLabels && hallRoom && <RoomLabel room={hallRoom} />}
    </group>
  );
}
