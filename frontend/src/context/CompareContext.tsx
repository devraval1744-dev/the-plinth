import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from './ToastContext';

export const MAX_COMPARE = 3;
const STORAGE_KEY = 'plinth_compare';

export interface CompareItem {
  id: string;
  name: string;
  image?: string;
}

interface CompareContextValue {
  items: CompareItem[];
  has: (id: string) => boolean;
  toggle: (item: CompareItem) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);

function load(): CompareItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => x && typeof x.id === 'string').slice(0, MAX_COMPARE)
      : [];
  } catch {
    return []; // storage unavailable or corrupted — start empty
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [items, setItems] = useState<CompareItem[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode / quota — compare still works for this session */
    }
  }, [items]);

  const toggle = useCallback(
    (item: CompareItem) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === item.id)) return prev.filter((p) => p.id !== item.id);
        if (prev.length >= MAX_COMPARE) {
          toast.info(`You can compare up to ${MAX_COMPARE} properties at a time`);
          return prev;
        }
        return [...prev, item];
      });
    },
    [toast]
  );

  const value = useMemo<CompareContextValue>(
    () => ({
      items,
      has: (id) => items.some((i) => i.id === id),
      toggle,
      remove: (id) => setItems((prev) => prev.filter((p) => p.id !== id)),
      clear: () => setItems([]),
    }),
    [items, toggle]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside <CompareProvider>');
  return ctx;
}
