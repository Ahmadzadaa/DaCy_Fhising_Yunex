/**
 * Screen Scan entry point. Opened by the iOS Shortcut:
 *   Take Screenshot → Extract Text from Image (on-device Apple OCR) → URL Encode → Open URL
 *   <dev link>/--/scan?text=<encoded text>          (Expo Go)
 *   …/scan?from=clipboard                             (fallback: the shortcut copies the text first)
 * The text is analysed immediately; nothing has to be pasted into the app.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AnalyzingCard } from '@/components/AnalyzingCard';
import { NotifyFamilyButton } from '@/components/NotifyFamilyButton';
import { ResultView } from '@/components/result/ResultView';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, InlineNotice } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { defineStrings, useStrings } from '@/i18n';
import { resolveMode, runTextAnalysis } from '@/services/ai/modelProvider';
import { useHistory } from '@/state/history';
import { useServerStatus } from '@/state/serverStatus';
import { useSettings } from '@/state/settings';
import { useProviderContext } from '@/state/useProviderContext';
import type { TextScanResult } from '@/types/security';

const S = defineStrings({
  en: {
    reading: 'Scanning your screen…',
    noTextTitle: 'No screen text received',
    noTextBody: 'Run the DaCy Screen Scan shortcut while the suspicious message is on screen.',
    guide: 'How to set up the shortcut',
    truncated: 'Long screen — only the first 20,000 characters were checked.',
    done: 'Done',
  },
  az: {
    reading: 'Ekranınız skan edilir…',
    noTextTitle: 'Ekran mətni gəlmədi',
    noTextBody: 'Şübhəli mesaj ekranda açıq olanda DaCy Ekran Skanı qısayolunu işə salın.',
    guide: 'Qısayolu necə qurmalı',
    truncated: 'Ekran uzundur — yalnız ilk 20 000 simvol yoxlanıldı.',
    done: 'Hazır',
  },
});

const MAX_CHARS = 20_000;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default function ScanScreen() {
  const t = useStrings(S);
  const params = useLocalSearchParams<{ text?: string; from?: string }>();
  const { loaded } = useSettings();
  const { status } = useServerStatus();
  const ctx = useProviderContext();
  const { add } = useHistory();
  const [result, setResult] = useState<TextScanResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const handledKey = useRef<string | null>(null);

  const rawText = firstParam(params.text);
  const from = firstParam(params.from);
  // Wait until settings are loaded and the first server check finished, so the right mode is used.
  const ready = loaded && status !== 'checking';

  useEffect(() => {
    if (!ready) return;
    const key = `${from}|${rawText}`;
    if (handledKey.current === key) return;
    handledKey.current = key;

    let cancelled = false;
    (async () => {
      let text = rawText;
      if (!text && from === 'clipboard') text = await Clipboard.getStringAsync().catch(() => '');
      text = text.replace(/\r\n/g, '\n').trim();
      if (!text) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setResult(null);
      setTruncated(text.length > MAX_CHARS);
      const scan = await runTextAnalysis({ text: text.slice(0, MAX_CHARS), source: 'shortcut', context: 'screen', ctx });
      if (cancelled) return;
      add(scan);
      setResult(scan);
      const band = scan.assessment.band;
      Haptics.notificationAsync(
        band === 'critical' || band === 'high' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, rawText, from, ctx, add]);

  if (missing) {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <EmptyState
            icon="scan-outline"
            title={t.noTextTitle}
            body={t.noTextBody}
            actionLabel={t.guide}
            onAction={() => router.replace('/shortcut-guide')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      {!result ? <AnalyzingCard mode={resolveMode(ctx).mode} title={t.reading} /> : null}
      {truncated ? <InlineNotice tone="info">{t.truncated}</InlineNotice> : null}
      {result ? (
        <ResultView
          result={result}
          actions={
            <>
              <NotifyFamilyButton assessment={result.assessment} source="screen" />
              <Button label={t.done} variant="ghost" fullWidth onPress={() => router.replace('/')} />
            </>
          }
        />
      ) : null}
    </Screen>
  );
}
