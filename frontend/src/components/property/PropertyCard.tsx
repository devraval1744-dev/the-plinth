import { Link } from 'react-router-dom';
import SaveButton from './SaveButton';
import { useCompare } from '../../context/CompareContext';
import { formatPriceRange, getBuilderName, getPrimaryImage } from '../../utils/format';
import type { Property } from '../../types';

interface Props {
  property: Property;
  /** Personalised 0–99 fit score; shown as a badge when 40 or above. */
  matchScore?: number | null;
  /** Why this property was picked — shown under the details. */
  reasons?: string[];
  /** Small extra label, e.g. "12 buyers engaged". */
  highlight?: string;
}

const FALLBACK_IMAGE = '/demo/demo_property_1.jpg';

function statusBadge(status: string): string {
  if (status === 'Ready to Move') return 'bg-green-100 text-green-800';
  if (status === 'New Launch') return 'bg-gold-500 text-white';
  return 'bg-navy-800/80 text-cream-100';
}

export default function PropertyCard({ property, matchScore, reasons, highlight }: Props) {
  const compare = useCompare();
  const image = getPrimaryImage(property.images, property.coverImageUrl);
  const bhkLabels = [...new Set((property.bhkConfigurations || []).map((b) => b.type))].join(' · ');
  const builder = getBuilderName(property.builderId);
  const inCompare = compare.has(property._id);

  return (
    <article className="card-hover overflow-hidden group relative flex flex-col h-full">
      <div className="h-48 bg-navy-100 relative overflow-hidden shrink-0">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            onError={(e) => {
              const t = e.currentTarget;
              if (!t.src.includes(FALLBACK_IMAGE)) t.src = FALLBACK_IMAGE;
              else t.style.display = 'none';
            }}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30" aria-hidden="true">🏗️</div>
        )}

        <span className={`badge absolute top-3 left-3 ${statusBadge(property.constructionStatus)}`}>
          {property.constructionStatus}
        </span>

        <div className="absolute top-3 right-3 z-10"><SaveButton propertyId={property._id} /></div>

        {matchScore != null && matchScore >= 40 && (
          <span className="absolute bottom-3 left-3 badge bg-navy-900/90 text-gold-300 gap-1 shadow-card">
            <span aria-hidden="true">✦</span> {matchScore}% match
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            compare.toggle({ id: property._id, name: property.projectName, image });
          }}
          aria-pressed={inCompare}
          className={`absolute bottom-3 right-3 z-10 badge transition-colors shadow-card ${
            inCompare ? 'bg-navy-700 text-cream-100' : 'bg-white/95 text-navy-700 hover:bg-white'
          }`}
        >
          {inCompare ? '✓ Comparing' : '⇄ Compare'}
        </button>
      </div>

      <div className="px-5 py-4 space-y-2 flex-1 flex flex-col">
        <div>
          <h3 className="font-display font-semibold text-navy-900 text-base leading-snug line-clamp-1">
            {/* The stretched link makes the whole card clickable without nesting buttons in an anchor */}
            <Link to={`/properties/${property._id}`} className="after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-navy-500 focus-visible:after:rounded-xl">
              {property.projectName}
            </Link>
          </h3>
          <p className="text-xs text-navy-500 mt-0.5 line-clamp-1">{property.title}</p>
        </div>

        <p className="flex items-center gap-1 text-xs text-navy-500">
          <span aria-hidden="true">📍</span>
          {property.locality}, {property.city}
        </p>

        {bhkLabels && <p className="text-xs text-navy-600 font-medium">{bhkLabels}</p>}

        <div className="flex items-end justify-between pt-1 mt-auto">
          <div>
            <p className="price-text-sm">{formatPriceRange(property.minPrice, property.maxPrice)}</p>
            <p className="text-xs text-navy-400">{property.minArea}–{property.maxArea} sq.ft</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-navy-500 line-clamp-1 max-w-[9rem]">{builder}</p>
            {property.availableUnits > 0 && property.availableUnits <= 20 ? (
              <p className="text-xs text-orange-600 font-medium">Only {property.availableUnits} left</p>
            ) : property.availableUnits > 0 ? (
              <p className="text-xs text-green-600 font-medium">{property.availableUnits} units left</p>
            ) : (
              <p className="text-xs text-red-500 font-medium">Sold out</p>
            )}
          </div>
        </div>

        {highlight && <p className="text-xs font-medium text-gold-600">🔥 {highlight}</p>}

        {reasons && reasons.length > 0 && (
          <ul className="border-t border-navy-100 pt-2.5 mt-1 space-y-1">
            {reasons.slice(0, 2).map((r) => (
              <li key={r} className="text-xs text-navy-600 flex gap-1.5">
                <span className="text-gold-500 shrink-0" aria-hidden="true">✦</span>
                <span className="line-clamp-2">{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
