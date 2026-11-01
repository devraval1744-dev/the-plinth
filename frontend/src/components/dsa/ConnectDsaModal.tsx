import { useEffect, useState, type FormEvent } from 'react';
import Modal from '../ui/Modal';
import AlertMessage from '../ui/AlertMessage';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createLoanApi } from '../../api/loans.api';
import { getErrorMessage, getFieldErrors } from '../../api/client';
import type { LoanRequest } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the request is tied to this property so the DSA knows what you're interested in. */
  property?: { _id: string; projectName: string };
  onCreated?: (request: LoanRequest) => void;
}

/** Asks a verified DSA partner to get in touch. The DSA handles everything about financing from there. */
export default function ConnectDsaModal({ open, onClose, property, onCreated }: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fe, setFe] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setNotes('');
    setConsent(false);
    setError('');
    setFe({});
  }, [open, user?.name, user?.phone]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.contactName = 'Your name is required';
    if (!/^[6-9]\d{9}$/.test(phone.trim())) errs.contactPhone = 'Enter a valid 10-digit mobile number';
    if (!consent) errs.consent = 'Your consent is required to share your details with a DSA partner';
    setFe(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const request = await createLoanApi({
        propertyId: property?._id,
        contactName: name.trim(),
        contactPhone: phone.trim(),
        notes: notes.trim() || undefined,
        consent,
      });
      toast.success(
        request.dsa ? `${request.dsa.name} will be in touch with you.` : "Request received. We'll connect you with a DSA partner shortly."
      );
      onCreated?.(request);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setFe(getFieldErrors(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose(); }}
      title="Connect with a DSA partner"
      subtitle={property ? `About ${property.projectName}` : 'A verified partner will guide you on financing'}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary">Cancel</button>
          <button type="submit" form="dsa-form" disabled={submitting} className="btn-primary min-w-[9rem]">
            {submitting ? 'Sending…' : 'Connect me'}
          </button>
        </div>
      }
    >
      <form id="dsa-form" onSubmit={submit} className="space-y-5" noValidate>
        {error && <AlertMessage type="error" message={error} />}

        <p className="text-sm text-navy-600">
          Share how to reach you and a DSA partner will contact you to take it from here — eligibility, lenders and
          paperwork are all handled by them.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dsa-name" className="label">Your name</label>
            <input id="dsa-name" className={`input ${fe.contactName ? 'input-error' : ''}`} value={name}
              onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
            {fe.contactName && <p className="field-error">{fe.contactName}</p>}
          </div>
          <div>
            <label htmlFor="dsa-phone" className="label">Mobile number</label>
            <input id="dsa-phone" inputMode="numeric" className={`input ${fe.contactPhone ? 'input-error' : ''}`} value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" autoComplete="tel-national" />
            {fe.contactPhone && <p className="field-error">{fe.contactPhone}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="dsa-notes" className="label">Anything you'd like them to know? <span className="text-navy-400 font-normal">(optional)</span></label>
          <textarea id="dsa-notes" rows={2} className="input resize-none" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. best time to call" />
        </div>

        <div className={`rounded-xl border px-4 py-3 ${fe.consent ? 'border-red-300 bg-red-50' : 'border-navy-200 bg-white'}`}>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 w-4 h-4 accent-navy-700" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-sm text-navy-700">
              I consent to The Plinth sharing these details with a verified DSA partner, who may contact me.
            </span>
          </label>
          {fe.consent && <p className="field-error">{fe.consent}</p>}
        </div>
      </form>
    </Modal>
  );
}
