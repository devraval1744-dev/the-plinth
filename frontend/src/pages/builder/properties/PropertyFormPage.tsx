import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import LoadingSpinner from '../../../components/ui/LoadingSpinner';
import AlertMessage from '../../../components/ui/AlertMessage';
import PropertyStatusBadge from '../../../components/property/PropertyStatusBadge';
import LocationPickerMap from '../../../components/location/LocationPickerMap';
import {
  createPropertyApi,
  updatePropertyApi,
  uploadCoverImageApi,
  submitPropertyApi,
  getMyPropertyByIdApi,
} from '../../../api/properties.api';
import { getErrorMessage, getFieldErrors } from '../../../api/client';
import {
  PROPERTY_TYPES,
  CONSTRUCTION_STATUSES,
  BHK_TYPES,
  AHMEDABAD_LOCALITIES,
} from '../../../types';
import type { PropertyFormData, BHKConfigForm, Property } from '../../../types';

const COMMON_AMENITIES = [
  'Lift', 'Parking', 'Swimming Pool', 'Gymnasium', 'Club House',
  'Power Backup', 'CCTV', 'Security', 'Garden / Landscaping',
  'Children\'s Play Area', 'Jogging Track', 'Indoor Games',
  'Community Hall', 'Intercom', 'Water Softener', 'Solar Panels',
];

const EMPTY_BHK: BHKConfigForm = { type: '', areaSqFt: '', priceMin: '', priceMax: '', totalUnits: '', availableUnits: '' };

const INITIAL_FORM: PropertyFormData = {
  title: '', projectName: '', description: '', propertyType: '',
  locality: '', city: 'Ahmedabad', state: 'Gujarat', address: '',
  latitude: '', longitude: '',
  minPrice: '', maxPrice: '', minArea: '', maxArea: '',
  totalUnits: '', availableUnits: '',
  constructionStatus: '', possessionDate: '',
  amenities: '',
  bhkConfigurations: [{ ...EMPTY_BHK }],
};

function propertyToForm(p: Property): PropertyFormData {
  return {
    title: p.title,
    projectName: p.projectName,
    description: p.description,
    propertyType: p.propertyType,
    locality: p.locality,
    city: p.city,
    state: p.state,
    address: p.address,
    latitude: p.latitude?.toString() ?? '',
    longitude: p.longitude?.toString() ?? '',
    minPrice: p.minPrice.toString(),
    maxPrice: p.maxPrice.toString(),
    minArea: p.minArea.toString(),
    maxArea: p.maxArea.toString(),
    totalUnits: p.totalUnits.toString(),
    availableUnits: p.availableUnits.toString(),
    constructionStatus: p.constructionStatus,
    possessionDate: p.possessionDate ? p.possessionDate.slice(0, 10) : '',
    amenities: p.amenities.join(', '),
    bhkConfigurations: p.bhkConfigurations.length > 0
      ? p.bhkConfigurations.map((b) => ({
          type: b.type, areaSqFt: b.areaSqFt.toString(),
          priceMin: b.priceMin.toString(), priceMax: b.priceMax.toString(),
          totalUnits: b.totalUnits.toString(), availableUnits: b.availableUnits.toString(),
        }))
      : [{ ...EMPTY_BHK }],
  };
}

function formToPayload(form: PropertyFormData) {
  return {
    title: form.title,
    projectName: form.projectName,
    description: form.description,
    propertyType: form.propertyType,
    locality: form.locality,
    city: form.city,
    state: form.state,
    address: form.address,
    ...(form.latitude ? { latitude: Number(form.latitude) } : {}),
    ...(form.longitude ? { longitude: Number(form.longitude) } : {}),
    minPrice: Number(form.minPrice),
    maxPrice: Number(form.maxPrice),
    minArea: Number(form.minArea),
    maxArea: Number(form.maxArea),
    totalUnits: Number(form.totalUnits),
    availableUnits: Number(form.availableUnits),
    constructionStatus: form.constructionStatus,
    ...(form.possessionDate ? { possessionDate: form.possessionDate } : {}),
    amenities: form.amenities
      ? form.amenities.split(',').map((a) => a.trim()).filter(Boolean)
      : [],
    bhkConfigurations: form.bhkConfigurations
      .filter((b) => b.type)
      .map((b) => ({
        type: b.type,
        areaSqFt: Number(b.areaSqFt),
        priceMin: Number(b.priceMin),
        priceMax: Number(b.priceMax),
        totalUnits: Number(b.totalUnits),
        availableUnits: Number(b.availableUnits),
      })),
  };
}

