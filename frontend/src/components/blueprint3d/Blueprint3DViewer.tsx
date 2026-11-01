/**
 * Premium 3D floor-plan viewer.
 *
 * Takes the SpatialAnalysis JSON produced by the AI service and renders a
 * furnished, lit, interactive "dollhouse" with React Three Fiber.  The scene
 * is derived deterministically from the JSON — never from a random AI image.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import type { SpatialAnalysis } from '../../types';
import { buildPlan } from './plan';
import { layoutFurniture } from './layout';
import PremiumScene, { type WallMode } from './PremiumScene';

// ─── camera presets ──────────────────────────────────────────────────────────

type CamPreset = 'iso' | 'top';

function CameraRig({
  preset, nonce, center, span,
}: { preset: CamPreset; nonce: number; center: THREE.Vector3; span: number }) {
  const { camera, controls } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const off = preset === 'top'
      ? new THREE.Vector3(0, span * 2.0, span * 0.01)
      : new THREE.Vector3(span * 0.26, span * 1.3, span * 1.2);
    goal.current = { pos: center.clone().add(off), target: center.clone() };
  }, [preset, nonce, center, span]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (!g || !c) return;
    const k = 1 - Math.exp(-5 * dt);
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.target) < 0.02) goal.current = null;
  });
  return null;
}

// ─── UI bits ─────────────────────────────────────────────────────────────────

function Seg<T extends string>({
  value, options, onChange,
}: { value: T; options: { id: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-navy-200 bg-white p-0.5 shadow-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          onClick={() => onChange(o.id)}
          className={
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors ' +
            (value === o.id ? 'bg-navy-700 text-white shadow-sm' : 'text-navy-600 hover:bg-navy-50')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'px-2.5 py-1 text-xs font-medium rounded-lg border shadow-sm transition-colors ' +
        (on ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50')
      }
    >
      {label}
    </button>
  );
}

// ─── public viewer component ─────────────────────────────────────────────────

interface Props {
  data:         SpatialAnalysis;
  isDemo?:      boolean;
  provider?:    string;
  height?:      number;
  propertyId?:  string;   // kept for API compatibility
  blueprintId?: string;   // kept for API compatibility
}

export default function Blueprint3DViewer({
  data,
  isDemo = false,
  provider = 'demo',
  height = 580,
}: Props) {
  const [mode, setMode] = useState<WallMode>('dollhouse');
  const [furnished, setFurnished] = useState(true);
  const [labels, setLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [preset, setPreset] = useState<CamPreset>('iso');
  const [nonce, setNonce] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const built = useMemo(() => {
    try {
      const plan = buildPlan(data);
      return { plan, furniture: layoutFurniture(plan), error: null as string | null };
    } catch (e) {
      console.error('[3D Viewer] could not build plan', e);
      return { plan: null, furniture: [], error: 'The blueprint data could not be converted into a 3D scene.' };
    }
  }, [data]);

  const { plan, furniture } = built;
  const span = plan ? Math.max(plan.bounds.x1 - plan.bounds.x0, plan.bounds.z1 - plan.bounds.z0, 4) : 10;
  const center = useMemo(
    () => (plan
      ? new THREE.Vector3((plan.bounds.x0 + plan.bounds.x1) / 2, 0, (plan.bounds.z0 + plan.bounds.z1) / 2)
      : new THREE.Vector3()),
    [plan],
  );

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const isImageAware    = provider.includes('image_aware') && !provider.includes('fallback');
  const isFallback      = provider.includes('fallback');
  const disclosureLabel = isImageAware ? '⚠ Image-Aware Demo Analysis' : '⚠ Demo AI Analysis';
  const disclosureMsg   = isImageAware
    ? 'Layout derived from the actual uploaded blueprint image using approximate image analysis. Not real AI vision — spatial positions are approximate.'
    : 'This 3D view uses a generic layout template. Not derived from the actual blueprint image.';

  const startPos = center.clone().add(new THREE.Vector3(span * 0.26, span * 1.3, span * 1.2));

  return (
    <div className="space-y-2">
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

      {/* controls bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-navy-500">Drag to rotate · Scroll to zoom · Right-drag to pan</p>
        <div className="flex items-center flex-wrap gap-2">
          <Seg<WallMode>
            value={mode}
            onChange={setMode}
            options={[
              { id: 'dollhouse', label: 'Dollhouse', title: 'Walls facing the camera fold away automatically' },
              { id: 'cutaway',   label: 'Cutaway',   title: 'Low walls — see every room at once' },
              { id: 'full',      label: 'Full walls', title: 'Walls at full height' },
            ]}
          />
          <Seg<CamPreset>
            value={preset}
            onChange={(p) => { setPreset(p); setNonce((n) => n + 1); }}
            options={[{ id: 'iso', label: '3D' }, { id: 'top', label: 'Top' }]}
          />
          <Toggle on={furnished} label="Furniture" onClick={() => setFurnished((v) => !v)} />
          <Toggle on={labels} label="Labels" onClick={() => setLabels((v) => !v)} />
          <Toggle on={autoRotate} label="Orbit" onClick={() => setAutoRotate((v) => !v)} />
          <button
            type="button"
            onClick={() => { setPreset('iso'); setNonce((n) => n + 1); }}
            className="btn btn-secondary text-xs px-2.5 py-1"
            title="Reset camera"
          >
            ↺ Reset
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="btn btn-secondary text-xs px-2.5 py-1"
            title="Toggle fullscreen"
          >
            {fullscreen ? '✕ Exit' : '⛶ Fullscreen'}
          </button>
        </div>
      </div>

      {/* 3D canvas */}
      <div
        ref={wrapRef}
        style={{
          height: fullscreen ? '100vh' : height,
          background: 'radial-gradient(ellipse at 50% 35%, #fbf8f1 0%, #ece7dc 55%, #d9d3c5 100%)',
        }}
        className="relative rounded-xl overflow-hidden border border-navy-200"
      >
        {!plan ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-navy-500">{built.error}</div>
        ) : (
          <Canvas
            shadows="soft"
            dpr={[1, 2]}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
          >
            <PerspectiveCamera makeDefault position={startPos.toArray()} fov={34} near={0.1} far={400} />
            <OrbitControls
              makeDefault
              target={center.toArray()}
              enableDamping
              dampingFactor={0.08}
              minDistance={2.5}
              maxDistance={span * 3}
              maxPolarAngle={Math.PI / 2.08}
              autoRotate={autoRotate}
              autoRotateSpeed={0.8}
            />
            <CameraRig preset={preset} nonce={nonce} center={center} span={span} />

            {/* lighting */}
            <hemisphereLight args={['#fff6e6', '#a99f8f', 0.6]} />
            <directionalLight
              castShadow
              position={[center.x + span * 0.55, span * 1.25, center.z + span * 0.5]}
              intensity={2.1}
              color="#fff1dc"
              shadow-mapSize={[2048, 2048]}
              shadow-bias={-0.0004}
              shadow-normalBias={0.035}
              shadow-radius={4}
            >
              <orthographicCamera attach="shadow-camera" args={[-span * 0.85, span * 0.85, span * 0.85, -span * 0.85, 0.5, span * 5]} />
            </directionalLight>
            <directionalLight position={[center.x - span * 0.6, span * 0.8, center.z - span * 0.4]} intensity={0.55} color="#cfe0ff" />

            <Suspense fallback={null}>
              <Environment resolution={256}>
                <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} color="#fff8ec" />
                <Lightformer form="rect" intensity={1.4} position={[-6, 3, 2]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color="#dfeaff" />
                <Lightformer form="rect" intensity={1.0} position={[6, 3, -2]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color="#ffe9cc" />
              </Environment>
              <PremiumScene plan={plan} furniture={furniture} mode={mode} showFurniture={furnished} showLabels={labels} />
              <ContactShadows
                position={[center.x, -0.52, center.z]}
                scale={span * 2.2}
                opacity={0.42}
                blur={2.8}
                far={2.2}
                resolution={512}
              />
            </Suspense>
          </Canvas>
        )}
      </div>

      {/* disclosures */}
      <div className="space-y-1">
        <p className="text-xs text-navy-400">AI-generated 3D Visualization — Informational and Non-binding.</p>
        <p className="text-xs text-navy-400">
          Furniture, finishes and fixtures are illustrative placeholders. AI blueprint insights are not professional
          architectural, engineering or legal certification. The original builder-uploaded blueprint is the primary source.
        </p>
      </div>
    </div>
  );
}
