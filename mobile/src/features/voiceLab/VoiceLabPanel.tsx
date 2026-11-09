/**
 * Voice Lab: analyse a recorded or imported voice message / call recording.
 * Output has two separate cards:
 * conversation risk (scored) and voice authenticity (experimental, no fake score).
 */
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnalyzingCard } from '@/components/AnalyzingCard';
import { NotifyFamilyButton } from '@/components/NotifyFamilyButton';
import { ResultView } from '@/components/result/ResultView';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InlineNotice } from '@/components/ui/misc';
import { colors, spacing } from '@/constants/theme';
import { deleteFileUri } from '@/features/callGuard/chunkFile';
import { defineStrings, formatDuration, tr, useStrings, useUiLanguage } from '@/i18n';
import { resolveMode, runVoiceAnalysis } from '@/services/ai/modelProvider';
import { useHistory } from '@/state/history';
import { useProviderContext } from '@/state/useProviderContext';
import type { VoiceScanResult } from '@/types/security';

const S = defineStrings({
  en: {
    intro: 'Check a voice message or a recorded call. DaCy transcribes it, scores the conversation and reports voice authenticity honestly.',
    record: 'Record',
    stopRecord: 'Stop & analyse',
    recording: 'Recording…',
    importFile: 'Import audio file',
    permission: 'Microphone permission is needed to record.',
    again: 'Analyse another',
  },
  az: {
    intro: 'Səsli mesajı və ya zəng yazısını yoxlayın. DaCy onu mətnə çevirir, söhbəti qiymətləndirir və səsin həqiqiliyi barədə dürüst nəticə verir.',
    record: 'Yaz',
    stopRecord: 'Dayandır və analiz et',
    recording: 'Yazılır…',
    importFile: 'Səs faylı seç',
    permission: 'Səs yazmaq üçün mikrofon icazəsi lazımdır.',
    again: 'Başqasını analiz et',
  },
});

export function VoiceLabPanel() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const ctx = useProviderContext();
  const { add } = useHistory();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceScanResult | null>(null);

  const handleOutcome = (outcome: Awaited<ReturnType<typeof runVoiceAnalysis>>) => {
    if (outcome.ok) {
      add(outcome.result);
      setResult(outcome.result);
      const band = outcome.result.assessment.band;
      Haptics.notificationAsync(
        band === 'high' || band === 'critical' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    } else {
      setNotice(tr(outcome.message, lang));
    }
  };

  const startRecording = async () => {
    setNotice(null);
    setResult(null);
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) {
      setNotice(t.permission);
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const stopAndAnalyse = async () => {
    const durationMs = recorderState.durationMillis;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;
    setBusy(true);
    try {
      const outcome = await runVoiceAnalysis({
        audio: { uri, name: 'recording.m4a', type: 'audio/m4a' },
        durationMs,
        source: 'voice_recording',
        ctx,
      });
      handleOutcome(outcome);
    } finally {
      deleteFileUri(uri);
      setBusy(false);
    }
  };

  const importFile = async () => {
    setNotice(null);
    setResult(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setBusy(true);
    try {
      const outcome = await runVoiceAnalysis({
        audio: { uri: asset.uri, name: asset.name || 'audio.m4a', type: asset.mimeType ?? 'audio/m4a' },
        durationMs: 0,
        source: 'voice_file',
        ctx,
      });
      handleOutcome(outcome);
    } finally {
      deleteFileUri(asset.uri);
      setBusy(false);
    }
  };

  if (result && !busy) {
    return (
      <ResultView
        result={result}
        actions={
          <>
            <NotifyFamilyButton assessment={result.assessment} source="voice" />
            <Button label={t.again} icon="refresh-outline" variant="ghost" fullWidth onPress={() => setResult(null)} />
          </>
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <AppText variant="small">{t.intro}</AppText>

      <Card>
        {recorderState.isRecording ? (
          <View style={styles.recRow}>
            <View style={styles.recDot} />
            <AppText variant="heading" style={styles.flex}>
              {t.recording}
            </AppText>
            <AppText variant="heading" color={colors.textSecondary}>
              {formatDuration(recorderState.durationMillis)}
            </AppText>
          </View>
        ) : null}
        <Button
          label={recorderState.isRecording ? t.stopRecord : t.record}
          icon={recorderState.isRecording ? 'stop-circle-outline' : 'mic-outline'}
          variant={recorderState.isRecording ? 'danger' : 'primary'}
          size="lg"
          fullWidth
          disabled={busy}
          onPress={() => void (recorderState.isRecording ? stopAndAnalyse() : startRecording())}
        />
        <Button label={t.importFile} icon="folder-open-outline" variant="secondary" fullWidth disabled={busy || recorderState.isRecording} onPress={() => void importFile()} />
      </Card>

      {notice ? <InlineNotice tone="warning">{notice}</InlineNotice> : null}
      {busy ? <AnalyzingCard mode={resolveMode(ctx).mode} /> : null}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  flex: { flex: 1 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.critical },
});
