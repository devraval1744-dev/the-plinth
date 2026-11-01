/**
 * Furniture layout solver.
 *
 * For every room it places a sensible set of furniture against walls / in the
 * open floor, respecting door swing clearance, windows (for tall items) and
 * items that were already placed.  Fully deterministic.
 */
import type { Plan, PlanRoom, Rect, Side, SideInfo } from './plan';
import { rectsOverlap } from './plan';

export type FurnitureKind =
  | 'bed' | 'nightstand' | 'wardrobe' | 'desk'
  | 'sofa' | 'armchair' | 'coffeeTable' | 'tvUnit' | 'sideTable' | 'floorLamp'
  | 'diningTable' | 'sideboard'
  | 'kitchenRun' | 'fridge'
  | 'toilet' | 'vanity' | 'shower'
  | 'washer' | 'shelf'
  | 'plant' | 'rug' | 'balconySet' | 'railing' | 'mirror';

export interface Placed {
  kind: FurnitureKind;
  x: number; z: number;     // world position (origin: back-centre on a wall, or centre if free-standing)
  rot: number;              // rotation.y
  w: number; d: number;     // footprint (width along the wall, depth into the room)
  h?: number;
  roomId: string;
  variant?: number;
  freeStanding?: boolean;   // origin is the footprint centre
}

const INSET = 0.11; // distance from room-rect line (wall centre) to the finished wall face

const ROT: Record<Side, number> = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

function footprint(room: PlanRoom, side: Side, along: number, w: number, d: number): Rect {
  const r = room.rect;
  switch (side) {
    case 'N': return { x0: along - w / 2, x1: along + w / 2, z0: r.z0 + INSET, z1: r.z0 + INSET + d };
    case 'S': return { x0: along - w / 2, x1: along + w / 2, z0: r.z1 - INSET - d, z1: r.z1 - INSET };
    case 'W': return { x0: r.x0 + INSET, x1: r.x0 + INSET + d, z0: along - w / 2, z1: along + w / 2 };
    case 'E': return { x0: r.x1 - INSET - d, x1: r.x1 - INSET, z0: along - w / 2, z1: along + w / 2 };
  }
}

function wallPoint(room: PlanRoom, side: Side, along: number): { x: number; z: number } {
  const r = room.rect;
  switch (side) {
    case 'N': return { x: along, z: r.z0 + INSET };
    case 'S': return { x: along, z: r.z1 - INSET };
    case 'W': return { x: r.x0 + INSET, z: along };
    case 'E': return { x: r.x1 - INSET, z: along };
  }
}

class RoomCtx {
  placed: Placed[] = [];
  obstacles: Rect[] = [];          // placed furniture + clearances
  tallBlockers: Rect[] = [];       // windows (block tall items only)

  constructor(public room: PlanRoom) {
    (['N', 'S', 'W', 'E'] as Side[]).forEach((s) => {
      const info = room.sides[s];
      info.openings.forEach((o) => {
        const c = (o.a + o.b) / 2;
        const w = o.b - o.a;
        if (o.kind === 'door' || o.kind === 'slider') {
          this.obstacles.push(footprint(room, s, c, w + 0.1, o.kind === 'door' ? 0.95 : 0.8));
        } else {
          this.tallBlockers.push(footprint(room, s, c, w + 0.1, 0.45));
        }
      });
    });
  }

  inner(): Rect {
    const r = this.room.rect;
    return { x0: r.x0 + INSET, x1: r.x1 - INSET, z0: r.z0 + INSET, z1: r.z1 - INSET };
  }

  fits(f: Rect, tall: boolean, gap = 0.03): boolean {
    const i = this.inner();
    if (f.x0 < i.x0 - 0.02 || f.x1 > i.x1 + 0.02 || f.z0 < i.z0 - 0.02 || f.z1 > i.z1 + 0.02) return false;
    if (this.obstacles.some((o) => rectsOverlap(f, o, -gap))) return false;
    if (tall && this.tallBlockers.some((o) => rectsOverlap(f, o, -gap))) return false;
    return true;
  }

  add(p: Placed, f: Rect) {
    this.placed.push(p);
    this.obstacles.push(f);
  }
}

type AlongPref = 'center' | 'start' | 'end';

