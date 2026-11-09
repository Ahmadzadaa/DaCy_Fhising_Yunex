/**
 * Live Call Guard engine.
 *
 * Setup: the call runs on speakerphone next to this device (iOS gives no app
 * access to call audio; in production the audio comes from the operator). DaCy records the microphone in back-to-back ~4 s AAC segments with the
 * standard expo-audio recorder (reliable in Expo Go), uploads each segment to the
 * DaCy server for speech-to-text + AI indicator extraction, and scores the growing
 * transcript ON THE PHONE with the deterministic engine.
 *
 * 5-second rule: the first window (5 s) identifies the call. If the caller is a
 * trusted contact (chosen by the user before the call, since iOS does not share
 * caller ID with apps; delivered by the operator in production) and the first words contain no risk signal, DaCy deletes what
 * it heard and switches itself off. Otherwise it keeps guarding and, on high or
 * critical risk, speaks a warning and alerts the family.
 *
 * Privacy: each audio segment is deleted right after upload, the transcript
 * lives only in memory during the call, and history keeps metadata only.
 */
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { deleteFileUri } from '@/features/callGuard/chunkFile';
import { speakWarning } from '@/features/callGuard/speakWarning';
import { tr } from '@/i18n';
import { resolveMode } from '@/services/ai/modelProvider';
import { sendLiveChunk } from '@/services/api/client';
import { certainty, explainCall, spokenWarning, type CallExplanation, type Certainty } from '@/features/callGuard/callExplain';
import { assessRisk } from '@/services/security/riskEngine';
import { useFamily, type AlertDelivery } from '@/state/family';
import { useHistory } from '@/state/history';
import { useServerStatus } from '@/state/serverStatus';
import { useSettings } from '@/state/settings';
import { useProviderContext } from '@/state/useProviderContext';
import { createId } from '@/utils/id';
import type {
  AiIndicator,
  CallOutcome,
  CallSessionSummary,
  FallbackReason,
  IndicatorType,
  InferenceMode,
  Localized,
  RiskAssessment,
  UiLanguage,
} from '@/types/security';

export type GuardPhase = 'idle' | 'starting' | 'identifying' | 'guarding' | 'trusted_stopped' | 'ended' | 'error';

export interface CallerSelection {
  label: string;
  trusted: boolean;
}

export interface TranscriptLine {
  seq: number;
  text: string;
}

export interface GuardState {
  phase: GuardPhase;
  caller: CallerSelection | null;
  elapsedMs: number;
  /** Microphone level 0..1. */
  level: number;
  lines: TranscriptLine[];
  assessment: RiskAssessment | null;
  /** 0 none · 1 quiet on-screen caution · 2 sure: spoken warning + family alert. */
  warningLevel: 0 | 1 | 2;
  certainty: Certainty;
  /** Situation-specific explanation quoting the caller's own words. */
  explanation: CallExplanation | null;
  /** Latest one-sentence AI summary of the call (display only). */
  aiSummary: string | null;
  /** A sure warning is waiting for the caller to pause before it is spoken. */
  warningPending: boolean;
  familyDelivery: AlertDelivery | null;
  chunksAnalyzed: number;
  /** Segments actually sent to speech-to-text. */
  chunksSent: number;
  lastLatency: { stt: number; ai: number } | null;
  modeUsed: InferenceMode;
  fallbackReason?: FallbackReason;
  /** Trusted caller, but the first words contained risk signals — guard kept running. */
  trustedRiskOverride: boolean;
  error: Localized | null;
  /** Last non-fatal problem (e.g. speech-to-text failure), shown under the transcript. */
  issue: string | null;
  summary: CallSessionSummary | null;
}

const IDENTIFY_MS = 5_000;
const CHUNK_MS = 4_000;
/** Peak loudness (dBFS) below which a segment is treated as silence and not uploaded. */
const SILENCE_DB = -62;
const MAX_CONTEXT_CHARS = 2_000;
/** Speak a sure warning only after the caller pauses (mic level below this for QUIET_MS)… */
const QUIET_LEVEL = 0.12;
const QUIET_MS = 1_200;
/** …but never wait longer than this. */
const MAX_SPEAK_WAIT_MS = 8_000;

