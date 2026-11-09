import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/misc';
import { URL_SIGNAL_LABEL } from '@/constants/indicators';
import { colors, severityPalette, spacing } from '@/constants/theme';
import { defineStrings, fmt, formatDateTime, tr, useStrings, useUiLanguage } from '@/i18n';
import type { UrlReport, UrlSignalSeverity } from '@/types/security';

const S = defineStrings({
  en: {
    domain: 'Domain',
    finalUrl: 'Final address',
    redirects: 'Redirects',
    status: 'HTTP status',
    title: 'Page title',
    age: 'Domain age',
    ageDays: '{n} days',
    unknown: 'unknown',
    forms: 'Forms',
    password: 'password field',
    card: 'card field',
    noForms: 'none detected',
    inspected: 'Inspected on DaCy server · {time} · no JavaScript executed, no data submitted',
    notInspected: 'Checked on the phone only (address analysis). The link was not opened.',
    error: 'Server inspection failed: {error}',
    info: 'Nothing suspicious',
    low: 'Low',
    medium: 'Suspicious',
    high: 'Dangerous',
  },
  az: {
    domain: 'Domen',
    finalUrl: 'Son ünvan',
    redirects: 'Yönləndirmələr',
    status: 'HTTP status',
    title: 'Səhifə başlığı',
    age: 'Domenin yaşı',
    ageDays: '{n} gün',
    unknown: 'naməlum',
    forms: 'Formlar',
    password: 'şifrə sahəsi',
    card: 'kart sahəsi',
    noForms: 'tapılmadı',
    inspected: 'DaCy serverində yoxlanıldı · {time} · JavaScript işlədilmədi, məlumat göndərilmədi',
    notInspected: 'Yalnız telefonda yoxlanıldı (ünvan analizi). Link açılmadı.',
    error: 'Server yoxlaması alınmadı: {error}',
    info: 'Şübhəli heç nə yoxdur',
    low: 'Aşağı',
    medium: 'Şübhəli',
    high: 'Təhlükəli',
  },
});

const SEVERITY_ICON: Record<UrlSignalSeverity, 'checkmark-circle' | 'information-circle' | 'alert-circle' | 'warning'> = {
  info: 'checkmark-circle',
  low: 'information-circle',
  medium: 'alert-circle',
  high: 'warning',
};

export function UrlReportCard({ report }: { report: UrlReport }) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const palette = severityPalette[report.severity];
  const insp = report.inspection;

  const forms: string[] = [];
  if (insp?.hasPasswordField) forms.push(t.password);
  if (insp?.hasCardField) forms.push(t.card);

  return (
    <Card tone={report.severity === 'info' ? undefined : palette} variant="sunken">
      <View style={styles.header}>
        <Ionicons name="link" size={18} color={palette.fg} />
        <AppText variant="bodyStrong" style={styles.flex} numberOfLines={2} selectable>
          {report.host || report.input}
        </AppText>
        <Badge label={t[report.severity]} icon={SEVERITY_ICON[report.severity]} palette={palette} />
      </View>
      <AppText variant="mono" numberOfLines={3} selectable>
        {report.input}
      </AppText>

      {report.signals.length ? (
        <View style={styles.signals}>
          {report.signals.map((sig, i) => (
            <View key={`${sig.type}-${i}`} style={styles.signalRow}>
              <View style={[styles.dot, { backgroundColor: severityPalette[sig.severity].fg }]} />
              <View style={styles.flex}>
                <AppText variant="smallStrong" color={colors.text}>
                  {tr(URL_SIGNAL_LABEL[sig.type], lang)}
                </AppText>
                <AppText variant="small">{tr(sig.detail, lang)}</AppText>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.kv}>
        <KeyValueRow label={t.domain} value={report.registrableDomain || '—'} mono />
        {insp && !insp.error ? (
          <>
            {insp.finalUrl && insp.finalUrl !== report.normalized ? (
              <KeyValueRow label={t.finalUrl} value={insp.finalUrl} mono />
            ) : null}
            <KeyValueRow label={t.redirects} value={String(insp.redirects.length)} />
            {insp.httpStatus !== null ? <KeyValueRow label={t.status} value={String(insp.httpStatus)} /> : null}
            {insp.pageTitle ? <KeyValueRow label={t.title} value={insp.pageTitle} /> : null}
            <KeyValueRow
              label={t.age}
              value={insp.domainAgeDays === null ? t.unknown : fmt(t.ageDays, { n: insp.domainAgeDays })}
            />
            <KeyValueRow label={t.forms} value={forms.length ? forms.join(', ') : t.noForms} />
          </>
        ) : null}
      </View>

      <AppText variant="small" color={colors.textMuted}>
        {insp
          ? insp.error
            ? fmt(t.error, { error: insp.error })
            : fmt(t.inspected, { time: formatDateTime(insp.inspectedAt, lang) })
          : t.notInspected}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  signals: { gap: spacing.sm },
  signalRow: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  kv: { gap: spacing.xs },
});
