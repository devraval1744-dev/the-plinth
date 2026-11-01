/**
 * Turns the raw SpatialAnalysis JSON into a clean, render-ready "plan":
 *  - everything is re-centred on the origin (metres), plan +y → three.js +z
 *  - wall segments are snapped, de-duplicated and cleaned up
 *  - doors / windows are attached to their host wall as openings
 *  - walls are classified exterior / interior
 *  - un-labelled enclosed floor (halls, corridors) is detected
 */
import type { SpatialAnalysis } from '../../types';

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export type Side = 'N' | 'S' | 'W' | 'E';

export interface Opening {
  id: string;
  kind: 'door' | 'window' | 'slider';
  t0: number;          // metres from wall start
  t1: number;
  sill: number;
  head: number;
  swing: 1 | -1;       // side of the wall normal the door leaf swings into
  roomName?: string;
  wx: number;          // world centre of the opening
  wz: number;
  width: number;
}

export interface Wall {
  id: string;
  ax: number; az: number; bx: number; bz: number;
  len: number;
  thick: number;
  angle: number;       // three.js rotation.y
  mx: number; mz: number;
  dx: number; dz: number;   // unit direction
  nx: number; nz: number;   // unit normal (-dz, dx)
  exterior: boolean;
  outX: number; outZ: number; // outward unit vector (exterior walls only)
  openings: Opening[];
}

export interface SideInfo {
  side: Side;
  line: number;             // fixed coordinate of the side (z for N/S, x for W/E)
  a0: number; a1: number;   // extent along the side
  len: number;
  covered: number;          // 0..1 share of the side backed by a wall
  openings: { kind: Opening['kind']; a: number; b: number; sill: number; head: number }[];
}

export interface PlanRoom {
  id: string;
  name: string;
  type: string;
  rect: Rect;
  cx: number; cz: number;
  areaSqft: number;
  sides: Record<Side, SideInfo>;
}

export interface Plan {
  cx: number; cz: number;       // original canvas centre (for reference)
  walls: Wall[];
  rooms: PlanRoom[];
  hall: Rect[];
  bounds: Rect;                 // extent of walls + rooms
}

const SQM_TO_SQFT = 10.7639;
const WALL_MIN_LEN = 0.15;

// ─── helpers ─────────────────────────────────────────────────────────────────

export function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
}

function inRect(x: number, z: number, r: Rect, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qz = az + dz * t;
  return Math.hypot(px - qx, pz - qz);
}

interface RawWall { id: string; ax: number; az: number; bx: number; bz: number; thick: number }

/** Cluster nearby endpoints so corners meet cleanly. */
function clusterEndpoints(walls: RawWall[], radius: number): RawWall[] {
  const pts: { x: number; z: number }[] = [];
  walls.forEach((w) => { pts.push({ x: w.ax, z: w.az }, { x: w.bx, z: w.bz }); });
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z) < radius) {
        parent[find(i)] = find(j);
      }
    }
  }
  const sum = new Map<number, { x: number; z: number; n: number }>();
  pts.forEach((p, i) => {
    const r = find(i);
    const s = sum.get(r) ?? { x: 0, z: 0, n: 0 };
    s.x += p.x; s.z += p.z; s.n += 1;
    sum.set(r, s);
  });
  const c = (i: number) => {
    const s = sum.get(find(i))!;
    return { x: s.x / s.n, z: s.z / s.n };
  };
  return walls.map((w, k) => {
    const a = c(k * 2), b = c(k * 2 + 1);
    return { ...w, ax: a.x, az: a.z, bx: b.x, bz: b.z };
  });
}

/** Snap near-axis walls onto the axis. */
function snapAxes(walls: RawWall[], maxDeg = 8): RawWall[] {
  const lim = (maxDeg * Math.PI) / 180;
  return walls.map((w) => {
    const dx = w.bx - w.ax, dz = w.bz - w.az;
    const ang = Math.atan2(Math.abs(dz), Math.abs(dx));
    if (ang < lim) {
      const z = (w.az + w.bz) / 2;
      return { ...w, az: z, bz: z };
    }
    if (Math.PI / 2 - ang < lim) {
      const x = (w.ax + w.bx) / 2;
      return { ...w, ax: x, bx: x };
    }
    return w;
  });
}

