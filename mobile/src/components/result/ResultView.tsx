/**
 * Full result presentation for a text/screen scan or a voice analysis:
 * score gauge, explanation, highlighted evidence, indicators, links,
 * recommended actions and transparent run details.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { FALLBACK_LABEL, MODE_LABEL, ModeBadge } from '@/components/ModeBadge';
import { HighlightedText } from '@/components/result/HighlightedText';
import { IndicatorList } from '@/components/result/IndicatorList';
import { RiskGauge } from '@/components/result/RiskGauge';
import { UrlReportCard } from '@/components/result/UrlReportCard';
import { VoiceAuthenticityCard } from '@/components/result/VoiceAuthenticityCard';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { InlineNotice, KeyValueRow, SectionHeader } from '@/components/ui/misc';
import { BAND_META, CATEGORY_LABEL } from '@/constants/indicators';
import { colors, riskPalette, spacing } from '@/constants/theme';
import { defineStrings, formatDateTime, formatDuration, tr, useStrings, useUiLanguage } from '@/i18n';
import type { ConfidenceLevel, IndicatorCategory, ScanSource, TextScanResult, VoiceScanResult } from '@/types/security';

const S = defineStrings({
  en: {
    riskAssessment: 'Risk assessment',
    conversationRisk: 'Conversation risk',
    whyTitle: 'Why',
    aiSummary: 'AI summary',
    aiSummaryNote: 'Context only — the score is calculated by the deterministic engine.',
    checkedText: 'Checked text',
    transcript: 'Transcript',
    textNotStored: 'The text was not stored (privacy setting).',
    indicators: 'Detected indicators',
    links: 'Links',
    whatToDo: 'What to do now',
    details: 'Analysis details',
    mode: 'Mode',
    model: 'AI model',
    latency: 'Time',
    engine: 'Score engine',
    confidence: 'Confidence',
    when: 'Checked at',
    source: 'Source',
    duration: 'Audio length',
    stt: 'Speech-to-text',
    conf_low: 'Low',
    conf_medium: 'Medium',
    conf_high: 'High',
    src_manual: 'Typed or pasted',
    src_clipboard: 'Clipboard',
    src_shortcut: 'Screen scan shortcut',
    src_screenshot: 'Screenshot',
    src_voice_recording: 'Microphone recording',
    src_voice_file: 'Audio file',
    src_live_call: 'Live call guard',
    none: '—',
  },
  az: {
    riskAssessment: 'Risk qiymətləndirməsi',
    conversationRisk: 'Söhbət riski',
    whyTitle: 'Səbəb',
    aiSummary: 'AI xülasəsi',
    aiSummaryNote: 'Yalnız kontekst üçündür — xalı deterministik mühərrik hesablayır.',
    checkedText: 'Yoxlanılan mətn',
    transcript: 'Transkript',
    textNotStored: 'Mətn saxlanılmadı (məxfilik ayarı).',
    indicators: 'Tapılan göstəricilər',
    links: 'Linklər',
    whatToDo: 'İndi nə etməli',
    details: 'Analiz detalları',
    mode: 'Rejim',
    model: 'AI modeli',
    latency: 'Müddət',
    engine: 'Xal mühərriki',
    confidence: 'Etibarlılıq',
    when: 'Yoxlama vaxtı',
    source: 'Mənbə',
    duration: 'Səsin uzunluğu',
    stt: 'Nitqin mətnə çevrilməsi',
    conf_low: 'Aşağı',
    conf_medium: 'Orta',
    conf_high: 'Yüksək',
    src_manual: 'Yazılıb və ya yapışdırılıb',
    src_clipboard: 'Bufer',
    src_shortcut: 'Ekran skanı qısayolu',
    src_screenshot: 'Ekran şəkli',
    src_voice_recording: 'Mikrofon yazısı',
    src_voice_file: 'Səs faylı',
    src_live_call: 'Canlı zəng qoruması',
    none: '—',
  },
});

const SOURCE_KEY: Record<ScanSource, keyof typeof S.en> = {
  manual: 'src_manual',
  clipboard: 'src_clipboard',
  shortcut: 'src_shortcut',
  screenshot: 'src_screenshot',
  voice_recording: 'src_voice_recording',
  voice_file: 'src_voice_file',
  live_call: 'src_live_call',
};

const CONF_KEY: Record<ConfidenceLevel, keyof typeof S.en> = {
  low: 'conf_low',
  medium: 'conf_medium',
  high: 'conf_high',
};

const CATEGORY_ICON: Record<Exclude<IndicatorCategory, 'protective'>, 'cash-outline' | 'pulse-outline' | 'bug-outline' | 'happy-outline'> = {
  financial: 'cash-outline',
  psychological: 'pulse-outline',
  technical: 'bug-outline',
  child_safety: 'happy-outline',
};

export interface ResultViewProps {
  result: TextScanResult | VoiceScanResult;
  /** Optional actions rendered under the score card. */
  actions?: ReactNode;
}

