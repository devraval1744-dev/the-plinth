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
