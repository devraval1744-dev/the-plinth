/**
 * Deterministic 3D floor-plan viewer.
 *
 * Takes a SpatialAnalysis JSON (produced by the AI service) and renders
 * a Three.js scene via React Three Fiber.  The result is always determined
 * by the structured JSON — never a random AI image.
 *
 * Wall height and thickness are applied as defaults when not available in data.
 */
import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, PerspectiveCamera } from '@react-three/drei';
import type { SpatialAnalysis, SpatialRoom, SpatialWall } from '../../types';

// ─── Colour map for room types ────────────────────────────────────────────────

const ROOM_COLOURS: Record<string, string> = {
  living_room: '#d4c5a9',
  dining:      '#c9b99a',
  bedroom:     '#b8d4c8',
  kitchen:     '#e8d5c0',
  bathroom:    '#c5d5e8',
  utility:     '#d8d8d8',
  balcony:     '#b8e8b8',
  corridor:    '#e0ddd5',
  other:       '#e0e0e0',
};

const WALL_HEIGHT = 2.8;    // metres
const FLOOR_Y     = 0.001;  // just above zero to avoid z-fighting

// ─── Coordinate helpers ───────────────────────────────────────────────────────

// Blueprint coords: x → Three.js x, y → Three.js -z (so +y in blueprint = "into screen")
function bx(v: number, cx: number) { return v - cx; }
function bz(v: number, cz: number) { return -(v - cz); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function Floor({ w, h }: { w: number; h: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#f5f0e8" />
    </mesh>
  );
}

function RoomMesh({
  room,
  cx,
  cz,
}: {
  room: SpatialRoom;
  cx: number;
  cz: number;
}) {
  const color = ROOM_COLOURS[room.type] ?? ROOM_COLOURS.other;
  const px = bx(room.x + room.width / 2, cx);
  const pz = bz(room.y + room.height / 2, cz);
  const label = room.name;

  return (
    <group position={[px, FLOOR_Y, pz]}>
      {/* Tinted floor panel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[room.width - 0.05, room.height - 0.05]} />
        <meshStandardMaterial color={color} transparent opacity={0.85} />
      </mesh>
      {/* Room label */}
      <Html center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(255,255,255,0.75)',
          borderRadius: 4,
          padding: '2px 6px',
          fontSize: 11,
          fontFamily: 'Inter, sans-serif',
          color: '#1e3a8a',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function WallMesh({ wall, cx, cz }: { wall: SpatialWall; cx: number; cz: number }) {
  const dx = wall.end_x - wall.start_x;
  const dy = wall.end_y - wall.start_y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 0.05) return null;

  const midX = bx((wall.start_x + wall.end_x) / 2, cx);
  const midZ = bz((wall.start_y + wall.end_y) / 2, cz);

  // Rotation angle: blueprint y → -z, so atan2 is negated
  const angle = Math.atan2(-dy, dx);
  const thickness = wall.thickness > 0 ? wall.thickness : 0.15;

  return (
    <mesh position={[midX, WALL_HEIGHT / 2, midZ]} rotation={[0, angle, 0]} castShadow>
      <boxGeometry args={[length, WALL_HEIGHT, thickness]} />
      <meshStandardMaterial color="#5a5a5a" />
    </mesh>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ data }: { data: SpatialAnalysis }) {
  const cx = data.canvas_width  / 2;
  const cz = data.canvas_height / 2;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 15, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-5, 10, -5]} intensity={0.3} />

      {/* Floor */}
      <Floor w={data.canvas_width} h={data.canvas_height} />

      {/* Room panels */}
      {data.rooms
        .filter((r) => r.type !== 'balcony')
        .map((r) => <RoomMesh key={r.id} room={r} cx={cx} cz={cz} />)}

      {/* Balcony panels (distinct colour) */}
      {data.balconies.map((b) => (
        <group key={b.id} position={[bx(b.x + b.width / 2, cx), FLOOR_Y, bz(b.y + b.height / 2, cz)]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[b.width - 0.05, Math.max(b.height - 0.05, 0.3)]} />
            <meshStandardMaterial color="#b8e8b8" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}

      {/* Walls */}
      {data.walls.map((w) => <WallMesh key={w.id} wall={w} cx={cx} cz={cz} />)}
    </>
  );
}

// ─── Camera reset hook ────────────────────────────────────────────────────────

function ResetButton({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  return (
    <button
      onClick={() => controlsRef.current?.reset()}
      className="btn btn-secondary text-xs px-2 py-1"
      title="Reset camera"
    >↺ Reset</button>
  );
}

// ─── Public viewer component ──────────────────────────────────────────────────

interface Props {
  data:      SpatialAnalysis;
  isDemo?:   boolean;
  provider?: string;
  height?:   number;
}

export default function Blueprint3DViewer({ data, isDemo = false, provider = 'demo', height = 500 }: Props) {
  const controlsRef = useRef<any>(null);
  const camDistance = Math.max(data.canvas_width, data.canvas_height) * 1.2;

  const isImageAware    = provider.includes('image_aware') && !provider.includes('fallback');
  const isFallback      = provider.includes('fallback');
  const disclosureLabel = isImageAware
    ? '⚠ Image-Aware Demo Analysis'
    : '⚠ Demo AI Analysis';
  const disclosureMsg   = isImageAware
    ? 'Layout derived from the actual uploaded blueprint image using approximate image analysis. Not real AI vision — spatial positions are approximate.'
    : 'This 3D view uses a generic layout template. Not derived from the actual blueprint image.';

  return (
    <div className="space-y-2">
      {/* Demo/provider label */}
      {isDemo && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-xs font-semibold text-amber-800 shrink-0">{disclosureLabel}</span>
          <span className="text-xs text-amber-700">{disclosureMsg}</span>
        </div>
      )}
      {isFallback && (
        <div className="px-3 py-1.5 bg-navy-50 border border-navy-200 rounded-lg">
          <span className="text-xs text-navy-600">Image analysis unavailable for this file — using template layout.</span>
        </div>
      )}

      {/* Controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-navy-500">
          Drag to rotate · Scroll to zoom · Right-drag to pan
        </p>
        <ResetButton controlsRef={controlsRef} />
      </div>

      {/* 3D canvas */}
      <div
        style={{ height }}
        className="rounded-xl overflow-hidden border border-navy-200 bg-navy-50"
      >
        <Canvas shadows gl={{ antialias: true }}>
          <PerspectiveCamera
            makeDefault
            position={[0, camDistance * 0.8, camDistance * 0.5]}
            fov={45}
          />
          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.08}
            minDistance={2}
            maxDistance={camDistance * 2.5}
            maxPolarAngle={Math.PI / 2.05}
          />
          <Suspense fallback={null}>
            <Scene data={data} />
          </Suspense>
        </Canvas>
      </div>

      {/* Disclosures */}
      <div className="space-y-1">
        <p className="text-xs text-navy-400">
          AI-generated 3D Visualization — Informational and Non-binding.
        </p>
        <p className="text-xs text-navy-400">
          AI blueprint insights are not professional architectural, engineering or legal certification.
          The original builder-uploaded blueprint is the primary source.
        </p>
      </div>
    </div>
  );
}