/** Merge collinear, overlapping axis-aligned walls of equal thickness. */
function mergeCollinear(walls: RawWall[]): RawWall[] {
  const out: RawWall[] = [];
  const horiz = walls.filter((w) => w.az === w.bz && w.ax !== w.bx);
  const vert = walls.filter((w) => w.ax === w.bx && w.az !== w.bz);
  const rest = walls.filter((w) => !horiz.includes(w) && !vert.includes(w));

  const run = (list: RawWall[], isH: boolean) => {
    const items = list.map((w) => ({
      pos: isH ? w.az : w.ax,
      a: isH ? Math.min(w.ax, w.bx) : Math.min(w.az, w.bz),
      b: isH ? Math.max(w.ax, w.bx) : Math.max(w.az, w.bz),
      t: w.thick,
      id: w.id,
    }));
    items.sort((p, q) => p.pos - q.pos);
    const groups: typeof items[] = [];
    items.forEach((it) => {
      const g = groups[groups.length - 1];
      if (g && Math.abs(it.pos - g[g.length - 1].pos) < 0.12) g.push(it);
      else groups.push([it]);
    });
    groups.forEach((g) => {
      const pos = g.reduce((s, i) => s + i.pos, 0) / g.length;
      g.sort((p, q) => p.a - q.a);
      const merged: typeof items = [];
      g.forEach((it) => {
        const last = merged[merged.length - 1];
        if (last && it.a <= last.b + 0.08 && Math.abs(it.t - last.t) < 0.03) {
          last.b = Math.max(last.b, it.b);
        } else {
          merged.push({ ...it, pos });
        }
      });
      merged.forEach((m) => {
        out.push(
          isH
            ? { id: m.id, ax: m.a, az: pos, bx: m.b, bz: pos, thick: m.t }
            : { id: m.id, ax: pos, az: m.a, bx: pos, bz: m.b, thick: m.t },
        );
      });
    });
  };
  run(horiz, true);
  run(vert, false);
  return [...out, ...rest];
}

// ─── main builder ────────────────────────────────────────────────────────────