/** Try to put a w×d item against `side`, scanning along the wall. */
function tryWall(
  ctx: RoomCtx, kind: FurnitureKind, side: Side, w: number, d: number,
  opts: { h?: number; pref?: AlongPref | number; tall?: boolean; variant?: number; step?: number } = {},
): Placed | null {
  const info = ctx.room.sides[side];
  const lo = info.a0 + INSET + w / 2, hi = info.a1 - INSET - w / 2;
  if (hi < lo - 0.01) return null;
  const mid = (info.a0 + info.a1) / 2;
  const target = typeof opts.pref === 'number' ? opts.pref
    : opts.pref === 'start' ? lo : opts.pref === 'end' ? hi : mid;
  const cands: number[] = [];
  for (let a = lo; a <= hi + 0.001; a += opts.step ?? 0.1) cands.push(a);
  if (!cands.length) cands.push((lo + hi) / 2);
  cands.sort((p, q) => Math.abs(p - target) - Math.abs(q - target));
  for (const a of cands) {
    const f = footprint(ctx.room, side, a, w, d);
    if (ctx.fits(f, !!opts.tall)) {
      const p = wallPoint(ctx.room, side, a);
      const placed: Placed = { kind, x: p.x, z: p.z, rot: ROT[side], w, d, h: opts.h, roomId: ctx.room.id, variant: opts.variant };
      ctx.add(placed, f);
      return placed;
    }
  }
  return null;
}

/** Sides ordered by how suitable they are for hugging a wall. */
function sideOrder(room: PlanRoom, opts: { noDoor?: boolean; noWindow?: boolean; minCovered?: number } = {}): Side[] {
  const sides = (['N', 'S', 'W', 'E'] as Side[]).map((s) => room.sides[s]);
  return sides
    .filter((s) => (s.covered >= (opts.minCovered ?? 0.55)))
    .filter((s) => !(opts.noDoor && s.openings.some((o) => o.kind !== 'window')))
    .filter((s) => !(opts.noWindow && s.openings.some((o) => o.kind === 'window')))
    .sort((a, b) => b.len - a.len)
    .map((s) => s.side);
}

function tryCorner(
  ctx: RoomCtx, kind: FurnitureKind, w: number, d: number,
  opts: { h?: number; tall?: boolean; variant?: number } = {},
): Placed | null {
  const r = ctx.room.rect;
  const corners: { side: Side; pref: AlongPref }[] = [
    { side: 'N', pref: 'start' }, { side: 'N', pref: 'end' },
    { side: 'S', pref: 'start' }, { side: 'S', pref: 'end' },
  ];
  // prefer corners far from any door
  const doors = (['N', 'S', 'W', 'E'] as Side[]).flatMap((s) =>
    ctx.room.sides[s].openings.filter((o) => o.kind === 'door').map((o) => {
      const c = (o.a + o.b) / 2;
      return s === 'N' || s === 'S' ? { x: c, z: ctx.room.sides[s].line } : { x: ctx.room.sides[s].line, z: c };
    }));
  const score = (c: { side: Side; pref: AlongPref }) => {
    const x = c.pref === 'start' ? r.x0 : r.x1;
    const z = c.side === 'N' ? r.z0 : r.z1;
    return doors.length ? -Math.min(...doors.map((p) => Math.hypot(p.x - x, p.z - z))) : 0;
  };
  corners.sort((a, b) => score(a) - score(b));
  for (const c of corners) {
    const p = tryWall(ctx, kind, c.side, w, d, { ...opts, pref: c.pref });
    if (p) return p;
  }
  return null;
}

/** Free-standing item centred at (cx,cz) – returns null when it collides. */
function tryFree(
  ctx: RoomCtx, kind: FurnitureKind, cx: number, cz: number, w: number, d: number, rot: number,
  opts: { h?: number; tall?: boolean; variant?: number; noCollide?: boolean } = {},
): Placed | null {
  const swap = Math.abs(Math.sin(rot)) > 0.5;
  const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
  const f: Rect = { x0: cx - hw, x1: cx + hw, z0: cz - hd, z1: cz + hd };
  if (!opts.noCollide && !ctx.fits(f, !!opts.tall)) return null;
  const p: Placed = { kind, x: cx, z: cz, rot, w, d, h: opts.h, roomId: ctx.room.id, variant: opts.variant, freeStanding: true };
  if (opts.noCollide) ctx.placed.push(p); else ctx.add(p, f);
  return p;
}

/** Centre of the free floor in front of a wall-hugging item. */
function frontOf(p: Placed, dist: number): { x: number; z: number } {
  // local +z is the item's front: (sin rot, cos rot)
  return { x: p.x + Math.sin(p.rot) * dist, z: p.z + Math.cos(p.rot) * dist };
}

const opposite: Record<Side, Side> = { N: 'S', S: 'N', W: 'E', E: 'W' };
const sideOfRot = (rot: number): Side =>
  Math.abs(rot) < 0.1 ? 'N' : Math.abs(Math.abs(rot) - Math.PI) < 0.1 ? 'S' : rot > 0 ? 'W' : 'E';