/** Mono AAC at 22 kHz: small uploads, plenty for speech recognition. */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22_050,
  numberOfChannels: 1,
  bitRate: 48_000,
  isMeteringEnabled: true,
};

const INITIAL: GuardState = {
  phase: 'idle',
  caller: null,
  elapsedMs: 0,
  level: 0,
  lines: [],
  assessment: null,
  warningLevel: 0,
  certainty: 'none',
  explanation: null,
  aiSummary: null,
  warningPending: false,
  familyDelivery: null,
  chunksAnalyzed: 0,
  chunksSent: 0,
  lastLatency: null,
  modeUsed: 'DETERMINISTIC_ENGINE',
  trustedRiskOverride: false,
  error: null,
  issue: null,
  summary: null,
};

const ERRORS = {
  permission: {
    en: 'Microphone permission is needed for Call Guard. Enable it for Expo Go in iPhone Settings.',
    az: 'Zəng qoruması üçün mikrofon icazəsi lazımdır. iPhone Ayarlarında Expo Go üçün icazəni açın.',
  },
  noStt: {
    en: 'Live listening needs the DaCy server with speech-to-text. Start the server (see Settings) and try again.',
    az: 'Canlı dinləmə üçün nitqi mətnə çevirən DaCy serveri lazımdır. Serveri işə salın (Ayarlara baxın) və yenidən cəhd edin.',
  },
  micFailed: {
    en: 'The microphone could not be started. Close other apps using the microphone and try again.',
    az: 'Mikrofonu işə salmaq mümkün olmadı. Mikrofondan istifadə edən digər tətbiqləri bağlayıb yenidən cəhd edin.',
  },
} satisfies Record<string, Localized>;

/** Indicators that mean the caller is actually asking for something dangerous. */
const REQUEST_TYPES: IndicatorType[] = [
  'OTP_REQUEST',
  'CARD_DATA_REQUEST',
  'CREDENTIAL_REQUEST',
  'REMOTE_ACCESS_REQUEST',
  'SAFE_ACCOUNT_TRANSFER',
  'MONEY_TRANSFER_REQUEST',
];

function mergeAi(existing: AiIndicator[], incoming: AiIndicator[]): AiIndicator[] {
  const key = (a: AiIndicator) => `${a.type}|${a.evidence.trim().toLowerCase()}`;
  const map = new Map(existing.map((a) => [key(a), a]));
  for (const a of incoming) {
    const k = key(a);
    const prev = map.get(k);
    if (!prev || a.confidence > prev.confidence) map.set(k, a);
  }
  return Array.from(map.values());
}

/** Maps iOS metering (dBFS, -160..0) to a 0..1 meter value. */
function dbToLevel(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 50));
}

function mimeForUri(uri: string): { name: string; type: string } {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.webm')) return { name: 'chunk.webm', type: 'audio/webm' };
  if (lower.endsWith('.wav')) return { name: 'chunk.wav', type: 'audio/wav' };
  if (lower.endsWith('.caf')) return { name: 'chunk.caf', type: 'audio/x-caf' };
  if (Platform.OS === 'web') return { name: 'chunk.webm', type: 'audio/webm' };
  return { name: 'chunk.m4a', type: 'audio/m4a' };
}

