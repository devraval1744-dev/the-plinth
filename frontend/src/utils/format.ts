import type { SearchQuery } from '../types';

export function formatPrice(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatPriceRange(min: number, max: number): string {
  if (min === max) return formatPrice(min);
  return `${formatPrice(min)} – ${formatPrice(max)}`;
}

export function formatArea(sqft: number): string {
  return `${sqft.toLocaleString('en-IN')} sq.ft`;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function getBuilderName(
  builderId: string | { name: string } | undefined
): string {
  if (!builderId) return '—';
  if (typeof builderId === 'object') return builderId.name;
  return '—';
}

export function getPrimaryImage(images?: { url: string; isPrimary: boolean }[], coverImageUrl?: string): string {
  if (coverImageUrl?.trim()) return coverImageUrl.trim();
  if (!images?.length) return '';
  return images.find((i) => i.isPrimary)?.url ?? images[0]?.url ?? '';
}

// ─── Compact money ───────────────────────────────────────────────────────────

/** ₹75 L, ₹1.5 Cr — no trailing zeros (formatPrice keeps two decimals for tables). */
export function formatPriceCompact(amount: number): string {
  if (amount >= 10_000_000) return `₹${parseFloat((amount / 10_000_000).toFixed(2))} Cr`;
  if (amount >= 100_000) return `₹${parseFloat((amount / 100_000).toFixed(1))} L`;
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Visit dates are date-only values stored at 00:00 UTC — always render them in UTC so they never shift a day. */
export function formatVisitDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/** Today's calendar date in India as YYYY-MM-DD (the server validates visit dates against IST). */
export function todayInIndia(offsetDays = 0): string {
  const ist = Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(ist).toISOString().slice(0, 10);
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Search helpers ──────────────────────────────────────────────────────────

/** "Bopal · 2 BHK · under ₹75 L" */
export function searchLabel(q: SearchQuery): string {
  const parts: string[] = [];
  if (q.search) parts.push(`“${q.search}”`);
  if (q.locality) parts.push(q.locality);
  if (q.bhk) parts.push(q.bhk);
  if (q.propertyType) parts.push(q.propertyType);
  if (q.constructionStatus) parts.push(q.constructionStatus);
  if (q.maxPrice && q.minPrice) parts.push(`${formatPriceCompact(q.minPrice)} – ${formatPriceCompact(q.maxPrice)}`);
  else if (q.maxPrice) parts.push(`under ${formatPriceCompact(q.maxPrice)}`);
  else if (q.minPrice) parts.push(`above ${formatPriceCompact(q.minPrice)}`);
  return parts.join(' · ') || 'All properties';
}

/** Query string for /properties that reproduces a search. */
export function searchToQueryString(q: SearchQuery): string {
  const params = new URLSearchParams();
  (Object.entries(q) as [string, string | number | undefined][]).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const s = params.toString();
  return s ? `?${s}` : '';
}
