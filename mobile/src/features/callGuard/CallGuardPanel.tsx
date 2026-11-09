import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FALLBACK_LABEL, ModeBadge } from '@/components/ModeBadge';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { InfoTip } from '@/components/ui/InfoTip';
import { InlineNotice, SegmentedControl } from '@/components/ui/misc';
import { INDICATOR_META, type IconName } from '@/constants/indicators';
import { colors, radius, riskPalette, spacing } from '@/constants/theme';
import { useCallGuard, type CallerSelection } from '@/features/callGuard/useCallGuard';
import { defineStrings, fmt, formatDuration, tr, useStrings, useUiLanguage } from '@/i18n';
import { useFamily } from '@/state/family';
import { useSettings } from '@/state/settings';

const S = defineStrings({
  en: {
    howTitle: 'How Call Guard works',
    howBody:
      'Put the call on speakerphone and place this phone next to it. DaCy listens in real time, transcribes every few seconds and scores the conversation on this phone. iOS gives no app access to call audio, so in production the audio stream comes from the mobile operator.',
    caller: 'Incoming caller (caller ID)',
    callerHint: 'Choose who is calling: iPhone does not share caller ID with apps. In production the operator provides the number.',
    unknown: 'Unknown number',
    trusted: 'Trusted',
    addTrusted: 'Add trusted contacts',
    speech: 'Speech language',
    auto: 'Auto',
    start: 'Start Call Guard',
    stop: 'End call guard',
    identifying: 'Identifying the call… {s}s',
    guarding: 'Guarding the call',
    listening: 'Listening',
    trustedOverride: 'Trusted number, but the first words contain risk signals — DaCy keeps listening.',
    transcript: 'Live transcript (memory only, deleted after the call)',
    waiting: 'Waiting for speech…',
    latency: 'Speech-to-text {stt} ms · AI {ai} ms',
    chunks: '{n} segments · {sent} sent to speech-to-text',
    warningTitle: 'Likely scam',
    spoken: 'Spoken aloud',
    familyLive: 'Family alerted',
    familyLocal: 'Family alert saved (prototype mode)',
    trustedStoppedTitle: 'Trusted contact — DaCy switched off',
    trustedStoppedBody: '{name} is in your trusted circle. DaCy deleted the first 5 seconds it heard and stopped listening.',
    endedTitle: 'Call guard ended',
    endedBody: 'Saved to history as metadata only (no transcript, no audio).',
    peak: 'Peak risk',
    found: 'Detected',
    again: 'Guard another call',
    none: 'No risk indicators',
    quiet: 'No sound detected yet. Put the call on speaker and hold this phone close to it.',
    unavailable: 'Needs the DaCy server with speech-to-text (see Settings).',
    identifyHint: 'First 5 seconds: identifying the caller',
    who: 'Who is calling?',
    more: 'More',
    less: 'Less',
    risk: 'Risk',
    band_low: 'Low',
    band_moderate: 'Moderate',
    band_high: 'High',
    band_critical: 'Critical',
    showTranscript: 'Transcript and details',
    pending: 'DaCy will warn you aloud as soon as the caller pauses — it will not cut in mid-sentence.',
  },
  az: {
    howTitle: 'Zəng qoruması necə işləyir',
    howBody:
      'Zəngi dinamikə qoyun və bu telefonu yanında saxlayın. DaCy real vaxtda dinləyir, bir neçə saniyədən bir mətnə çevirir və söhbəti bu telefonda qiymətləndirir. iOS heç bir tətbiqə zəng səsini vermir, ona görə real məhsulda səs axını mobil operatordan gəlir.',
    caller: 'Zəng edən (nömrə)',
    callerHint: 'Kimin zəng etdiyini seçin: iPhone zəng edənin nömrəsini tətbiqlərə vermir. Real məhsulda nömrəni operator ötürür.',
    unknown: 'Naməlum nömrə',
    trusted: 'Etibarlı',
    addTrusted: 'Etibarlı kontakt əlavə et',
    speech: 'Nitq dili',
    auto: 'Avto',
    start: 'Zəng qorumasını başlat',
    stop: 'Zəng qorumasını bitir',
    identifying: 'Zəng yoxlanılır… {s} san',
    guarding: 'Zəng qorunur',
    listening: 'Dinləyir',
    trustedOverride: 'Etibarlı nömrədir, amma ilk sözlərdə risk əlaməti var — DaCy dinləməyə davam edir.',
    transcript: 'Canlı transkript (yalnız yaddaşda, zəngdən sonra silinir)',
    waiting: 'Nitq gözlənilir…',
    latency: 'Nitq→mətn {stt} ms · AI {ai} ms',
    chunks: '{n} səs parçası · {sent} mətnə çevrilməyə göndərildi',
    warningTitle: 'Ehtimal ki, fırıldaqdır',
    spoken: 'Səsli deyildi',
    familyLive: 'Ailəyə xəbər verildi',
    familyLocal: 'Ailə xəbərdarlığı saxlanıldı (prototip rejimi)',
    trustedStoppedTitle: 'Etibarlı kontakt — DaCy söndü',
    trustedStoppedBody: '{name} etibarlı dairənizdədir. DaCy eşitdiyi ilk 5 saniyəni sildi və dinləməni dayandırdı.',
    endedTitle: 'Zəng qoruması bitdi',
    endedBody: 'Tarixçəyə yalnız metadata kimi yazıldı (transkript və səs yoxdur).',
    peak: 'Ən yüksək risk',
    found: 'Tapılanlar',
    again: 'Başqa zəngi qoru',
    none: 'Risk göstəricisi yoxdur',
    quiet: 'Hələ səs eşidilmir. Zəngi dinamikə qoyun və bu telefonu ona yaxın tutun.',
    unavailable: 'Nitqi mətnə çevirən DaCy serveri lazımdır (Ayarlara baxın).',
    identifyHint: 'İlk 5 saniyə: zəng edən müəyyənləşdirilir',
    who: 'Kim zəng edir?',
    more: 'Ətraflı',
    less: 'Gizlət',
    risk: 'Risk',
    band_low: 'Aşağı',
    band_moderate: 'Orta',
    band_high: 'Yüksək',
    band_critical: 'Kritik',
    showTranscript: 'Transkript və detallar',
    pending: 'Zəng edən susan kimi DaCy sizi səsli xəbərdar edəcək — sözünü yarıda kəsməyəcək.',
  },
});