// ─── per-room layouts ────────────────────────────────────────────────────────

function layoutBedroom(ctx: RoomCtx) {
  const room = ctx.room;
  const small = Math.min(room.rect.x1 - room.rect.x0, room.rect.z1 - room.rect.z0) < 2.9;
  const sizes: [number, number][] = small ? [[1.4, 1.95], [1.2, 1.9]] : [[1.8, 2.05], [1.6, 2.0], [1.4, 1.95]];

  let bed: Placed | null = null;
  const tiers = [
    sideOrder(room, { noDoor: true, noWindow: true }),
    sideOrder(room, { noDoor: true }),
    sideOrder(room, { minCovered: 0.3 }),
  ];
  outer: for (const sides of tiers) {
    for (const [bw, bd] of sizes) {
      for (const s of sides) {
        bed = tryWall(ctx, 'bed', s, bw, bd, { pref: 'center', step: 0.1 });
        if (bed) break outer;
      }
    }
  }
  if (bed) {
    const side = sideOfRot(bed.rot);
    const alongC = side === 'N' || side === 'S' ? bed.x : bed.z;
    const rugC = frontOf(bed, bed.d * 0.62);
    tryFree(ctx, 'rug', rugC.x, rugC.z, bed.w + 0.9, bed.d * 0.7, bed.rot, { noCollide: true });
    [-1, 1].forEach((k) => {
      tryWall(ctx, 'nightstand', side, 0.42, 0.38, { pref: alongC + k * (bed!.w / 2 + 0.3), h: 0.45, step: 0.05 });
    });
  }

  // wardrobe on a wall without openings (prefer one that isn't the bed wall)
  const bedSide = bed ? sideOfRot(bed.rot) : null;
  const wSides = sideOrder(room, { noDoor: true, noWindow: true }).filter((s) => s !== bedSide);
  const ww = Math.min(1.8, Math.max(1.2, (room.rect.x1 - room.rect.x0) * 0.5));
  let wardrobe: Placed | null = null;
  for (const s of wSides) {
    wardrobe = tryWall(ctx, 'wardrobe', s, ww, 0.6, { h: 2.1, tall: true, pref: 'end' })
      ?? tryWall(ctx, 'wardrobe', s, 1.2, 0.6, { h: 2.1, tall: true, pref: 'end' });
    if (wardrobe) break;
  }
  if (!wardrobe) {
    for (const s of sideOrder(room, { noDoor: true, minCovered: 0.3 })) {
      wardrobe = tryWall(ctx, 'wardrobe', s, 1.2, 0.58, { h: 2.1, tall: true, pref: 'end' });
      if (wardrobe) break;
    }
  }
  // a little desk if the room is generous
  if (room.areaSqft > 120) {
    for (const s of sideOrder(room, { noDoor: true })) {
      if (tryWall(ctx, 'desk', s, 1.2, 0.55, { h: 0.75, pref: 'center' })) break;
    }
  }
  tryCorner(ctx, 'plant', 0.4, 0.4, { h: 1.0 });
}

function layoutLiving(ctx: RoomCtx) {
  const room = ctx.room;
  const small = Math.min(room.rect.x1 - room.rect.x0, room.rect.z1 - room.rect.z0) < 2.6;
  const sofaW = small ? 1.7 : 2.1;
  let sofa: Placed | null = null;
  const tiers = [sideOrder(room, { noDoor: true, noWindow: true }), sideOrder(room, { noDoor: true }), sideOrder(room, { minCovered: 0.3 })];
  outer: for (const sides of tiers) {
    for (const w of [sofaW, 1.7, 1.4]) {
      for (const s of sides) {
        sofa = tryWall(ctx, 'sofa', s, w, 0.92, { pref: 'center', h: 0.85 });
        if (sofa) break outer;
      }
    }
  }
  if (sofa) {
    const c = frontOf(sofa, 1.35);
    tryFree(ctx, 'rug', c.x, c.z, 2.2, 1.6, sofa.rot, { noCollide: true });
    const ct = frontOf(sofa, 1.45);
    tryFree(ctx, 'coffeeTable', ct.x, ct.z, 1.0, 0.55, sofa.rot, { h: 0.4 });

    const side = sideOfRot(sofa.rot);
    const alongC = side === 'N' || side === 'S' ? sofa.x : sofa.z;
    tryWall(ctx, 'sideTable', side, 0.45, 0.45, { pref: alongC + sofa.w / 2 + 0.32, h: 0.5, step: 0.05 });
    tryWall(ctx, 'floorLamp', side, 0.35, 0.35, { pref: alongC - sofa.w / 2 - 0.3, h: 1.6, step: 0.05 });

    // TV unit on the opposite wall
    const opp = opposite[side];
    if (room.sides[opp].covered >= 0.5) {
      tryWall(ctx, 'tvUnit', opp, 1.6, 0.4, { pref: 'center', h: 0.5 });
    }
  }
  // armchair + plant for larger rooms
  if (room.areaSqft > 140) {
    for (const s of sideOrder(room, { noDoor: true })) {
      if (tryWall(ctx, 'armchair', s, 0.85, 0.85, { pref: 'start', h: 0.8 })) break;
    }
  }
  tryCorner(ctx, 'plant', 0.45, 0.45, { h: 1.2, variant: 1 });
}

