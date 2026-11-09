/**
 * Dashboard — minimal.
 *
 * One status line, one primary action, and a short list of the other essential
 * actions. Everything secondary (server details, capabilities, family link) is
 * behind "More" or an info icon.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { InfoTip } from '@/components/ui/InfoTip';
import { Screen } from '@/components/ui/Screen';
import type { IconName } from '@/constants/indicators';
import { colors, radius, spacing } from '@/constants/theme';
import { defineStrings, fmt, formatRelative, useStrings, useUiLanguage } from '@/i18n';
import { useFamily } from '@/state/family';
import { useHistory } from '@/state/history';
import { useServerStatus } from '@/state/serverStatus';
import { useSettings } from '@/state/settings';

const S = defineStrings({
  en: {
    protected: 'Protected',
    offline: 'Offline mode',
    checking: 'Connecting…',
    alert: 'New family alert',
    tipOnline: 'DaCy checks messages, links and calls. The final score is always calculated on this phone.',
    tipOffline: 'The server is not reachable. Messages are still checked on this phone; live calls need the server.',
    check: 'Check a message',
    callGuard: 'Call Guard',
    family: 'Family',
    scan: 'Screen Scan',
    history: 'History',
    more: 'More',
    less: 'Less',
    server: 'Server',
    ai: 'AI analysis',
    speech: 'Speech-to-text',
    links: 'Link sandbox',
    familyLink: 'Family link',
    on: 'On',
    off: 'Off',
    guardian: 'Guardian',
    protectedRole: 'Protected',
    notLinked: 'Not linked',
    last: 'Last check {when}',
  },
  az: {
    protected: 'Qorunursunuz',
    offline: 'Oflayn rejim',
    checking: 'Qoşulur…',
    alert: 'Yeni ailə xəbərdarlığı',
    tipOnline: 'DaCy mesajları, linkləri və zəngləri yoxlayır. Yekun bal həmişə bu telefonda hesablanır.',
    tipOffline: 'Server əlçatan deyil. Mesajlar yenə bu telefonda yoxlanılır; canlı zəng üçün server lazımdır.',
    check: 'Mesajı yoxla',
    callGuard: 'Zəng qoruması',
    family: 'Ailə',
    scan: 'Ekran skanı',
    history: 'Tarixçə',
    more: 'Ətraflı',
    less: 'Gizlət',
    server: 'Server',
    ai: 'AI analiz',
    speech: 'Nitq→mətn',
    links: 'Link sandbox',
    familyLink: 'Ailə əlaqəsi',
    on: 'Aktiv',
    off: 'Deaktiv',
    guardian: 'Qəyyum',
    protectedRole: 'Qorunan',
    notLinked: 'Qoşulmayıb',
    last: 'Son yoxlama: {when}',
  },
});

type Href = '/voice' | '/family' | '/shortcut-guide' | '/history';

function Row({ icon, label, href, last, badge }: { icon: IconName; label: string; href: Href; last?: boolean; badge?: boolean }) {
  return (
    <Pressable
      onPress={() => router.navigate(href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      {badge ? <View style={styles.badge} /> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

function Detail({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <View style={styles.detail}>
      <AppText variant="small" color={colors.textSecondary} style={styles.flex}>
        {label}
      </AppText>
      <View style={[styles.dot, { backgroundColor: on ? colors.primary : colors.borderStrong }]} />
      <AppText variant="small" color={colors.text}>
        {value}
      </AppText>
    </View>
  );
}

export default function HomeScreen() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const { settings, update } = useSettings();
  const { status, health, refresh } = useServerStatus();
  const { stats } = useHistory();
  const { link, unseenCount } = useFamily();
  const [more, setMore] = useState(false);

  const online = status === 'online';
  const familyAlert = link?.role === 'guardian' && unseenCount > 0;
  const statusText = familyAlert ? t.alert : online ? t.protected : status === 'checking' ? t.checking : t.offline;
  const statusColor = familyAlert ? colors.critical : online ? colors.primary : colors.textSecondary;
  const statusIcon: IconName = familyAlert ? 'alert-circle' : online ? 'checkmark-circle' : 'cloud-offline';

  return (
    <Screen refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={colors.textMuted} />}>
      {/* Header */}
      <View style={styles.header}>
        <AppText variant="display" style={styles.flex}>
          DaCy
        </AppText>
        <Pressable
          onPress={() => update({ uiLanguage: settings.uiLanguage === 'en' ? 'az' : 'en' })}
          accessibilityRole="button"
          accessibilityLabel="Language"
          hitSlop={8}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <AppText variant="smallStrong" color={colors.text}>
            {settings.uiLanguage === 'en' ? 'EN' : 'AZ'}
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      {/* Status */}
      <View style={styles.status}>
        <Ionicons name={statusIcon} size={56} color={statusColor} />
        <View style={styles.statusLine}>
          <AppText variant="title" color={colors.text}>
            {statusText}
          </AppText>
          <InfoTip text={online ? t.tipOnline : t.tipOffline} align="center" />
        </View>
        {stats.lastScanAt ? (
          <AppText variant="small" color={colors.textSecondary}>
            {fmt(t.last, { when: formatRelative(stats.lastScanAt, lang) })}
          </AppText>
        ) : null}
        <Pressable onPress={() => setMore((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: more }} hitSlop={8} style={styles.moreBtn}>
          <AppText variant="smallStrong" color={colors.primary}>
            {more ? t.less : t.more}
          </AppText>
          <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
        </Pressable>
        {more ? (
          <View style={styles.details}>
            <Detail label={t.server} value={online ? t.on : t.off} on={online} />
            <Detail label={t.ai} value={online && health?.capabilities.llm ? t.on : t.off} on={online && !!health?.capabilities.llm} />
            <Detail label={t.speech} value={online && health?.capabilities.stt ? t.on : t.off} on={online && !!health?.capabilities.stt} />
            <Detail label={t.links} value={online && health?.capabilities.urlInspection ? t.on : t.off} on={online && !!health?.capabilities.urlInspection} />
            <Detail
              label={t.familyLink}
              value={link ? (link.role === 'guardian' ? `${t.guardian} · ${link.code}` : t.protectedRole) : t.notLinked}
              on={!!link}
            />
          </View>
        ) : null}
      </View>

      {/* Primary action */}
      <Button label={t.check} size="lg" fullWidth onPress={() => router.navigate('/analyze')} />

      {/* Other essential actions */}
      <View style={styles.list}>
        <Row icon="call-outline" label={t.callGuard} href="/voice" />
        <Row icon="people-outline" label={t.family} href="/family" badge={familyAlert} />
        <Row icon="scan-outline" label={t.scan} href="/shortcut-guide" />
        <Row icon="time-outline" label={t.history} href="/history" last />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBtn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, zIndex: 10 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.xs },
  details: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  badge: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.critical },
});