export function ResultView({ result, actions }: ResultViewProps) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const { assessment, run } = result;
  const palette = riskPalette[assessment.band];
  const isVoice = result.kind === 'voice';
  const content = isVoice ? result.transcript : result.text;
  const urls = result.kind === 'text' ? result.urls : [];

  const activeCategories = (['financial', 'psychological', 'technical', 'child_safety'] as const).filter((c) =>
    c === 'child_safety' ? assessment.categories.childSafety : assessment.categories[c],
  );

  return (
    <View style={styles.root}>
      {run.fallbackReason ? <InlineNotice tone="warning">{tr(FALLBACK_LABEL[run.fallbackReason], lang)}</InlineNotice> : null}

      <Card tone={palette} variant="raised">
        <View style={styles.cardTop}>
          <AppText variant="caption">{isVoice ? t.conversationRisk : t.riskAssessment}</AppText>
          <ModeBadge mode={run.modeUsed} />
        </View>
        <RiskGauge score={assessment.score} band={assessment.band} />
        <AppText variant="body" align="center" color={colors.text}>
          {tr(BAND_META[assessment.band].lead, lang)}
        </AppText>
        {activeCategories.length ? (
          <View style={styles.tagRow}>
            {activeCategories.map((cat) => (
              <Badge key={cat} label={tr(CATEGORY_LABEL[cat], lang)} icon={CATEGORY_ICON[cat]} palette={palette} size="md" />
            ))}
          </View>
        ) : null}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </Card>

      <Card>
        <SectionHeader title={t.whyTitle} />
        <AppText variant="body">{tr(assessment.explanation, lang)}</AppText>
        {assessment.combos.length ? (
          <View style={styles.combos}>
            {assessment.combos.map((combo) => (
              <View key={combo.id} style={styles.comboRow}>
                <Ionicons name="git-merge-outline" size={16} color={palette.fg} />
                <AppText variant="small" style={styles.flex}>
                  {tr(combo.label, lang)}
                </AppText>
                <AppText variant="smallStrong" color={palette.fg}>
                  +{combo.points}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {run.aiSummary ? (
        <Card>
          <View style={styles.cardTop}>
            <SectionHeader title={t.aiSummary} />
            <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
          </View>
          <AppText variant="body">{run.aiSummary}</AppText>
          <AppText variant="small" color={colors.textMuted}>
            {t.aiSummaryNote}
          </AppText>
        </Card>
      ) : null}

      {result.kind === 'voice' ? <VoiceAuthenticityCard authenticity={result.authenticity} /> : null}

      <Card>
        <View style={styles.cardTop}>
          <SectionHeader title={isVoice ? t.transcript : t.checkedText} />
        </View>
        {content ? (
          <HighlightedText text={content} indicators={assessment.indicators} urls={urls} />
        ) : (
          <AppText variant="small" color={colors.textMuted}>
            {t.textNotStored}
          </AppText>
        )}
      </Card>

      <Card>
        <SectionHeader title={t.indicators} />
        <IndicatorList indicators={assessment.indicators} />
      </Card>

      {urls.length ? (
        <View style={styles.section}>
          <SectionHeader title={t.links} />
          {urls.map((u, i) => (
            <UrlReportCard key={`${u.normalized}-${i}`} report={u} />
          ))}
        </View>
      ) : null}

      {assessment.recommendations.length ? (
        <Card tone={assessment.band === 'low' ? undefined : palette}>
          <SectionHeader title={t.whatToDo} />
          {assessment.recommendations.map((rec, i) => (
            <View key={i} style={styles.recRow}>
              <View style={[styles.recNum, { borderColor: palette.fg }]}>
                <AppText variant="smallStrong" color={palette.fg}>
                  {i + 1}
                </AppText>
              </View>
              <AppText variant="body" style={styles.flex}>
                {tr(rec, lang)}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      <Card variant="sunken">
        <SectionHeader title={t.details} />
        <View style={styles.kv}>
          <KeyValueRow label={t.mode} value={tr(MODE_LABEL[run.modeUsed], lang)} />
          <KeyValueRow label={t.model} value={run.aiModel ?? t.none} mono={!!run.aiModel} />
          {result.kind === 'voice' ? (
            <>
              <KeyValueRow label={t.duration} value={formatDuration(result.durationMs)} />
              <KeyValueRow label={t.stt} value={result.sttProvider ?? t.none} />
            </>
          ) : null}
          <KeyValueRow label={t.latency} value={`${(run.latencyMs / 1000).toFixed(1)} s`} />
          <KeyValueRow label={t.confidence} value={`${t[CONF_KEY[assessment.confidence]]} — ${tr(assessment.confidenceReason, lang)}`} />
          <KeyValueRow label={t.engine} value={assessment.engineVersion} mono />
          <KeyValueRow label={t.source} value={t[SOURCE_KEY[result.source]]} />
          <KeyValueRow label={t.when} value={formatDateTime(result.createdAt, lang)} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  combos: { gap: spacing.sm },
  comboRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  section: { gap: spacing.md },
  recRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  recNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  kv: { gap: spacing.sm },
});