export function buildPlan(data: SpatialAnalysis): Plan {
  const cx = data.canvas_width / 2;
  const cz = data.canvas_height / 2;

  // ── rooms ─────────────────────────────────────────────────────────────────
  const roomsRaw = data.rooms.map((r) => ({
    id: r.id, name: r.name, type: r.type,
    rect: { x0: r.x - cx, x1: r.x + r.width - cx, z0: r.y - cz, z1: r.y + r.height - cz },
    areaSqft: r.area_sqft ?? r.width * r.height * SQM_TO_SQFT,
  }));
  // balconies that aren't already represented by a balcony room
  (data.balconies ?? []).forEach((b) => {
    const rect = { x0: b.x - cx, x1: b.x + b.width - cx, z0: b.y - cz, z1: b.y + Math.max(b.height, 0.8) - cz };
    const dup = roomsRaw.some((r) => r.type === 'balcony' && rectsOverlap(r.rect, rect, -0.3));
    if (!dup) {
      roomsRaw.push({ id: b.id, name: 'Balcony', type: 'balcony', rect, areaSqft: b.width * b.height * SQM_TO_SQFT });
    }
  });

  // ── walls ─────────────────────────────────────────────────────────────────
  let raw: RawWall[] = data.walls
    .map((w) => ({
      id: w.id,
      ax: w.start_x - cx, az: w.start_y - cz,
      bx: w.end_x - cx, bz: w.end_y - cz,
      thick: Math.min(0.24, Math.max(0.1, w.thickness || 0.15)),
    }))
    .filter((w) => Math.hypot(w.bx - w.ax, w.bz - w.az) >= WALL_MIN_LEN);
  raw = clusterEndpoints(raw, 0.22);
  raw = snapAxes(raw);
  raw = mergeCollinear(raw);
  raw = raw.filter((w) => Math.hypot(w.bx - w.ax, w.bz - w.az) >= WALL_MIN_LEN);

  const walls: Wall[] = raw.map((w) => {
    const dxr = w.bx - w.ax, dzr = w.bz - w.az;
    const len = Math.hypot(dxr, dzr);
    const dx = dxr / len, dz = dzr / len;
    return {
      id: w.id, ax: w.ax, az: w.az, bx: w.bx, bz: w.bz, len, thick: w.thick,
      angle: -Math.atan2(dz, dx),
      mx: (w.ax + w.bx) / 2, mz: (w.az + w.bz) / 2,
      dx, dz, nx: -dz, nz: dx,
      exterior: false, outX: 0, outZ: 0,
      openings: [],
    };
  });

  const inAnyRoom = (x: number, z: number, pad = 0.15) =>
    roomsRaw.some((r) => inRect(x, z, r.rect, pad));

  // ── openings (doors / windows) ────────────────────────────────────────────
  const hostFor = (px: number, pz: number) => {
    let best: { w: Wall; t: number; d: number } | null = null;
    walls.forEach((w) => {
      const t = (px - w.ax) * w.dx + (pz - w.az) * w.dz;
      if (t < -0.2 || t > w.len + 0.2) return;
      const d = Math.abs((px - w.ax) * w.nx + (pz - w.az) * w.nz);
      if (d > 0.5) return;
      if (!best || d < best.d) best = { w, t, d };
    });
    return best as { w: Wall; t: number; d: number } | null;
  };

  const placeOpening = (
    id: string, kind: Opening['kind'], x: number, z: number, width: number,
    sill: number, head: number, roomName?: string,
  ) => {
    const host = hostFor(x, z);
    if (!host) return;
    const { w } = host;
    const wd = Math.min(width, w.len - 0.2);
    if (wd < 0.45) return;
    let t0 = host.t - wd / 2;
    t0 = Math.max(0.08, Math.min(w.len - 0.08 - wd, t0));
    const t1 = t0 + wd;
    // no overlaps on the same wall
    if (w.openings.some((o) => t0 < o.t1 + 0.1 && t1 > o.t0 - 0.1)) return;

    // choose which side a door swings into: the target room, otherwise any room
    const target = roomName
      ? roomsRaw.find((r) => r.name.toLowerCase() === roomName.toLowerCase() || r.id === roomName)
      : undefined;
    const mx = w.ax + w.dx * (t0 + wd / 2), mz = w.az + w.dz * (t0 + wd / 2);
    const probe = (s: number) => ({ x: mx + w.nx * s * 0.8, z: mz + w.nz * s * 0.8 });
    let swing: 1 | -1 = 1;
    const pa = probe(1), pb = probe(-1);
    if (target) {
      if (inRect(pb.x, pb.z, target.rect, 0.25) && !inRect(pa.x, pa.z, target.rect, 0.25)) swing = -1;
    } else if (!inAnyRoom(pa.x, pa.z) && inAnyRoom(pb.x, pb.z)) {
      swing = -1;
    }
    w.openings.push({ id, kind, t0, t1, sill, head, swing, roomName, wx: mx, wz: mz, width: wd });
  };

  const roomOf = (name?: string) =>
    name ? roomsRaw.find((r) => r.name.toLowerCase() === name.toLowerCase() || r.id === name) : undefined;

  (data.doors ?? []).forEach((d) => {
    placeOpening(d.id, 'door', d.x - cx, d.y - cz, Math.max(0.75, Math.min(d.width || 0.9, 1.2)), 0, 2.1, d.connects_to);
  });
  (data.windows ?? []).forEach((wi) => {
    const room = roomOf(wi.connects_to);
    const slider = room?.type === 'balcony';
    const bath = room?.type === 'bathroom' || room?.type === 'utility';
    if (slider) {
      placeOpening(wi.id, 'slider', wi.x - cx, wi.y - cz, Math.max(1.4, wi.width || 1.5), 0, 2.2, wi.connects_to);
    } else if (bath) {
      placeOpening(wi.id, 'window', wi.x - cx, wi.y - cz, Math.min(0.9, wi.width || 0.9), 1.35, 2.0, wi.connects_to);
    } else {
      placeOpening(wi.id, 'window', wi.x - cx, wi.y - cz, Math.max(0.9, Math.min(wi.width || 1.2, 3.2)), 0.9, 2.1, wi.connects_to);
    }
  });
  walls.forEach((w) => w.openings.sort((a, b) => a.t0 - b.t0));

  // ── bounds ────────────────────────────────────────────────────────────────
  const xs: number[] = [], zs: number[] = [];
  walls.forEach((w) => { xs.push(w.ax, w.bx); zs.push(w.az, w.bz); });
  roomsRaw.forEach((r) => { xs.push(r.rect.x0, r.rect.x1); zs.push(r.rect.z0, r.rect.z1); });
  const bounds: Rect = xs.length
    ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) }
    : { x0: -data.canvas_width / 2, x1: data.canvas_width / 2, z0: -data.canvas_height / 2, z1: data.canvas_height / 2 };

  // ── enclosed-space grid → inside mask + hall floor rects ──────────────────
  const STEP = 0.1, MARGIN = 0.9;
  const gx0 = bounds.x0 - MARGIN, gz0 = bounds.z0 - MARGIN;
  const nx = Math.ceil((bounds.x1 - bounds.x0 + MARGIN * 2) / STEP);
  const nz = Math.ceil((bounds.z1 - bounds.z0 + MARGIN * 2) / STEP);
  const core = new Uint8Array(nx * nz);
  const dil = new Uint8Array(nx * nz);
  const cellX = (i: number) => gx0 + (i + 0.5) * STEP;
  const cellZ = (j: number) => gz0 + (j + 0.5) * STEP;

  walls.forEach((w) => {
    const pad = w.thick / 2 + 0.5;
    const i0 = Math.max(0, Math.floor((Math.min(w.ax, w.bx) - pad - gx0) / STEP));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(w.ax, w.bx) + pad - gx0) / STEP));
    const j0 = Math.max(0, Math.floor((Math.min(w.az, w.bz) - pad - gz0) / STEP));
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(w.az, w.bz) + pad - gz0) / STEP));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = distToSeg(cellX(i), cellZ(j), w.ax, w.az, w.bx, w.bz);
        if (d <= w.thick / 2 + 0.02) core[j * nx + i] = 1;
        if (d <= w.thick / 2 + 0.45) dil[j * nx + i] = 1;
      }
    }
  });

  const outside = new Uint8Array(nx * nz);
  const queue: number[] = [];
  const push = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return;
    const k = j * nx + i;
    if (outside[k] || dil[k]) return;
    outside[k] = 1;
    queue.push(k);
  };
  for (let i = 0; i < nx; i++) { push(i, 0); push(i, nz - 1); }
  for (let j = 0; j < nz; j++) { push(0, j); push(nx - 1, j); }
  while (queue.length) {
    const k = queue.pop()!;
    const i = k % nx, j = (k - i) / nx;
    push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1);
  }
  // grow the outside back through the dilation band (not through real walls)
  for (let layer = 0; layer < 5; layer++) {
    const add: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (outside[k] || core[k]) continue;
        if (
          (i > 0 && outside[k - 1]) || (i < nx - 1 && outside[k + 1]) ||
          (j > 0 && outside[k - nx]) || (j < nz - 1 && outside[k + nx])
        ) add.push(k);
      }
    }
    add.forEach((k) => { outside[k] = 1; });
  }

  const insideAt = (x: number, z: number): boolean => {
    if (inAnyRoom(x, z, 0.1)) return true;
    const i = Math.floor((x - gx0) / STEP), j = Math.floor((z - gz0) / STEP);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
    return !outside[j * nx + i];
  };

  // hall = enclosed floor not claimed by any room
  const hallCell = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (outside[k] || core[k]) continue;
      if (inAnyRoom(cellX(i), cellZ(j), 0.14)) continue;
      hallCell[k] = 1;
    }
  }
  // row runs → merge vertically into rects
  type Run = { i0: number; i1: number; j0: number; j1: number };
  let open: Run[] = [];
  const hallRuns: Run[] = [];
  for (let j = 0; j <= nz; j++) {
    const runs: { i0: number; i1: number }[] = [];
    if (j < nz) {
      let s = -1;
      for (let i = 0; i <= nx; i++) {
        const on = i < nx && hallCell[j * nx + i] === 1;
        if (on && s < 0) s = i;
        if (!on && s >= 0) { runs.push({ i0: s, i1: i - 1 }); s = -1; }
      }
    }
    const next: Run[] = [];
    runs.forEach((r) => {
      const m = open.find((o) => o.i0 === r.i0 && o.i1 === r.i1 && o.j1 === j - 1);
      if (m) { m.j1 = j; next.push(m); } else next.push({ ...r, j0: j, j1: j });
    });
    open.forEach((o) => { if (!next.includes(o)) hallRuns.push(o); });
    open = next;
  }
  const hall: Rect[] = hallRuns
    .map((r) => ({
      x0: gx0 + r.i0 * STEP - 0.08, x1: gx0 + (r.i1 + 1) * STEP + 0.08,
      z0: gz0 + r.j0 * STEP - 0.08, z1: gz0 + (r.j1 + 1) * STEP + 0.08,
    }))
    .filter((r) => (r.x1 - r.x0) * (r.z1 - r.z0) >= 0.55 && Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 0.4);

  // ── exterior / interior classification ────────────────────────────────────
  walls.forEach((w) => {
    const off = w.thick / 2 + 0.25;
    const a = insideAt(w.mx + w.nx * off, w.mz + w.nz * off);
    const b = insideAt(w.mx - w.nx * off, w.mz - w.nz * off);
    if (a !== b) {
      w.exterior = true;
      const s = a ? -1 : 1;
      w.outX = w.nx * s;
      w.outZ = w.nz * s;
    }
  });

  // ── per-room side info ────────────────────────────────────────────────────
  const wallCoverage = (side: Side, rect: Rect): number => {
    const horizontal = side === 'N' || side === 'S';
    const line = side === 'N' ? rect.z0 : side === 'S' ? rect.z1 : side === 'W' ? rect.x0 : rect.x1;
    const a0 = horizontal ? rect.x0 : rect.z0;
    const a1 = horizontal ? rect.x1 : rect.z1;
    const n = Math.max(4, Math.round((a1 - a0) / 0.2));
    let hit = 0;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((k + 0.5) / n) * (a1 - a0);
      const px = horizontal ? a : line, pz = horizontal ? line : a;
      if (walls.some((w) => distToSeg(px, pz, w.ax, w.az, w.bx, w.bz) < w.thick / 2 + 0.22)) hit++;
    }
    return hit / n;
  };

  const rooms: PlanRoom[] = roomsRaw.map((r) => {
    const rect = r.rect;
    const mk = (side: Side): SideInfo => {
      const horizontal = side === 'N' || side === 'S';
      const line = side === 'N' ? rect.z0 : side === 'S' ? rect.z1 : side === 'W' ? rect.x0 : rect.x1;
      const a0 = horizontal ? rect.x0 : rect.z0;
      const a1 = horizontal ? rect.x1 : rect.z1;
      const ops: SideInfo['openings'] = [];
      walls.forEach((w) => w.openings.forEach((o) => {
        const lineDist = Math.abs((horizontal ? o.wz : o.wx) - line);
        const along = horizontal ? o.wx : o.wz;
        if (lineDist < 0.5 && along > a0 - 0.1 && along < a1 + 0.1) {
          ops.push({ kind: o.kind, a: along - o.width / 2, b: along + o.width / 2, sill: o.sill, head: o.head });
        }
      }));
      return { side, line, a0, a1, len: a1 - a0, covered: wallCoverage(side, rect), openings: ops };
    };
    return {
      id: r.id, name: r.name, type: r.type, rect,
      cx: (rect.x0 + rect.x1) / 2, cz: (rect.z0 + rect.z1) / 2,
      areaSqft: r.areaSqft,
      sides: { N: mk('N'), S: mk('S'), W: mk('W'), E: mk('E') },
    };
  });

  return { cx, cz, walls, rooms, hall, bounds };
}