export function useCallGuard() {
  const { settings } = useSettings();
  const { baseUrl, health, status } = useServerStatus();
  const ctx = useProviderContext();
  const { add } = useHistory();
  const { sendAlert } = useFamily();
  const [state, setState] = useState<GuardState>(INITIAL);
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  // Mutable session data (kept out of React state to avoid re-render storms).
  const sessionRef = useRef(0);
  const activeRef = useRef(false);
  const phaseRef = useRef<GuardPhase>('idle');
  const callerRef = useRef<CallerSelection | null>(null);
  const startedAtRef = useRef(0);
  const segmentStartRef = useRef(0);
  const segmentPeakDbRef = useRef(-160);
  const segmentTaintedRef = useRef(false);
  const rotatingRef = useRef(false);
  const seqRef = useRef(0);
  const transcriptRef = useRef<{ seq: number; text: string }[]>([]);
  const aiRef = useRef<AiIndicator[]>([]);
  const aiActiveRef = useRef(false);
  const warningRef = useRef<0 | 1 | 2>(0);
  const familyAlertedRef = useRef(false);
  const speakingRef = useRef(false);
  /** Consecutive analyses that found a critical, real request. */
  const confirmRef = useRef(0);
  const pendingSpeakRef = useRef<{ text: string; lang: UiLanguage; since: number } | null>(null);
  const quietMsRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const sentRef = useRef(0);
  const peakRef = useRef<{ score: number; band: RiskAssessment['band']; types: IndicatorType[] }>({ score: 0, band: 'low', types: [] });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settingsRef = useRef(settings);
  const ctxRef = useRef(ctx);
  const healthRef = useRef(health);
  const baseUrlRef = useRef(baseUrl);

  useEffect(() => {
    settingsRef.current = settings;
    ctxRef.current = ctx;
    healthRef.current = health;
    baseUrlRef.current = baseUrl;
  }, [settings, ctx, health, baseUrl]);

  const setPhase = useCallback((phase: GuardPhase) => {
    phaseRef.current = phase;
    setState((s) => ({ ...s, phase }));
  }, []);

  /* ---------------- scoring & reactions ---------------- */

  const warningLang = (): UiLanguage => {
    const s = settingsRef.current;
    if (s.speechLanguage === 'az') return 'az';
    if (s.speechLanguage === 'en') return 'en';
    return s.uiLanguage;
  };

  const rescore = useCallback((session: number): RiskAssessment | null => {
    if (session !== sessionRef.current) return null;
    const text = transcriptRef.current.map((l) => l.text).join(' ').trim();
    const assessment = assessRisk({
      text,
      context: 'call',
      aiIndicators: aiActiveRef.current ? aiRef.current : null,
    });
    if (assessment.score >= peakRef.current.score) {
      peakRef.current = {
        score: assessment.score,
        band: assessment.band,
        types: assessment.indicators.filter((i) => i.points > 0).map((i) => i.type),
      };
    }
    const level = certainty(assessment, confirmRef.current);
    setState((s) => ({ ...s, assessment, lines: transcriptRef.current.slice(-12), explanation: explainCall(assessment, level) }));
    return assessment;
  }, []);

  /** Speaks a warning now (called once the caller has paused). */
  const speakNow = useCallback((text: string, lang: UiLanguage) => {
    pendingSpeakRef.current = null;
    quietMsRef.current = 0;
    speakingRef.current = true;
    segmentTaintedRef.current = true; // never send the warning itself to speech-to-text
    setState((s) => ({ ...s, warningPending: false }));
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false })
      .catch(() => undefined)
      .finally(() => {
        speakWarning(text, lang, {
          baseUrl: baseUrlRef.current,
          serverTts: !!healthRef.current?.capabilities.tts,
          onDone: () => {
            setTimeout(() => {
              speakingRef.current = false;
            }, 600);
          },
        });
      });
  }, []);
  const speakNowRef = useRef(speakNow);
  speakNowRef.current = speakNow;

  /**
   * Decides how to react. DaCy only interrupts by voice when it is SURE (see
   * callExplain.certainty): a critical score with a real, confirmed request.
   * Lower levels are shown quietly on screen and never alert the family.
   */
  const react = useCallback(
    (assessment: RiskAssessment, session: number) => {
      if (session !== sessionRef.current || !activeRef.current) return;
      const first = certainty(assessment, 0);
      confirmRef.current = first === 'candidate' || first === 'sure' ? confirmRef.current + 1 : 0;
      const level = certainty(assessment, confirmRef.current);
      const warning: 0 | 1 | 2 = level === 'sure' ? 2 : level === 'none' ? 0 : 1;
      setState((s) => ({ ...s, certainty: level, explanation: explainCall(assessment, level) }));
      if (warning <= warningRef.current) return;
      warningRef.current = warning;
      setState((s) => ({ ...s, warningLevel: warning }));

      if (warning === 1) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      if (settingsRef.current.spokenWarnings) {
        const lang = warningLang();
        // Do not talk over the caller: wait for a pause (handled in the mic tick).
        pendingSpeakRef.current = { text: tr(spokenWarning(assessment), lang), lang, since: Date.now() };
        quietMsRef.current = 0;
        setState((s) => ({ ...s, warningPending: true }));
      }
      if (!familyAlertedRef.current) {
        familyAlertedRef.current = true;
        const category = assessment.indicators.find((i) => i.points > 0)?.type ?? 'URGENCY';
        void sendAlert({ band: 'critical', category, source: 'call' }).then((delivery) => {
          if (session === sessionRef.current) setState((s) => ({ ...s, familyDelivery: delivery }));
        });
      }
    },
    [sendAlert],
  );

  /* ---------------- lifecycle ---------------- */

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const releaseAudio = useCallback(() => {
    activeRef.current = false;
    try {
      if (recorder.isRecording) {
        void recorder.stop().then(() => deleteFileUri(recorder.uri));
      }
    } catch {
      // already stopped
    }
    void Speech.stop();
    speakingRef.current = false;
    deactivateKeepAwake('dacy-call-guard').catch(() => undefined);
  }, [recorder]);

  const finish = useCallback(
    (outcome: CallOutcome) => {
      const session = sessionRef.current;
      clearTimers();
      releaseAudio();
      const caller = callerRef.current;
      const summary: CallSessionSummary = {
        id: createId('c_'),
        kind: 'call',
        createdAt: new Date(startedAtRef.current || Date.now()).toISOString(),
        durationMs: Date.now() - startedAtRef.current,
        callerLabel: caller?.label ?? '—',
        callerTrusted: !!caller?.trusted,
        outcome,
        peakScore: outcome === 'TRUSTED_STOPPED' ? 0 : peakRef.current.score,
        peakBand: outcome === 'TRUSTED_STOPPED' ? 'low' : peakRef.current.band,
        indicatorTypes: outcome === 'TRUSTED_STOPPED' ? [] : peakRef.current.types,
        warningsSpoken: warningRef.current,
        familyNotified: familyAlertedRef.current,
        chunksAnalyzed: seqRef.current,
        modeUsed: aiActiveRef.current ? 'CLOUD_API' : 'DETERMINISTIC_ENGINE',
      };
      add(summary);
      // Privacy: forget the conversation itself.
      transcriptRef.current = [];
      aiRef.current = [];
      sessionRef.current = session + 1;
      const phase: GuardPhase = outcome === 'TRUSTED_STOPPED' ? 'trusted_stopped' : 'ended';
      phaseRef.current = phase;
      setState((s) => ({ ...s, phase, summary, lines: [], level: 0 }));
    },
    [add, clearTimers, releaseAudio],
  );

  /** First-window decision for trusted callers. */
  const decideIdentity = useCallback(
    (assessment: RiskAssessment | null, session: number) => {
      if (session !== sessionRef.current || phaseRef.current !== 'identifying') return;
      const caller = callerRef.current;
      if (caller?.trusted) {
        const risky =
          !!assessment &&
          (assessment.score >= 50 || assessment.indicators.some((i) => REQUEST_TYPES.includes(i.type) && i.points > 0));
        if (!risky) {
          finish('TRUSTED_STOPPED');
          return;
        }
        setState((s) => ({ ...s, trustedRiskOverride: true }));
      }
      setPhase('guarding');
    },
    [finish, setPhase],
  );

  /** Uploads one recorded segment, merges the transcript and re-scores. */
  const processSegment = useCallback(
    async (uri: string | null, upload: boolean, seq: number, session: number) => {
      try {
        if (uri && upload) {
          const context = transcriptRef.current.map((l) => l.text).join(' ').slice(-MAX_CONTEXT_CHARS);
          const analyze = aiActiveRef.current && pendingRef.current <= 1;
          sentRef.current += 1;
          setState((s) => ({ ...s, chunksSent: sentRef.current }));
          const res = await sendLiveChunk(baseUrlRef.current, {
            audio: { uri, ...mimeForUri(uri) },
            language: settingsRef.current.speechLanguage,
            uiLanguage: settingsRef.current.uiLanguage,
            seq,
            context,
            analyze,
          });
          if (session !== sessionRef.current) return;
          if (res.ok) {
            const text = res.data.text.trim();
            if (text) transcriptRef.current.push({ seq, text });
            if (res.data.ai) {
              aiRef.current = mergeAi(aiRef.current, res.data.ai.indicators);
              const aiSummary = res.data.ai.summary?.trim() || null;
              if (aiSummary) setState((s) => ({ ...s, aiSummary }));
            } else if (analyze && res.data.aiError && res.data.aiError !== 'AI_NOT_CONFIGURED') {
              aiActiveRef.current = false;
              setState((s) => ({
                ...s,
                modeUsed: 'DETERMINISTIC_ENGINE',
                fallbackReason:
                  res.data.aiError === 'TIMEOUT' ? 'AI_TIMEOUT' : res.data.aiError === 'AI_REFUSED' ? 'AI_REFUSED' : 'AI_ERROR',
              }));
            }
            setState((s) => ({ ...s, lastLatency: res.data.latencyMs, issue: null }));
          } else {
            setState((s) => ({ ...s, issue: `${res.code}: ${res.message}` }));
          }
        }
      } catch (error) {
        if (session === sessionRef.current) {
          setState((s) => ({ ...s, issue: error instanceof Error ? error.message : 'Upload failed' }));
        }
      } finally {
        deleteFileUri(uri);
      }

      if (session !== sessionRef.current) return;
      setState((s) => ({ ...s, chunksAnalyzed: Math.max(s.chunksAnalyzed, seq + 1) }));
      const assessment = rescore(session);
      if (phaseRef.current === 'identifying') decideIdentity(assessment, session);
      if (assessment && phaseRef.current === 'guarding') react(assessment, session);
    },
    [decideIdentity, react, rescore],
  );

  const startSegment = useCallback(async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    segmentStartRef.current = Date.now();
    segmentPeakDbRef.current = -160;
    segmentTaintedRef.current = speakingRef.current;
  }, [recorder]);

  /** Closes the current segment, immediately starts the next one, and queues the closed one. */
  const rotate = useCallback(async () => {
    if (rotatingRef.current || !activeRef.current) return;
    rotatingRef.current = true;
    const session = sessionRef.current;
    const seq = seqRef.current;
    seqRef.current += 1;
    const peakDb = segmentPeakDbRef.current;
    const tainted = segmentTaintedRef.current;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
      if (activeRef.current && session === sessionRef.current) await startSegment();
    } catch (error) {
      setState((s) => ({ ...s, issue: error instanceof Error ? error.message : 'Recorder error' }));
      try {
        if (activeRef.current) await startSegment();
      } catch {
        // will retry on the next tick
      }
    } finally {
      rotatingRef.current = false;
    }
    // Metering is not available on every platform; when unknown, upload anyway.
    const hasSound = seq === 0 || peakDb <= -159 || peakDb > SILENCE_DB;
    const upload = !tainted && hasSound;
    if (!upload) deleteFileUri(uri);
    pendingRef.current += 1;
    queueRef.current = queueRef.current
      .then(() => processSegment(upload ? uri : null, upload, seq, session))
      .catch(() => undefined)
      .finally(() => {
        pendingRef.current -= 1;
      });
  }, [processSegment, recorder, startSegment]);

  const beginSession = useCallback((caller: CallerSelection) => {
    sessionRef.current += 1;
    activeRef.current = true;
    callerRef.current = caller;
    startedAtRef.current = Date.now();
    segmentStartRef.current = Date.now();
    seqRef.current = 0;
    sentRef.current = 0;
    transcriptRef.current = [];
    aiRef.current = [];
    warningRef.current = 0;
    confirmRef.current = 0;
    pendingSpeakRef.current = null;
    quietMsRef.current = 0;
    familyAlertedRef.current = false;
    speakingRef.current = false;
    pendingRef.current = 0;
    rotatingRef.current = false;
    peakRef.current = { score: 0, band: 'low', types: [] };
    const resolution = resolveMode(ctxRef.current);
    aiActiveRef.current = resolution.mode === 'CLOUD_API';
    phaseRef.current = 'identifying';
    setState({
      ...INITIAL,
      phase: 'identifying',
      caller,
      modeUsed: resolution.mode,
      fallbackReason: resolution.fallbackReason,
    });
    activateKeepAwakeAsync('dacy-call-guard').catch(() => undefined);
  }, []);

  /** Starts real-time listening through the microphone. */
  const start = useCallback(
    async (caller: CallerSelection) => {
      if (activeRef.current) return;
      if (status !== 'online' || !health?.capabilities.stt) {
        setState({ ...INITIAL, phase: 'error', error: ERRORS.noStt });
        return;
      }
      setState({ ...INITIAL, phase: 'starting', caller });
      const perm = await requestRecordingPermissionsAsync().catch(() => null);
      if (!perm?.granted) {
        setState({ ...INITIAL, phase: 'error', error: ERRORS.permission });
        return;
      }
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
        beginSession(caller);
        await startSegment();
      } catch {
        releaseAudio();
        setState({ ...INITIAL, phase: 'error', error: ERRORS.micFailed });
        return;
      }
      tickRef.current = setInterval(() => {
        if (!activeRef.current) return;
        const now = Date.now();
        let level = 0;
        try {
          const st = recorder.getStatus();
          if (typeof st.metering === 'number') {
            segmentPeakDbRef.current = Math.max(segmentPeakDbRef.current, st.metering);
            level = dbToLevel(st.metering);
          } else if (st.isRecording) {
            segmentPeakDbRef.current = Math.max(segmentPeakDbRef.current, -159); // unknown → treat as sound
            level = 0.15;
          }
        } catch {
          // status unavailable this tick
        }
        // A sure warning waits for the caller to pause, so DaCy never cuts in mid-sentence.
        const pending = pendingSpeakRef.current;
        if (pending && !speakingRef.current) {
          quietMsRef.current = level < QUIET_LEVEL ? quietMsRef.current + 200 : 0;
          if (quietMsRef.current >= QUIET_MS || now - pending.since >= MAX_SPEAK_WAIT_MS) speakNowRef.current(pending.text, pending.lang);
        }
        if (speakingRef.current) {
          segmentTaintedRef.current = true;
          level = 0;
        }
        const window = seqRef.current === 0 ? IDENTIFY_MS : CHUNK_MS;
        if (now - segmentStartRef.current >= window) void rotate();
        setState((s) => ({ ...s, elapsedMs: now - startedAtRef.current, level }));
      }, 200);
    },
    [beginSession, health, recorder, releaseAudio, rotate, startSegment, status],
  );

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    finish(phaseRef.current === 'identifying' ? 'STOPPED_BY_USER' : warningRef.current > 0 ? 'WARNED' : 'COMPLETED_NO_RISK');
  }, [finish]);

  const reset = useCallback(() => {
    if (activeRef.current) return;
    setState(INITIAL);
    phaseRef.current = 'idle';
  }, []);

  // Stop everything if the screen unmounts mid-call.
  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (activeRef.current) {
        activeRef.current = false;
        void Speech.stop();
        deactivateKeepAwake('dacy-call-guard').catch(() => undefined);
      }
    },
    [],
  );

  const liveAvailable = status === 'online' && !!health?.capabilities.stt;

  return { state, start, stop, reset, liveAvailable };
}