function layoutDining(ctx: RoomCtx) {
  const room = ctx.room;
  const r = room.rect;
  const W = r.x1 - r.x0, D = r.z1 - r.z0;
  const long = W >= D;
  const tw = Math.min(1.8, Math.max(1.2, (long ? W : D) - 1.8));
  tryFree(ctx, 'diningTable', room.cx, room.cz, tw, 0.9, long ? 0 : Math.PI / 2, { h: 0.75, variant: Math.round(tw / 0.6) });
  for (const s of sideOrder(room, { noDoor: true, noWindow: true })) {
    if (tryWall(ctx, 'sideboard', s, 1.3, 0.4, { pref: 'center', h: 0.85 })) break;
  }
  tryCorner(ctx, 'plant', 0.4, 0.4, { h: 1.1 });
}

function layoutKitchen(ctx: RoomCtx) {
  const room = ctx.room;
  const minD = Math.min(room.rect.x1 - room.rect.x0, room.rect.z1 - room.rect.z0);
  // primary run: a covered wall, prefer one with a window (sink under window)
  const ordered = (['N', 'S', 'W', 'E'] as Side[])
    .map((s) => room.sides[s])
    .filter((s) => s.covered >= 0.5 && !s.openings.some((o) => o.kind === 'door' || o.kind === 'slider'))
    .sort((a, b) => {
      const aw = a.openings.some((o) => o.kind === 'window') ? 1 : 0;
      const bw = b.openings.some((o) => o.kind === 'window') ? 1 : 0;
      return bw - aw || b.len - a.len;
    });
  let primary: Placed | null = null;
  let primarySide: SideInfo | null = null;
  for (const s of ordered) {
    const len = Math.min(3.4, s.len - 0.3 - (minD > 2 ? 0.75 : 0));
    if (len < 1.5) continue;
    primary = tryWall(ctx, 'kitchenRun', s.side, len, 0.62, { h: 0.9, pref: 'center' });
    if (primary) { primarySide = s; break; }
  }
  if (primary && primarySide) {
    const side = primarySide.side;
    tryWall(ctx, 'fridge', side, 0.75, 0.72, { h: 1.85, pref: 'end', tall: true })
      ?? tryWall(ctx, 'fridge', side, 0.75, 0.72, { h: 1.85, pref: 'start', tall: true });
    // second leg of an L along a perpendicular wall
    const perp = ordered.filter((s) => s.side !== side && s.side !== opposite[side]);
    for (const s of perp) {
      const len = Math.min(2.2, s.len - 0.9);
      if (len < 1.0) continue;
      if (tryWall(ctx, 'kitchenRun', s.side, len, 0.62, { h: 0.9, pref: 'center', variant: 1 })) break;
    }
  } else {
    // fall back: any covered wall without a door
    for (const s of sideOrder(room, { noDoor: true, minCovered: 0.3 })) {
      if (tryWall(ctx, 'kitchenRun', s, Math.min(2.6, room.sides[s].len - 0.4), 0.62, { h: 0.9, pref: 'center' })) break;
    }
  }
}

function layoutBathroom(ctx: RoomCtx) {
  const room = ctx.room;
  const W = room.rect.x1 - room.rect.x0, D = room.rect.z1 - room.rect.z0;
  if (W > 1.3 && D > 1.7) tryCorner(ctx, 'shower', 0.9, 0.9, { h: 2.0, tall: true });
  const sides = sideOrder(room, { noDoor: true, noWindow: true, minCovered: 0.4 });
  let toilet: Placed | null = null;
  for (const s of sides) {
    toilet = tryWall(ctx, 'toilet', s, 0.42, 0.72, { h: 0.8, pref: 'center' });
    if (toilet) break;
  }
  for (const s of [...sides, ...sideOrder(room, { noDoor: true, minCovered: 0.4 })]) {
    const v = tryWall(ctx, 'vanity', s, 0.65, 0.46, { h: 0.85, pref: 'center' });
    if (v) {
      ctx.placed.push({ kind: 'mirror', x: v.x, z: v.z, rot: v.rot, w: 0.55, d: 0.03, h: 0.8, roomId: room.id });
      break;
    }
  }
}