export function CallGuardPanel() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const { settings, update } = useSettings();
  const { contacts } = useFamily();
  const { state, start, stop, reset, liveAvailable } = useCallGuard();
  const [callerKey, setCallerKey] = useState<string>('unknown');
  const [more, setMore] = useState(false);
  const [details, setDetails] = useState(false);

  const selectedContact = contacts.find((c) => c.id === callerKey);
  const caller: CallerSelection = selectedContact
    ? { label: `${selectedContact.name} (${selectedContact.relation || selectedContact.phone})`, trusted: true }
    : { label: t.unknown, trusted: false };

  const active = state.phase === 'identifying' || state.phase === 'guarding' || state.phase === 'starting';
  const palette = state.assessment ? riskPalette[state.assessment.band] : riskPalette.low;
  // Level bar: the single accent while calm, red once DaCy has warned.
  const levelColor = state.warningLevel > 0 ? colors.critical : colors.primary;
  const bandLabel = (b: 'low' | 'moderate' | 'high' | 'critical') => t[`band_${b}`];

  /* ---------------- finished states ---------------- */

  if (state.phase === 'trusted_stopped' && state.summary) {
    return (
      <View style={styles.root}>
        <Card tone={riskPalette.low} variant="raised">
          <View style={styles.rowCenter}>
            <Ionicons name="shield-checkmark" size={32} color={colors.low} />
            <AppText variant="heading" style={styles.flex}>
              {t.trustedStoppedTitle}
            </AppText>
          </View>
          <AppText variant="body">{fmt(t.trustedStoppedBody, { name: state.summary.callerLabel })}</AppText>
          <Button label={t.again} icon="refresh-outline" variant="secondary" fullWidth onPress={reset} />
        </Card>
      </View>
    );
  }

  if (state.phase === 'ended' && state.summary) {
    const s = state.summary;
    const p = riskPalette[s.peakBand];
    return (
      <View style={styles.root}>
        <Card tone={s.warningsSpoken ? p : undefined} variant="raised">
          <AppText variant="heading">{t.endedTitle}</AppText>
          <AppText variant="small">{t.endedBody}</AppText>
          <View style={styles.rowWrap}>
            <Badge label={`${t.peak}: ${s.peakScore}`} palette={p} size="md" />
            <Badge label={formatDuration(s.durationMs)} icon="time-outline" size="md" />
            {s.familyNotified ? (
              <Badge
                label={state.familyDelivery === 'local' ? t.familyLocal : t.familyLive}
                icon="people-outline"
                size="md"
                palette={state.familyDelivery === 'local' ? undefined : riskPalette.low}
              />
            ) : null}
          </View>
          <AppText variant="caption">{t.found}</AppText>
          {s.indicatorTypes.length ? (
            <View style={styles.rowWrap}>
              {s.indicatorTypes.map((type) => (
                <Badge key={type} label={tr(INDICATOR_META[type].label, lang)} icon={INDICATOR_META[type].icon} />
              ))}
            </View>
          ) : (
            <AppText variant="small">{t.none}</AppText>
          )}
          <Button label={t.again} icon="refresh-outline" variant="secondary" fullWidth onPress={reset} />
        </Card>
      </View>
    );
  }

  /* ---------------- idle ---------------- */

  if (!active) {
    return (
      <View style={styles.root}>
        <View style={styles.labelRow}>
          <AppText variant="heading">{t.who}</AppText>
          <InfoTip text={`${t.callerHint} ${t.howBody}`} />
        </View>

        <View style={styles.list}>
          <CallerRow label={t.unknown} icon="help-circle-outline" selected={callerKey === 'unknown'} onPress={() => setCallerKey('unknown')} />
          {contacts.map((c) => (
            <CallerRow
              key={c.id}
              label={c.name}
              sub={t.trusted}
              icon="person-circle-outline"
              selected={callerKey === c.id}
              onPress={() => setCallerKey(c.id)}
            />
          ))}
          <Pressable
            onPress={() => router.navigate('/family')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Ionicons name="add" size={22} color={colors.primary} />
            <AppText variant="body" color={colors.primary} style={styles.flex}>
              {t.addTrusted}
            </AppText>
          </Pressable>
        </View>

        <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: more }} hitSlop={8} style={styles.moreBtn}>
          <AppText variant="smallStrong" color={colors.primary}>
            {more ? t.less : t.more}
          </AppText>
          <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </Pressable>
        {more ? (
          <View style={styles.moreBox}>
            <AppText variant="caption">{t.speech}</AppText>
            <SegmentedControl
              value={settings.speechLanguage}
              onChange={(v) => update({ speechLanguage: v })}
              options={[
                { value: 'en', label: 'English' },
                { value: 'az', label: 'Azərbaycanca' },
                { value: 'auto', label: t.auto },
              ]}
            />
          </View>
        ) : null}

        {state.phase === 'error' && state.error ? <InlineNotice tone="warning">{tr(state.error, lang)}</InlineNotice> : null}

        <Button label={t.start} icon="mic-outline" size="lg" fullWidth disabled={!liveAvailable} onPress={() => void start(caller)} />
        {!liveAvailable ? (
          <AppText variant="small" color={colors.textSecondary} align="center">
            {t.unavailable}
          </AppText>
        ) : null}
      </View>
    );
  }

  /* ---------------- active ---------------- */

  const a = state.assessment;
  const ex = state.explanation;
  return (
    <View style={styles.root}>
      <View style={styles.live}>
        <AppText variant="smallStrong" color={state.warningLevel ? colors.critical : colors.primary}>
          {state.phase === 'identifying' ? fmt(t.identifying, { s: Math.max(0, Math.ceil((5_000 - state.elapsedMs) / 1000)) }) : t.guarding}
        </AppText>
        <AppText variant="hero" style={styles.timer}>
          {formatDuration(state.elapsedMs)}
        </AppText>
        <AppText variant="body" color={colors.textSecondary} numberOfLines={1}>
          {state.caller?.label}
        </AppText>
        <View style={styles.levelTrack} accessibilityLabel={t.listening}>
          <View style={[styles.levelFill, { width: `${Math.round(Math.min(1, state.level) * 100)}%`, backgroundColor: levelColor }]} />
        </View>
      </View>

      {ex ? (
        <View
          style={[
            styles.warning,
            state.warningLevel > 0 ? { borderColor: palette.border, backgroundColor: palette.bg } : { borderColor: colors.border, backgroundColor: colors.bg },
          ]}
          accessibilityLiveRegion={state.warningLevel === 2 ? 'assertive' : 'polite'}>
          <View style={styles.rowCenter}>
            <Ionicons
              name={state.warningLevel === 2 ? 'warning' : state.warningLevel === 1 ? 'alert-circle' : 'shield-checkmark-outline'}
              size={22}
              color={state.warningLevel > 0 ? palette.fg : colors.primary}
            />
            <AppText variant="heading" color={state.warningLevel > 0 ? palette.fg : colors.text} style={styles.flex}>
              {tr(ex.headline, lang)}
            </AppText>
          </View>
          {state.aiSummary ? (
            <AppText variant="body" color={colors.text}>
              {state.aiSummary}
            </AppText>
          ) : null}
          {ex.points.map((p, i) => (
            <View key={`${i}-${p.quote ?? ''}`} style={styles.point}>
              <Ionicons
                name={p.tone === 'risk' ? 'alert-circle' : p.tone === 'ok' ? 'checkmark-circle' : 'information-circle'}
                size={18}
                color={p.tone === 'risk' ? palette.fg : p.tone === 'ok' ? colors.primary : colors.textSecondary}
                style={styles.pointIcon}
              />
              <AppText variant="small" color={colors.text} style={styles.flex}>
                {p.quote ? <AppText variant="smallStrong" color={colors.text}>“{p.quote}” </AppText> : null}
                {p.quote && p.tone === 'risk' ? '— ' : ''}
                {tr(p.text, lang)}
              </AppText>
            </View>
          ))}
          {ex.advice ? (
            <AppText variant="smallStrong" color={state.warningLevel > 0 ? palette.fg : colors.text}>
              {tr(ex.advice, lang)}
            </AppText>
          ) : null}
          {state.warningPending ? (
            <AppText variant="small" color={colors.textSecondary}>
              {t.pending}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {a ? (
        <View style={styles.riskRow}>
          <AppText variant="body" color={colors.textSecondary} style={styles.flex}>
            {t.risk}
          </AppText>
          <AppText variant="title" color={a.band === 'low' ? colors.text : riskPalette[a.band].fg}>
            {a.score}
          </AppText>
          <AppText variant="body" color={colors.textSecondary}>
            / 100 · {bandLabel(a.band)}
          </AppText>
        </View>
      ) : null}

      <Pressable onPress={() => setDetails((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: details }} hitSlop={8} style={styles.moreBtn}>
        <AppText variant="smallStrong" color={colors.primary}>
          {t.showTranscript}
        </AppText>
        <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
      </Pressable>
      {details ? (
        <View style={styles.moreBox}>
          <View style={styles.rowWrap}>
            <ModeBadge mode={state.modeUsed} />
            {settings.spokenWarnings && state.warningLevel ? <Badge label={t.spoken} icon="volume-high-outline" /> : null}
            {state.familyDelivery ? <Badge label={state.familyDelivery === 'live' ? t.familyLive : t.familyLocal} icon="people-outline" /> : null}
          </View>
          {a && a.indicators.some((i) => i.points > 0) ? (
            <View style={styles.rowWrap}>
              {a.indicators
                .filter((i) => i.points > 0)
                .map((i) => (
                  <Badge key={i.id} label={`${tr(INDICATOR_META[i.type].label, lang)} +${i.points}`} />
                ))}
            </View>
          ) : null}
          <AppText variant="caption">{t.transcript}</AppText>
          {state.lines.length ? (
            state.lines.map((line) => (
              <AppText key={`${line.seq}-${line.text.slice(0, 12)}`} variant="body">
                {line.text}
              </AppText>
            ))
          ) : (
            <AppText variant="small" color={colors.textMuted}>
              {t.waiting}
            </AppText>
          )}
          <AppText variant="small" color={colors.textMuted}>
            {fmt(t.chunks, { n: state.chunksAnalyzed, sent: state.chunksSent })}
            {state.lastLatency ? ` · ${fmt(t.latency, { stt: state.lastLatency.stt, ai: state.lastLatency.ai })}` : ''}
          </AppText>
        </View>
      ) : null}

      {state.fallbackReason ? <InlineNotice tone="warning">{tr(FALLBACK_LABEL[state.fallbackReason], lang)}</InlineNotice> : null}
      {state.trustedRiskOverride ? <InlineNotice tone="warning">{t.trustedOverride}</InlineNotice> : null}
      {state.issue ? <InlineNotice tone="warning">{state.issue}</InlineNotice> : null}
      {state.elapsedMs > 6_000 && state.level < 0.05 && state.chunksSent === 0 ? <InlineNotice tone="info">{t.quiet}</InlineNotice> : null}

      <Button label={t.stop} icon="stop-circle-outline" variant="danger" size="lg" fullWidth onPress={stop} />
    </View>
  );
}

function CallerRow({ label, sub, icon, selected, onPress }: { label: string; sub?: string; icon: IconName; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <View style={styles.flex}>
        <AppText variant="body">{label}</AppText>
        {sub ? (
          <AppText variant="small" color={colors.textSecondary}>
            {sub}
          </AppText>
        ) : null}
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.primary : colors.borderStrong} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  flex: { flex: 1 },
  pressed: { opacity: 0.5 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, zIndex: 10 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  moreBox: { gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  live: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  timer: { fontVariant: ['tabular-nums'] },
  levelTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden', marginTop: spacing.md },
  levelFill: { height: 4, borderRadius: 2 },
  warning: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  pointIcon: { marginTop: 1 },
  riskRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
});
