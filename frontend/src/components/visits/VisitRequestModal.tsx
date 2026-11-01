import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import AlertMessage from '../ui/AlertMessage';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createVisitApi } from '../../api/visits.api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import { todayInIndia } from '../../utils/format';
import { VISIT_SLOTS } from '../../types';
import type { SiteVisit, VisitSlot } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  property: { _id: string; projectName: string; locality: string };
  onCreated?: (visit: SiteVisit) => void;
}

/** Hour (IST) at which each slot ends — slots already over today are disabled. */
const SLOT_END_HOUR: Record<VisitSlot, number> = { MORNING: 12, AFTERNOON: 16, EVENING: 19 };

export default function VisitRequestModal({ open, onClose, property, onCreated }: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const today = todayInIndia();
  const maxDate = todayInIndia(60);
  const hourIST = new Date(Date.now() + 5.5 * 3_600_000).getUTCHours();

  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<VisitSlot | ''>('');
  const [visitors, setVisitors] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Fresh form (prefilled from the profile) each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setDate(todayInIndia(1));
    setSlot('');
    setVisitors(1);
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setNotes('');
    setError('');
    setFieldErrors({});
  }, [open, user?.name, user?.phone]);

  const slotPassed = useMemo(
    () => (s: VisitSlot) => date === today && hourIST >= SLOT_END_HOUR[s],
    [date, today, hourIST]
  );

  // If the picked slot becomes unavailable (user changed the date to today), clear it
  useEffect(() => {
    if (slot && slotPassed(slot)) setSlot('');
  }, [slot, slotPassed]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (!date) errs.visitDate = 'Please choose a date';
    else if (date < today || date > maxDate) errs.visitDate = 'Choose a date within the next 60 days';
    if (!slot) errs.timeSlot = 'Please choose a time slot';
    if (!name.trim()) errs.contactName = 'Your name is required';
    if (!/^[6-9]\d{9}$/.test(phone.trim())) errs.contactPhone = 'Enter a valid 10-digit mobile number';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const visit = await createVisitApi({
        propertyId: property._id,
        visitDate: date,
        timeSlot: slot as VisitSlot,
        visitors,
        contactName: name.trim(),
        contactPhone: phone.trim(),
        notes: notes.trim() || undefined,
      });
      toast.success(`Visit requested for ${property.projectName}. We'll notify you once the builder responds.`);
      onCreated?.(visit);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setFieldErrors(getFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose(); }}
      title="Request a site visit"
      subtitle={`${property.projectName} · ${property.locality}`}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">Cancel</button>
          <button type="submit" form="visit-form" disabled={submitting} className="btn-primary min-w-[9rem]">
            {submitting ? 'Requesting…' : 'Request visit'}
          </button>
        </div>
      }
    >
      <form id="visit-form" onSubmit={submit} className="space-y-5" noValidate>
        {error && <AlertMessage type="error" message={error} />}

        <div>
          <label htmlFor="visit-date" className="label">Preferred date</label>
          <input
            id="visit-date" type="date" className={`input ${fieldErrors.visitDate ? 'input-error' : ''}`}
            value={date} min={today} max={maxDate} onChange={(e) => setDate(e.target.value)}
          />
          {fieldErrors.visitDate && <p className="field-error">{fieldErrors.visitDate}</p>}
        </div>

        <fieldset>
          <legend className="label">Time slot</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {VISIT_SLOTS.map((s) => {
              const disabled = slotPassed(s.value);
              const selected = slot === s.value;
              return (
                <label
                  key={s.value}
                  className={`rounded-lg border px-3 py-2.5 text-center cursor-pointer transition-colors ${
                    disabled ? 'opacity-40 cursor-not-allowed bg-navy-50'
                    : selected ? 'border-navy-700 bg-navy-700 text-cream-100'
                    : 'border-navy-200 hover:border-navy-400'
                  }`}
                >
                  <input
                    type="radio" name="slot" value={s.value} className="sr-only"
                    checked={selected} disabled={disabled} onChange={() => setSlot(s.value)}
                  />
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className={`block text-xs mt-0.5 ${selected ? 'text-navy-200' : 'text-navy-500'}`}>
                    {disabled ? 'Passed for today' : s.hint}
                  </span>
                </label>
              );
            })}
          </div>
          {fieldErrors.timeSlot && <p className="field-error">{fieldErrors.timeSlot}</p>}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="visit-name" className="label">Your name</label>
            <input id="visit-name" className={`input ${fieldErrors.contactName ? 'input-error' : ''}`}
              value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
            {fieldErrors.contactName && <p className="field-error">{fieldErrors.contactName}</p>}
          </div>
          <div>
            <label htmlFor="visit-phone" className="label">Mobile number</label>
            <input id="visit-phone" inputMode="numeric" className={`input ${fieldErrors.contactPhone ? 'input-error' : ''}`}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit number" autoComplete="tel-national" />
            {fieldErrors.contactPhone && <p className="field-error">{fieldErrors.contactPhone}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="visit-people" className="label">Number of visitors</label>
          <select id="visit-people" className="input sm:w-40" value={visitors} onChange={(e) => setVisitors(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'person' : 'people'}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="visit-notes" className="label">Anything the builder should know? <span className="text-navy-400 font-normal">(optional)</span></label>
          <textarea id="visit-notes" rows={2} className="input resize-none" value={notes} maxLength={500}
            onChange={(e) => setNotes(e.target.value)} placeholder="e.g. interested in a corner 3 BHK on a higher floor" />
        </div>
      </form>
    </Modal>
  );
}