function layoutUtility(ctx: RoomCtx) {
  const room = ctx.room;
  const sides = sideOrder(room, { noDoor: true, minCovered: 0.4 });
  for (const s of sides) {
    if (tryWall(ctx, 'washer', s, 0.6, 0.62, { h: 0.85, pref: 'start' })) break;
  }
  for (const s of sides) {
    if (tryWall(ctx, 'shelf', s, 0.8, 0.35, { h: 1.8, pref: 'end', tall: true })) break;
  }
}

function layoutBalcony(ctx: RoomCtx) {
  const room = ctx.room;
  // railings on every side that has no wall behind it
  (['N', 'S', 'W', 'E'] as Side[]).forEach((s) => {
    const info = room.sides[s];
    if (info.covered < 0.45) {
      const p = wallPoint(room, s, (info.a0 + info.a1) / 2);
      // railing sits on the room edge, not inset
      const edge = s === 'N' ? { x: p.x, z: room.rect.z0 } : s === 'S' ? { x: p.x, z: room.rect.z1 }
        : s === 'W' ? { x: room.rect.x0, z: p.z } : { x: room.rect.x1, z: p.z };
      ctx.placed.push({ kind: 'railing', x: edge.x, z: edge.z, rot: ROT[s], w: info.len, d: 0.05, h: 1.05, roomId: room.id });
    }
  });
  // bistro set
  const W = room.rect.x1 - room.rect.x0, D = room.rect.z1 - room.rect.z0;
  if (W > 1.4 && D > 0.9) {
    tryFree(ctx, 'balconySet', room.cx, room.cz, Math.min(1.3, W - 0.6), Math.min(0.8, D - 0.3), 0, { h: 0.8 });
  }
  tryCorner(ctx, 'plant', 0.35, 0.35, { h: 0.9, variant: 2 });
}

// ─── public entry ────────────────────────────────────────────────────────────

export function layoutFurniture(plan: Plan): Placed[] {
  const out: Placed[] = [];
  plan.rooms.forEach((room) => {
    const ctx = new RoomCtx(room);
    switch (room.type) {
      case 'bedroom':     layoutBedroom(ctx); break;
      case 'living_room': layoutLiving(ctx); break;
      case 'dining':      layoutDining(ctx); break;
      case 'kitchen':     layoutKitchen(ctx); break;
      case 'bathroom':    layoutBathroom(ctx); break;
      case 'utility':     layoutUtility(ctx); break;
      case 'balcony':     layoutBalcony(ctx); break;
      default: break;
    }
    out.push(...ctx.placed);
  });

  // un-labelled hall / corridor space: a console, a plant and (if roomy) a dining set
  const hasDining = plan.rooms.some((r) => r.type === 'dining');
  const biggest = [...plan.hall].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
  if (biggest) {
    const w = biggest.x1 - biggest.x0, d = biggest.z1 - biggest.z0;
    const cx = (biggest.x0 + biggest.x1) / 2, cz = (biggest.z0 + biggest.z1) / 2;
    if (!hasDining && w > 2.4 && d > 2.4) {
      out.push({ kind: 'diningTable', x: cx, z: cz, rot: w >= d ? 0 : Math.PI / 2, w: 1.6, d: 0.9, h: 0.75, roomId: 'hall', variant: 3, freeStanding: true });
    } else if (Math.min(w, d) > 0.9) {
      out.push({ kind: 'plant', x: biggest.x0 + 0.4, z: biggest.z0 + 0.4, rot: 0, w: 0.4, d: 0.4, h: 1.2, roomId: 'hall', variant: 1, freeStanding: true });
      if (w * d > 2.5 && Math.min(w, d) > 1.4) {
        out.push({ kind: 'rug', x: cx, z: cz, rot: w >= d ? 0 : Math.PI / 2, w: Math.min(w, d) * 0.55 + 0.4, d: Math.min(w, d) * 0.55, roomId: 'hall', freeStanding: true });
        out.push({ kind: 'plant', x: biggest.x1 - 0.4, z: biggest.z1 - 0.4, rot: 0, w: 0.4, d: 0.4, h: 1.0, roomId: 'hall', variant: 0, freeStanding: true });
      }
    }
  }
  return out;
}