export default function PropertyFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [form, setForm] = useState<PropertyFormData>(INITIAL_FORM);
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState<string>('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getMyPropertyByIdApi(id)
      .then((p) => {
        setProperty(p);
        const f = propertyToForm(p);
        setForm(f);
        setSelectedAmenities(p.amenities);
        const existingCover = p.coverImageUrl || p.images?.find((img) => img.isPrimary)?.url || p.images?.[0]?.url || '';
        if (existingCover) {
          setCoverImagePreview(existingCover);
        }
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setIsLoading(false));
  }, [id]);

  const set = (field: keyof PropertyFormData) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (fieldErrors[field]) setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
    };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file format. Please upload a JPG, JPEG, PNG, or WEBP image.');
      return;
    }

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image file too large. Maximum size is 10 MB.');
      return;
    }

    setError('');
    setCoverImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setCoverImagePreview(objectUrl);
  };

  const toggleAmenity = (amenity: string) => {
    setSelectedAmenities((prev) => {
      const next = prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity];
      setForm((f) => ({ ...f, amenities: next.join(', ') }));
      return next;
    });
  };

  const setBHK = (index: number, field: keyof BHKConfigForm) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => {
        const bhk = [...prev.bhkConfigurations];
        bhk[index] = { ...bhk[index], [field]: e.target.value };
        return { ...prev, bhkConfigurations: bhk };
      });
    };

  const addBHK = () => setForm((prev) => ({ ...prev, bhkConfigurations: [...prev.bhkConfigurations, { ...EMPTY_BHK }] }));
  const removeBHK = (i: number) => setForm((prev) => ({ ...prev, bhkConfigurations: prev.bhkConfigurations.filter((_, idx) => idx !== i) }));

  const isReadOnly = property
    ? property.status === 'SUBMITTED' || property.status === 'REJECTED'
    : false;

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setFieldErrors({}); setSuccess('');
    setIsSaving(true);
    try {
      const payload = formToPayload(form);
      let saved: Property;
      if (isEdit && id) {
        saved = await updatePropertyApi(id, payload);
      } else {
        saved = await createPropertyApi(payload);
      }

      // If a cover image file was selected, upload it now
      if (coverImageFile) {
        try {
          setIsUploadingImage(true);
          const uploadRes = await uploadCoverImageApi(saved._id, coverImageFile);
          saved = uploadRes.property;
          setCoverImagePreview(uploadRes.coverImageUrl);
          setCoverImageFile(null);
        } catch (imgErr) {
          setError(`Property saved, but image upload failed: ${getErrorMessage(imgErr)}`);
          setProperty(saved);
          if (!isEdit) navigate(`/builder/properties/${saved._id}/edit`, { replace: true });
          return;
        } finally {
          setIsUploadingImage(false);
        }
      }

      setProperty(saved);
      setSuccess('Property saved successfully.');
      if (!isEdit) navigate(`/builder/properties/${saved._id}/edit`, { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
      setFieldErrors(getFieldErrors(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!property) return;

    // Check if property has cover image
    const hasImage = Boolean(
      coverImageFile ||
      property.coverImageUrl ||
      property.images?.some((img) => img.url)
    );

    if (!hasImage) {
      setError('Property cover image is required before submission.');
      return;
    }

    if (!window.confirm('Submit this property for admin review? You won\'t be able to edit it until reviewed.')) return;
    setIsSubmitting(true);
    try {
      // If user selected a new image without clicking save first, upload it before submitting
      if (coverImageFile) {
        setIsUploadingImage(true);
        const uploadRes = await uploadCoverImageApi(property._id, coverImageFile);
        setProperty(uploadRes.property);
        setCoverImagePreview(uploadRes.coverImageUrl);
        setCoverImageFile(null);
      }

      const updated = await submitPropertyApi(property._id);
      setProperty(updated);
      setSuccess('Property submitted for admin review.');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsSubmitting(false);
      setIsUploadingImage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-200"><Navbar />
        <div className="flex items-center justify-center py-32"><LoadingSpinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-200">
      <Navbar />
      <main className="page-container py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div>
            <button onClick={() => navigate('/builder/properties')} className="text-navy-500 hover:text-navy-800 text-sm mb-1 block">← My Listings</button>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-semibold text-navy-900">
                {isEdit ? 'Edit Property' : 'New Property'}
              </h1>
              {property && <PropertyStatusBadge status={property.status} />}
            </div>
          </div>
          {property && (property.status === 'DRAFT' || property.status === 'CHANGES_REQUESTED' || property.status === 'APPROVED') && (
            <button onClick={handleSubmitForReview} disabled={isSubmitting} className="btn-gold btn">
              {isSubmitting ? <><LoadingSpinner size="sm" /> Submitting…</> : '↑ Submit for Review'}
            </button>
          )}
        </div>

        {property?.status === 'APPROVED' && (
          <AlertMessage
            type="info"
            message="This property is currently live and visible to customers. Saving changes will require admin re-approval before the updated information becomes public. Customers will continue seeing the current version until the update is approved."
            className="mb-6"
          />
        )}
        {property?.status === 'CHANGES_REQUESTED' && property.adminNotes && (
          <AlertMessage type="warning" message={`Admin requested changes: ${property.adminNotes}`} className="mb-6" />
        )}
        {property?.status === 'REJECTED' && property.rejectionReason && (
          <AlertMessage type="error" message={`Rejected: ${property.rejectionReason}`} className="mb-6" />
        )}
        {error && <AlertMessage type="error" message={error} className="mb-6" />}
        {success && <AlertMessage type="success" message={success} className="mb-6" />}

        <form onSubmit={handleSave} noValidate className="space-y-6 max-w-4xl">

          {/* ── Basic Information ──────────────────────────────────────────── */}
          <Section title="Basic Information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Project name *" error={fieldErrors.projectName}>
                <input className={`input ${fieldErrors.projectName ? 'input-error' : ''}`}
                  value={form.projectName} onChange={set('projectName')}
                  placeholder="Shivalay Heights" disabled={isReadOnly} />
              </Field>
              <Field label="Property title *" error={fieldErrors.title}>
                <input className={`input ${fieldErrors.title ? 'input-error' : ''}`}
                  value={form.title} onChange={set('title')}
                  placeholder="Luxurious 3 BHK Apartments in Bopal" disabled={isReadOnly} />
              </Field>
              <Field label="Property type *" error={fieldErrors.propertyType}>
                <select className={`input ${fieldErrors.propertyType ? 'input-error' : ''}`}
                  value={form.propertyType} onChange={set('propertyType')} disabled={isReadOnly}>
                  <option value="">Select type</option>
                  {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description * (min 50 chars)" error={fieldErrors.description}>
                  <textarea rows={4} className={`input resize-none ${fieldErrors.description ? 'input-error' : ''}`}
                    value={form.description} onChange={set('description')}
                    placeholder="Describe the project — its highlights, features, surroundings, and vision."
                    disabled={isReadOnly} />
                  <p className="text-xs text-navy-400 mt-1">{form.description.length}/5000</p>
                </Field>
              </div>
            </div>
          </Section>

          {/* ── Location ──────────────────────────────────────────────────── */}
          <Section title="Location">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Locality *" error={fieldErrors.locality}>
                <select className={`input ${fieldErrors.locality ? 'input-error' : ''}`}
                  value={form.locality} onChange={set('locality')} disabled={isReadOnly}>
                  <option value="">Select locality</option>
                  {AHMEDABAD_LOCALITIES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="City *" error={fieldErrors.city}>
                <input className={`input ${fieldErrors.city ? 'input-error' : ''}`}
                  value={form.city} onChange={set('city')} disabled={isReadOnly} />
              </Field>
              <Field label="State *" error={fieldErrors.state}>
                <input className={`input ${fieldErrors.state ? 'input-error' : ''}`}
                  value={form.state} onChange={set('state')} disabled={isReadOnly} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Full address *" error={fieldErrors.address}>
                  <input className={`input ${fieldErrors.address ? 'input-error' : ''}`}
                    value={form.address} onChange={set('address')}
                    placeholder="Plot 12, Near Bopal Circle, Bopal, Ahmedabad 380058"
                    disabled={isReadOnly} />
                </Field>
              </div>
              <Field label="Latitude (optional)">
                <input type="number" step="any" className="input" value={form.latitude}
                  onChange={set('latitude')} placeholder="23.0225" disabled={isReadOnly} />
              </Field>
              <Field label="Longitude (optional)">
                <input type="number" step="any" className="input" value={form.longitude}
                  onChange={set('longitude')} placeholder="72.5714" disabled={isReadOnly} />
              </Field>
              <div className="sm:col-span-2 pt-2">
                <LocationPickerMap
                  latitude={form.latitude ? parseFloat(form.latitude) : null}
                  longitude={form.longitude ? parseFloat(form.longitude) : null}
                  onChange={(lat, lng) => {
                    setForm((prev) => ({
                      ...prev,
                      latitude: lat.toString(),
                      longitude: lng.toString(),
                    }));
                  }}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </Section>

          {/* ── Pricing & Area ─────────────────────────────────────────────── */}
          <Section title="Pricing & Area">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <Field label="Min price (₹) *" error={fieldErrors.minPrice}>
                <input type="number" min="0" className={`input ${fieldErrors.minPrice ? 'input-error' : ''}`}
                  value={form.minPrice} onChange={set('minPrice')} placeholder="5000000" disabled={isReadOnly} />
              </Field>
              <Field label="Max price (₹) *" error={fieldErrors.maxPrice}>
                <input type="number" min="0" className={`input ${fieldErrors.maxPrice ? 'input-error' : ''}`}
                  value={form.maxPrice} onChange={set('maxPrice')} placeholder="9000000" disabled={isReadOnly} />
              </Field>
              <Field label="Min area (sq.ft) *" error={fieldErrors.minArea}>
                <input type="number" min="0" className={`input ${fieldErrors.minArea ? 'input-error' : ''}`}
                  value={form.minArea} onChange={set('minArea')} placeholder="900" disabled={isReadOnly} />
              </Field>
              <Field label="Max area (sq.ft) *" error={fieldErrors.maxArea}>
                <input type="number" min="0" className={`input ${fieldErrors.maxArea ? 'input-error' : ''}`}
                  value={form.maxArea} onChange={set('maxArea')} placeholder="1600" disabled={isReadOnly} />
              </Field>
              <Field label="Total units *" error={fieldErrors.totalUnits}>
                <input type="number" min="1" className={`input ${fieldErrors.totalUnits ? 'input-error' : ''}`}
                  value={form.totalUnits} onChange={set('totalUnits')} placeholder="120" disabled={isReadOnly} />
              </Field>
              <Field label="Available units *" error={fieldErrors.availableUnits}>
                <input type="number" min="0" className={`input ${fieldErrors.availableUnits ? 'input-error' : ''}`}
                  value={form.availableUnits} onChange={set('availableUnits')} placeholder="84" disabled={isReadOnly} />
              </Field>
            </div>
          </Section>

          {/* ── BHK Configurations ─────────────────────────────────────────── */}
          <Section title="Unit Configurations (BHK)">
            <div className="space-y-4">
              {form.bhkConfigurations.map((bhk, i) => (
                <div key={i} className="bg-cream-100 rounded-lg px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-navy-700">Unit type {i + 1}</span>
                    {form.bhkConfigurations.length > 1 && !isReadOnly && (
                      <button type="button" onClick={() => removeBHK(i)}
                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Field label="BHK type">
                      <select className="input" value={bhk.type} onChange={setBHK(i, 'type')} disabled={isReadOnly}>
                        <option value="">Select</option>
                        {BHK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Area (sq.ft)">
                      <input type="number" className="input" value={bhk.areaSqFt}
                        onChange={setBHK(i, 'areaSqFt')} placeholder="1200" disabled={isReadOnly} />
                    </Field>
                    <Field label="Price from (₹)">
                      <input type="number" className="input" value={bhk.priceMin}
                        onChange={setBHK(i, 'priceMin')} placeholder="6500000" disabled={isReadOnly} />
                    </Field>
                    <Field label="Price to (₹)">
                      <input type="number" className="input" value={bhk.priceMax}
                        onChange={setBHK(i, 'priceMax')} placeholder="7500000" disabled={isReadOnly} />
                    </Field>
                    <Field label="Total units">
                      <input type="number" className="input" value={bhk.totalUnits}
                        onChange={setBHK(i, 'totalUnits')} placeholder="40" disabled={isReadOnly} />
                    </Field>
                    <Field label="Available">
                      <input type="number" className="input" value={bhk.availableUnits}
                        onChange={setBHK(i, 'availableUnits')} placeholder="28" disabled={isReadOnly} />
                    </Field>
                  </div>
                </div>
              ))}
              {!isReadOnly && (
                <button type="button" onClick={addBHK}
                  className="btn-secondary btn text-sm">+ Add Unit Type</button>
              )}
            </div>
          </Section>

          {/* ── Project Details ─────────────────────────────────────────────── */}
          <Section title="Project Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Construction status *" error={fieldErrors.constructionStatus}>
                <select className={`input ${fieldErrors.constructionStatus ? 'input-error' : ''}`}
                  value={form.constructionStatus} onChange={set('constructionStatus')} disabled={isReadOnly}>
                  <option value="">Select status</option>
                  {CONSTRUCTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Possession date">
                <input type="date" className="input" value={form.possessionDate}
                  onChange={set('possessionDate')} disabled={isReadOnly} />
              </Field>
            </div>
            <div className="mt-5">
              <label className="label mb-3 block">Amenities</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_AMENITIES.map((amenity) => (
                  <button
                    key={amenity}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => toggleAmenity(amenity)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedAmenities.includes(amenity)
                        ? 'bg-navy-700 text-cream-100 border-navy-700'
                        : 'bg-white text-navy-600 border-navy-200 hover:border-navy-400'
                    } ${isReadOnly ? 'opacity-70 cursor-default' : ''}`}
                  >
                    {amenity}
                  </button>
                ))}
              </div>
              <input className="input mt-3" value={form.amenities} onChange={set('amenities')}
                placeholder="Or type custom amenities, comma-separated" disabled={isReadOnly} />
            </div>
          </Section>

          {/* ── Cover Image ─────────────────────────────────────────────────── */}
          <Section title="Property Cover Image *">
            <div className="space-y-4">
              <p className="text-xs text-navy-500">
                A high quality cover image is required before submitting your property for admin approval. Accepted formats: JPG, JPEG, PNG, WEBP (max 10 MB).
              </p>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                className="hidden"
                disabled={isReadOnly || isUploadingImage}
                onChange={handleImageSelect}
              />

              {/* Preview container or Empty state */}
              {coverImagePreview ? (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-navy-200 bg-navy-50 max-w-lg aspect-video shadow-sm flex items-center justify-center">
                    <img
                      src={coverImagePreview}
                      alt="Property Cover Preview"
                      className="w-full h-full object-cover"
                    />
                    {isUploadingImage && (
                      <div className="absolute inset-0 bg-navy-900/60 flex flex-col items-center justify-center text-white gap-2">
                        <LoadingSpinner size="md" />
                        <span className="text-xs font-medium">Uploading image…</span>
                      </div>
                    )}
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSaving || isUploadingImage}
                        className="btn-secondary btn text-sm"
                      >
                        Replace Image
                      </button>
                      <span className="text-xs text-navy-400">
                        {coverImageFile ? `Selected: ${coverImageFile.name}` : 'Current cover image'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => !isReadOnly && fileInputRef.current?.click()}
                  className={`bg-cream-100 border-2 border-dashed border-navy-200 rounded-xl px-6 py-10 text-center transition-colors ${
                    isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-gold-500 hover:bg-cream-50'
                  }`}
                >
                  <div className="text-4xl mb-3">📸</div>
                  <p className="text-sm font-semibold text-navy-800">
                    Upload Property Cover Image
                  </p>
                  <p className="text-xs text-navy-500 mt-1">
                    Click to select an image from your computer
                  </p>
                  <p className="text-xs text-navy-400 mt-1">
                    JPG, PNG, or WEBP up to 10 MB
                  </p>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="btn-primary btn text-sm mt-4 pointer-events-none"
                    >
                      Select Image
                    </button>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* ── Save / Submit ───────────────────────────────────────────────── */}
          {!isReadOnly && (
            <div className="flex items-center justify-between gap-4 pb-8">
              <button type="button" onClick={() => navigate('/builder/properties')}
                className="btn-secondary btn">Cancel</button>
              <div className="flex gap-3">
                <button type="submit" disabled={isSaving} className="btn-primary btn">
                  {isSaving ? <><LoadingSpinner size="sm" /> Saving…</> : isEdit ? 'Save Changes' : 'Save as Draft'}
                </button>
                {property && (property.status === 'DRAFT' || property.status === 'CHANGES_REQUESTED' || property.status === 'APPROVED') && (
                  <button type="button" onClick={handleSubmitForReview} disabled={isSubmitting} className="btn-gold btn">
                    {isSubmitting ? <><LoadingSpinner size="sm" /> Submitting…</> : 'Submit for Review'}
                  </button>
                )}
              </div>
            </div>
          )}

          {isReadOnly && (
            <div className="card px-5 py-4 border-l-4 border-navy-300 mb-8">
              <p className="text-sm text-navy-600">
                {property?.status === 'SUBMITTED' && (
                  <>
                    <strong className="text-navy-800">Awaiting admin review.</strong>{' '}
                    This property cannot be edited while it is under review. You will be able to edit it once admin has responded.
                  </>
                )}
                {property?.status === 'REJECTED' && (
                  <>
                    <strong className="text-navy-800">Property rejected.</strong>{' '}
                    {property.rejectionReason
                      ? `Reason: ${property.rejectionReason}`
                      : 'This property was not approved. Please contact support for details.'}
                  </>
                )}
              </p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card px-6 py-6 space-y-5">
      <h2 className="font-display text-lg font-semibold text-navy-800 border-b border-navy-100 pb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
