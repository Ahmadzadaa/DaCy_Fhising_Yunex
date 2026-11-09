/**
 * Family tab section "Child protection · DaCy Kids".
 *  - Guardian (or a phone that is not linked yet): choose which apps are screened,
 *    the gentle child tip, save (live sync or kept on this phone), honest platform
 *    notes and the child-phone simulator.
 *  - Protected member: a calm transparency card — what the guardian chose and what is
 *    shared. Honest about the platform: this build cannot screen other apps (iPhone
 *    forbids it; the Android agent is not part of the Expo Go demo).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppGlyph } from '@/components/kids/AppGlyph';
import { effectiveChildSettings, KIDS_AGENT_AVAILABLE, KIDS_AGENT_LIMIT } from '@/components/kids/childSettings';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, IconCircle, InlineNotice, SectionHeader, ToggleRow } from '@/components/ui/misc';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { colors, radius, riskPalette, spacing } from '@/constants/theme';
import { defineStrings, fmt, tr, useStrings, useUiLanguage } from '@/i18n';
import { useFamily } from '@/state/family';
import { MONITORED_APP_IDS, type FamilyRole, type MonitoredAppId } from '@/types/security';

const S = defineStrings({
  en: {
    section: 'Child protection · DaCy Kids',
    introTitle: 'Your child uses the phone as usual',
    introCaveat:
      'On iPhone, Apple does not let any app read other apps — app screening works on Android with the DaCy agent. This demo shows it in a simulator.',
    introBody:
      'DaCy screens only the apps you choose, only while one of them is open, and never interrupts. If a chat starts to look like grooming — a stranger building trust, asking for secrecy, personal details or photos — you get a short alert. You never see the messages.',
    notSavedTitle: 'Not saved yet',
    notSavedBody: 'Your child’s phone is not screened until you save. The recommended apps are pre-selected below.',
    liveSync: 'Live sync',
    thisPhone: 'On this phone',
    defaults: 'Recommended defaults',
    enable: 'Screen selected apps',
    enableHint: 'Only while one of them is open on the child’s phone.',
    apps: 'Apps to screen',
    selectedCount: '{n} of {total} selected',
    selectAll: 'Select all',
    clear: 'Clear',
    childTip: 'Gentle tip for the child',
    childTipHint: 'When something looks risky, the child sees a short private tip. Nothing is blocked.',
    noApps: 'Select at least one app to screen.',
    offState: 'DaCy Kids is off. No app is screened.',
    save: 'Save settings',
    upToDate: 'Settings saved',
    savedLive: 'Synced to your family. It takes effect on Android phones with the DaCy agent — iPhones cannot screen other apps.',
    savedLocalUnlinked: 'Saved on this phone. Create or join a family above to sync it to your child’s phone.',
    savedLocalOffline: 'Saved on this phone. It will sync when the DaCy server is reachable.',
    saveError: 'Not synced: {message}. Your choice is kept on this phone.',
    platformTitle: 'How it works on real phones',
    android:
      'Android — the DaCy agent (Accessibility and notification access, set up with your consent) screens only the selected apps, and only while they are open.',
    iphone:
      'iPhone — Apple does not let any app read other apps. DaCy relies on Apple Communication Safety (Screen Time), DaCy Screen Scan and Call Guard.',
    demo: 'This demo — Expo Go cannot run a background agent, so a child-phone simulator shows the same engine at work.',
    simTitle: 'See it in action',
    simBody: 'Play a realistic month-long chat on a simulated child’s phone and watch what the agent notices — and what reaches you.',
    simBodyProtected:
      'Play a realistic chat on a simulated child’s phone and see what the agent would notice. Alerts from the simulator are marked “Demo”.',
    openSim: 'Open child phone simulator',
    protTitle: 'This phone is protected by DaCy Kids',
    protNotActiveTitle: 'App screening is not active on this phone',
    protNoAgentIos:
      'On iPhone, Apple does not let any app read other apps — here DaCy protects with Apple Communication Safety, Screen Scan and Call Guard. The simulator shows how screening works on Android.',
    protNoAgentDemo:
      'This demo build cannot run the background agent, so no app is screened here. Screen Scan and Call Guard still protect you. The simulator shows how screening works with the DaCy agent on Android.',
    protNotSetTitle: 'App screening is not set up yet',
    protNotSetBody: 'Your guardian has not chosen any apps yet, so nothing is screened. Call Guard still protects your calls.',
    protOffTitle: 'App screening is off',
    protOffBody: 'Your guardian has switched off app screening for this phone. Call Guard still protects your calls.',
    protBody: 'DaCy looks only at these apps, and only while one of them is open:',
    protChoiceBody: 'Your guardian’s choice — with the DaCy agent on Android, DaCy looks only at these apps, and only while one of them is open:',
    protNone: 'No apps selected yet.',
    protShared: 'Only warnings are shared — never your messages.',
    protTip: 'If something seems unsafe, you will see a private tip and {guardian} gets a short alert.',
    protNoTip: 'If something seems unsafe, {guardian} gets a short alert.',
    yourGuardian: 'your guardian',
    selected: 'selected',
    notSelected: 'not selected',
  },
  az: {
    section: 'Uşaq qoruması · DaCy Kids',
    introTitle: 'Uşağınız telefondan həmişəki kimi istifadə edir',
    introCaveat:
      'iPhone-da Apple heç bir tətbiqə başqa tətbiqləri oxumağa icazə vermir — tətbiq yoxlaması Android-də DaCy agenti ilə işləyir. Bu demo onu simulyatorda göstərir.',
    introBody:
      'DaCy yalnız sizin seçdiyiniz tətbiqləri, yalnız onlardan biri açıq olanda yoxlayır və heç vaxt mane olmur. Yazışma uşağı ələ alma cəhdinə oxşamağa başlasa — yad biri etibar qazanır, sirr saxlamağı, şəxsi məlumat və ya şəkil istəyir — qısa xəbərdarlıq alırsınız. Mesajları heç vaxt görmürsünüz.',
    notSavedTitle: 'Hələ yadda saxlanılmayıb',
    notSavedBody: 'Yadda saxlayana qədər uşağınızın telefonu yoxlanılmır. Tövsiyə olunan tətbiqlər aşağıda artıq seçilib.',
    liveSync: 'Canlı sinxron',
    thisPhone: 'Bu telefonda',
    defaults: 'Tövsiyə olunan ayarlar',
    enable: 'Seçilmiş tətbiqləri yoxla',
    enableHint: 'Yalnız onlardan biri uşağın telefonunda açıq olanda.',
    apps: 'Yoxlanılacaq tətbiqlər',
    selectedCount: '{total} tətbiqdən {n} seçilib',
    selectAll: 'Hamısını seç',
    clear: 'Təmizlə',
    childTip: 'Uşağa yumşaq xatırlatma',
    childTipHint: 'Nəsə riskli görünəndə uşaq qısa, şəxsi məsləhət görür. Heç nə bloklanmır.',
    noApps: 'Yoxlamaq üçün ən azı bir tətbiq seçin.',
    offState: 'DaCy Kids söndürülüb. Heç bir tətbiq yoxlanılmır.',
    save: 'Ayarları yadda saxla',
    upToDate: 'Ayarlar yadda saxlanılıb',
    savedLive: 'Ailənizə ötürüldü. Bu seçim DaCy agenti olan Android telefonlarda qüvvəyə minir — iPhone başqa tətbiqləri yoxlaya bilmir.',
    savedLocalUnlinked: 'Bu telefonda saxlanıldı. Uşağınızın telefonuna ötürmək üçün yuxarıda ailə qrupu yaradın və ya qoşulun.',
    savedLocalOffline: 'Bu telefonda saxlanıldı. DaCy serveri əlçatan olanda ötürüləcək.',
    saveError: 'Ötürülmədi: {message}. Seçiminiz bu telefonda saxlanılır.',
    platformTitle: 'Real telefonlarda necə işləyir',
    android:
      'Android — DaCy agenti (sizin razılığınızla qurulan Əlçatanlıq və bildiriş icazəsi) yalnız seçilmiş tətbiqləri və yalnız onlar açıq olanda yoxlayır.',
    iphone:
      'iPhone — Apple heç bir tətbiqə başqa tətbiqləri oxumağa icazə vermir. Burada DaCy Apple-ın Communication Safety funksiyasına (Screen Time), DaCy Ekran skanına və Zəng qorumasına əsaslanır.',
    demo: 'Bu demo — Expo Go fon agentini işlədə bilmir, ona görə eyni mühərrik uşaq telefonu simulyatorunda göstərilir.',
    simTitle: 'İş prosesinə baxın',
    simBody: 'Simulyasiya edilmiş uşaq telefonunda bir aylıq real yazışmanı oynadın: agentin nəyi gördüyünə və sizə nəyin çatdığına baxın.',
    simBodyProtected:
      'Simulyasiya edilmiş uşaq telefonunda real yazışmanı oynadın və agentin nəyi görəcəyinə baxın. Simulyatordan gələn xəbərdarlıqlar “Demo” kimi işarələnir.',
    openSim: 'Uşaq telefonu simulyatorunu aç',
    protTitle: 'Bu telefon DaCy Kids ilə qorunur',
    protNotActiveTitle: 'Bu telefonda tətbiq yoxlaması aktiv deyil',
    protNoAgentIos:
      'iPhone-da Apple heç bir tətbiqə başqa tətbiqləri oxumağa icazə vermir — burada DaCy Apple-ın Communication Safety funksiyası, Ekran skanı və Zəng qoruması ilə qoruyur. Simulyator Android-də yoxlamanın necə işlədiyini göstərir.',
    protNoAgentDemo:
      'Bu demo versiyası fon agentini işlədə bilmir, ona görə burada heç bir tətbiq yoxlanılmır. Ekran skanı və Zəng qoruması sizi yenə qoruyur. Simulyator DaCy agentinin Android-də necə işlədiyini göstərir.',
    protNotSetTitle: 'Tətbiq yoxlaması hələ qurulmayıb',
    protNotSetBody: 'Qəyyumunuz hələ heç bir tətbiq seçməyib, ona görə heç nə yoxlanılmır. Zəng qoruması zənglərinizi yenə qoruyur.',
    protOffTitle: 'Tətbiq yoxlaması söndürülüb',
    protOffBody: 'Qəyyumunuz bu telefon üçün tətbiq yoxlamasını söndürüb. Zəng qoruması zənglərinizi yenə qoruyur.',
    protBody: 'DaCy yalnız bu tətbiqlərə və yalnız onlardan biri açıq olanda baxır:',
    protChoiceBody: 'Qəyyumunuzun seçimi — Android-də DaCy agenti ilə DaCy yalnız bu tətbiqlərə və yalnız onlardan biri açıq olanda baxır:',
    protNone: 'Hələ tətbiq seçilməyib.',
    protShared: 'Yalnız xəbərdarlıq paylaşılır — mesajlarınız heç vaxt.',
    protTip: 'Nəsə təhlükəli görünsə, sizə şəxsi məsləhət göstəriləcək, {guardian} isə qısa xəbərdarlıq alacaq.',
    protNoTip: 'Nəsə təhlükəli görünsə, {guardian} qısa xəbərdarlıq alacaq.',
    yourGuardian: 'qəyyumunuz',
    selected: 'seçilib',
    notSelected: 'seçilməyib',
  },
});

type SaveNotice = { tone: 'success' | 'warning' | 'danger'; text: string } | null;

function SimulatorCard({ role }: { role: FamilyRole | null }) {
  const t = useStrings(S);
  return (
    <Card variant="raised">
      <View style={styles.rowCenter}>
        <IconCircle icon="phone-portrait-outline" color={colors.primary} size={40} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t.simTitle}</AppText>
          <AppText variant="small">{role === 'protected' ? t.simBodyProtected : t.simBody}</AppText>
        </View>
      </View>
      <Button label={t.openSim} icon="play-circle-outline" size="lg" fullWidth onPress={() => router.push('/kids-demo')} />
    </Card>
  );
}

function ProtectedView() {
  const t = useStrings(S);
  const family = useFamily();
  // Same rule as the simulator: nothing saved by the guardian = nothing screened on this phone.
  const settings = useMemo(() => effectiveChildSettings(family.childSettings, 'protected'), [family.childSettings]);
  const guardians = family.members.filter((m) => m.role === 'guardian').map((m) => m.displayName);
  const guardian = guardians.join(', ') || t.yourGuardian;
  const on = settings.enabled;
  // Only claim protection when this phone can actually screen other apps (never in this build).
  const active = on && KIDS_AGENT_AVAILABLE;
  const title = !on ? (settings.notSet ? t.protNotSetTitle : t.protOffTitle) : active ? t.protTitle : t.protNotActiveTitle;

  return (
    <>
      <Card tone={active ? riskPalette.low : undefined}>
        <View style={styles.rowCenter}>
          <IconCircle icon={active ? 'shield-checkmark' : 'shield-outline'} color={active ? colors.low : colors.textMuted} size={44} />
          <AppText variant="heading" style={styles.flex}>
            {title}
          </AppText>
        </View>
        {on && !active ? (
          <InlineNotice tone="info" icon={KIDS_AGENT_LIMIT === 'ios' ? 'logo-apple' : 'flask-outline'}>
            {KIDS_AGENT_LIMIT === 'ios' ? t.protNoAgentIos : t.protNoAgentDemo}
          </InlineNotice>
        ) : null}
        {on ? (
          <>
            <AppText variant="small">{active ? t.protBody : t.protChoiceBody}</AppText>
            {settings.monitoredApps.length ? (
              <View style={styles.wrap}>
                {settings.monitoredApps.map((id) => (
                  <View key={id} style={styles.readonlyChip} accessible accessibilityLabel={MONITORED_APPS[id].name}>
                    <AppGlyph app={id} size={24} />
                    <AppText variant="smallStrong" color={colors.text}>
                      {MONITORED_APPS[id].name}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : (
              <AppText variant="small" color={colors.textMuted}>
                {t.protNone}
              </AppText>
            )}
            <Divider />
            <View style={styles.rowCenter}>
              <Ionicons name="lock-closed" size={18} color={colors.low} />
              <AppText variant="bodyStrong" style={styles.flex}>
                {t.protShared}
              </AppText>
            </View>
            {active ? <AppText variant="small">{fmt(settings.childWarnings ? t.protTip : t.protNoTip, { guardian })}</AppText> : null}
          </>
        ) : (
          <AppText variant="small">{settings.notSet ? t.protNotSetBody : t.protOffBody}</AppText>
        )}
      </Card>
      <SimulatorCard role="protected" />
    </>
  );
}

function GuardianView() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const family = useFamily();
  const { width } = useWindowDimensions();
  const effective = useMemo(() => effectiveChildSettings(family.childSettings), [family.childSettings]);
  const [enabled, setEnabled] = useState(effective.enabled);
  const [apps, setApps] = useState<MonitoredAppId[]>(effective.monitoredApps);
  const [childWarnings, setChildWarnings] = useState(effective.childWarnings);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<SaveNotice>(null);

  // Follow settings synced from the relay while the guardian has no unsaved edits.
  useEffect(() => {
    if (dirty) return;
    setEnabled(effective.enabled);
    setApps(effective.monitoredApps);
    setChildWarnings(effective.childWarnings);
  }, [effective, dirty]);

  const edit = () => {
    setDirty(true);
    setNotice(null);
  };

  const toggleApp = (id: MonitoredAppId) => {
    edit();
    setApps((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : MONITORED_APP_IDS.filter((a) => a === id || prev.includes(a))));
  };

  const valid = !enabled || apps.length > 0;
  const canSave = valid && !busy && (dirty || effective.isDefault);
  const linkedGuardian = family.link?.role === 'guardian';

  const save = async () => {
    setBusy(true);
    const res = await family.updateChildSettings({ enabled, monitoredApps: apps, childWarnings });
    setBusy(false);
    setDirty(false);
    if (!res.ok) setNotice({ tone: 'danger', text: fmt(t.saveError, { message: res.message }) });
    else if (res.local) setNotice({ tone: 'warning', text: family.link ? t.savedLocalOffline : t.savedLocalUnlinked });
    else setNotice({ tone: 'success', text: t.savedLive });
  };

  const chipBasis = width >= 640 ? '23%' : '47%';

  return (
    <>
      <Card>
        <View style={styles.rowCenter}>
          <IconCircle icon="happy-outline" color={colors.cyan} size={44} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t.introTitle}</AppText>
          </View>
        </View>
        {!KIDS_AGENT_AVAILABLE ? (
          <InlineNotice tone="info" icon="logo-apple">
            {t.introCaveat}
          </InlineNotice>
        ) : null}
        <AppText variant="small">{t.introBody}</AppText>
        <View style={styles.wrap}>
          <Badge
            label={linkedGuardian && family.live ? t.liveSync : t.thisPhone}
            icon={linkedGuardian && family.live ? 'sync-outline' : 'phone-portrait-outline'}
            palette={linkedGuardian && family.live ? riskPalette.low : undefined}
          />
          {effective.isDefault && !dirty && !linkedGuardian ? <Badge label={t.defaults} icon="sparkles-outline" /> : null}
        </View>
        {effective.isDefault && linkedGuardian ? (
          <InlineNotice tone="warning" icon="alert-circle-outline" title={t.notSavedTitle}>
            {t.notSavedBody}
          </InlineNotice>
        ) : null}
        <Divider />
        <ToggleRow
          label={t.enable}
          description={t.enableHint}
          value={enabled}
          onValueChange={(v) => {
            edit();
            setEnabled(v);
          }}
        />
        <View style={styles.appsHeader}>
          <AppText variant="caption">{t.apps}</AppText>
          <View style={styles.rowCenterTight}>
            <AppText variant="small" color={colors.textMuted}>
              {fmt(t.selectedCount, { n: apps.length, total: MONITORED_APP_IDS.length })}
            </AppText>
            <Pressable
              onPress={() => {
                edit();
                setApps(apps.length === MONITORED_APP_IDS.length ? [] : [...MONITORED_APP_IDS]);
              }}
              disabled={!enabled}
              accessibilityRole="button"
              hitSlop={8}>
              <AppText variant="smallStrong" color={enabled ? colors.primary : colors.textMuted}>
                {apps.length === MONITORED_APP_IDS.length ? t.clear : t.selectAll}
              </AppText>
            </Pressable>
          </View>
        </View>
        <View style={[styles.wrap, !enabled && styles.dimmed]}>
          {MONITORED_APP_IDS.map((id) => {
            const meta = MONITORED_APPS[id];
            const selected = apps.includes(id);
            return (
              <Pressable
                key={id}
                onPress={() => toggleApp(id)}
                disabled={!enabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: !enabled }}
                accessibilityLabel={`${meta.name}, ${tr(meta.kind, lang)}, ${selected ? t.selected : t.notSelected}`}
                style={({ pressed }) => [
                  styles.appChip,
                  { flexBasis: chipBasis },
                  selected && styles.appChipSelected,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.appChipTop}>
                  <AppGlyph app={id} size={30} />
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={selected ? colors.primary : colors.borderStrong}
                  />
                </View>
                <View>
                  <AppText variant="smallStrong" color={colors.text} numberOfLines={1}>
                    {meta.name}
                  </AppText>
                  <AppText variant="small" color={colors.textMuted} numberOfLines={1} style={styles.kind}>
                    {tr(meta.kind, lang)}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
        {!enabled ? <InlineNotice tone="warning">{t.offState}</InlineNotice> : null}
        {enabled && !apps.length ? <InlineNotice tone="warning">{t.noApps}</InlineNotice> : null}
        <Divider />
        <ToggleRow
          label={t.childTip}
          description={t.childTipHint}
          value={childWarnings}
          onValueChange={(v) => {
            edit();
            setChildWarnings(v);
          }}
        />
        {notice ? <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice> : null}
        <Button
          label={!dirty && !effective.isDefault && !busy ? t.upToDate : t.save}
          icon={!dirty && !effective.isDefault && !busy ? 'checkmark-done-outline' : 'save-outline'}
          variant={canSave ? 'primary' : 'secondary'}
          fullWidth
          loading={busy}
          disabled={!canSave}
          onPress={() => void save()}
        />
      </Card>

      <InlineNotice tone="info" icon="phone-portrait-outline" title={t.platformTitle}>
        <View style={styles.platformList}>
          {[
            { icon: 'logo-android' as const, text: t.android },
            { icon: 'logo-apple' as const, text: t.iphone },
            { icon: 'flask-outline' as const, text: t.demo },
          ].map((row) => (
            <View key={row.icon} style={styles.platformRow}>
              <Ionicons name={row.icon} size={16} color={colors.textSecondary} style={styles.platformIcon} />
              <AppText variant="small" color={colors.textSecondary} style={styles.flex}>
                {row.text}
              </AppText>
            </View>
          ))}
        </View>
      </InlineNotice>

      <SimulatorCard role={family.link?.role ?? null} />
    </>
  );
}

export function ChildProtectionSection() {
  const t = useStrings(S);
  const { link } = useFamily();
  return (
    <>
      <SectionHeader title={t.section} />
      {link?.role === 'protected' ? <ProtectedView /> : <GuardianView />}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowCenterTight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  appsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  appChip: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  appChipTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.75 },
  kind: { fontSize: 12, lineHeight: 16 },
  dimmed: { opacity: 0.45 },
  readonlyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  platformList: { gap: spacing.sm, marginTop: spacing.xs },
  platformRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  platformIcon: { marginTop: 1 },
});
