/**
 * React state for the local scan history (backed by historyRepository).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  clearHistoryStorage,
  computeStats,
  loadHistory,
  MAX_HISTORY_ENTRIES,
  sanitizeForStorage,
  saveHistory,
  type HistoryStats,
} from '@/services/storage/historyRepository';
import { useSettings } from '@/state/settings';
import type { HistoryEntry } from '@/types/security';

interface HistoryContextValue {
  entries: HistoryEntry[];
  loaded: boolean;
  stats: HistoryStats;
  /** Persists an entry (privacy rules applied) and returns the stored version. */
  add: (entry: HistoryEntry) => HistoryEntry;
  remove: (id: string) => void;
  clearAll: () => Promise<void>;
  get: (id: string) => HistoryEntry | undefined;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const entriesRef = useRef<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadHistory().then((list) => {
      if (cancelled) return;
      // Merge with anything added before the initial load finished.
      const merged = [...entriesRef.current, ...list.filter((e) => !entriesRef.current.some((x) => x.id === e.id))]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_HISTORY_ENTRIES);
      entriesRef.current = merged;
      setEntries(merged);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = useCallback((next: HistoryEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    saveHistory(next).catch(() => undefined);
  }, []);

  const add = useCallback(
    (entry: HistoryEntry) => {
      const stored = sanitizeForStorage(entry, settings.storeTextInHistory);
      const next = [stored, ...entriesRef.current.filter((e) => e.id !== stored.id)].slice(0, MAX_HISTORY_ENTRIES);
      commit(next);
      return stored;
    },
    [commit, settings.storeTextInHistory],
  );

  const remove = useCallback(
    (id: string) => {
      commit(entriesRef.current.filter((e) => e.id !== id));
    },
    [commit],
  );

  const clearAll = useCallback(async () => {
    entriesRef.current = [];
    setEntries([]);
    await clearHistoryStorage();
  }, []);

  const get = useCallback((id: string) => entriesRef.current.find((e) => e.id === id), []);

  const stats = useMemo(() => computeStats(entries), [entries]);

  const value = useMemo(
    () => ({ entries, loaded, stats, add, remove, clearAll, get }),
    [entries, loaded, stats, add, remove, clearAll, get],
  );
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used inside <HistoryProvider>');
  return ctx;
}
