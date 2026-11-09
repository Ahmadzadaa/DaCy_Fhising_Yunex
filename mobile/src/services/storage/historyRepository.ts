/**
 * Local, device-only scan history (AsyncStorage). Nothing here is ever uploaded.
 *
 * Privacy rules applied on write:
 *  - message text is redacted (codes, card numbers, IBANs, passwords masked);
 *  - when "store text in history" is off, the text/transcript is not stored at all;
 *  - call sessions are metadata-only by type (no transcript field exists).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { redactSensitive } from '@/services/security/redact';
import type { HistoryEntry, RiskBand } from '@/types/security';

const STORAGE_KEY = 'dacy.history.v1';
export const MAX_HISTORY_ENTRIES = 200;
/** Results from the removed built-in demo scenarios are dropped: history holds real checks only. */
const REMOVED_SOURCES = new Set(['sample', 'voice_demo']);

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as { id?: unknown; kind?: unknown; createdAt?: unknown };
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    (v.kind === 'text' || v.kind === 'voice' || v.kind === 'call')
  );
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryEntry)
      .filter((e) => !REMOVED_SOURCES.has((e as { source?: string }).source ?? ''))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)));
}

export async function clearHistoryStorage(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Applies the privacy rules before an entry is persisted. */
export function sanitizeForStorage(entry: HistoryEntry, storeText: boolean): HistoryEntry {
  if (entry.kind === 'text') {
    return { ...entry, text: storeText ? redactSensitive(entry.text) : '' };
  }
  if (entry.kind === 'voice') {
    return { ...entry, transcript: storeText ? redactSensitive(entry.transcript) : '' };
  }
  return entry;
}

export function entryScore(entry: HistoryEntry): number {
  return entry.kind === 'call' ? entry.peakScore : entry.assessment.score;
}

export function entryBand(entry: HistoryEntry): RiskBand {
  return entry.kind === 'call' ? entry.peakBand : entry.assessment.band;
}

export interface HistoryStats {
  total: number;
  textScans: number;
  voiceScans: number;
  calls: number;
  /** Entries with band high or critical. */
  threats: number;
  critical: number;
  lastScanAt: string | null;
  /** Live calls where a warning was spoken. */
  callsWarned: number;
}

export function computeStats(entries: HistoryEntry[]): HistoryStats {
  let textScans = 0;
  let voiceScans = 0;
  let calls = 0;
  let threats = 0;
  let critical = 0;
  let callsWarned = 0;
  let lastScanAt: string | null = null;
  for (const e of entries) {
    if (e.kind === 'text') textScans += 1;
    else if (e.kind === 'voice') voiceScans += 1;
    else {
      calls += 1;
      if (e.outcome === 'WARNED') callsWarned += 1;
    }
    const band = entryBand(e);
    if (band === 'high' || band === 'critical') threats += 1;
    if (band === 'critical') critical += 1;
    if (!lastScanAt || e.createdAt > lastScanAt) lastScanAt = e.createdAt;
  }
  return { total: entries.length, textScans, voiceScans, calls, threats, critical, lastScanAt, callsWarned };
}
