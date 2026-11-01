import { useState } from 'react';
import Modal from './Modal';
import AlertMessage from './AlertMessage';
import { getErrorMessage } from '../../api/client';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Confirmation prompt for destructive / irreversible actions. Stays open and shows the error if the action fails. */
export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel = 'Keep it', danger = false, onConfirm, onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) { setError(''); onClose(); } }}
      title={title}
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={confirm} disabled={busy}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-navy-700">{message}</p>
        {error && <AlertMessage type="error" message={error} />}
      </div>
    </Modal>
  );
}
