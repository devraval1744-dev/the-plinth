import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { addFavoriteApi, listFavoriteIdsApi, removeFavoriteApi } from '../api/customer.api';
import { getErrorMessage } from '../api/client';

interface FavoritesContextValue {
  /** True once the signed-in customer's saved list has been loaded. */
  ready: boolean;
  count: number;
  isSaved: (propertyId: string) => boolean;
  isPending: (propertyId: string) => boolean;
  /** Optimistically saves / un-saves; rolls back and reports on failure. Resolves to the new saved state. */
  toggle: (propertyId: string) => Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const isCustomer = user?.role === 'CUSTOMER';
  const userId = user?.id;

  const [ids, setIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    let cancelled = false;
    setIds(new Set());
    setReady(false);
    if (!isCustomer) return;
    listFavoriteIdsApi()
      .then((list) => { if (!cancelled) { setIds(new Set(list)); setReady(true); } })
      .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [isCustomer, userId]);

  const toggle = useCallback(
    async (propertyId: string): Promise<boolean> => {
      const wasSaved = idsRef.current.has(propertyId);
      const setSaved = (saved: boolean) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (saved) next.add(propertyId); else next.delete(propertyId);
          return next;
        });

      setPending((p) => new Set(p).add(propertyId));
      setSaved(!wasSaved); // optimistic
      try {
        if (wasSaved) await removeFavoriteApi(propertyId);
        else await addFavoriteApi(propertyId);
        toast.success(wasSaved ? 'Removed from saved' : 'Saved to your shortlist');
        return !wasSaved;
      } catch (e) {
        setSaved(wasSaved); // roll back
        toast.error(getErrorMessage(e));
        return wasSaved;
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(propertyId);
          return next;
        });
      }
    },
    [toast]
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      ready,
      count: ids.size,
      isSaved: (id) => ids.has(id),
      isPending: (id) => pending.has(id),
      toggle,
    }),
    [ready, ids, pending, toggle]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used inside <FavoritesProvider>');
  return ctx;
}
