/**
 * Family protection (Feature 3): trusted circle, family link (guardian ⇄
 * protected device), DaCy Kids (screening of guardian-selected apps on the child's
 * phone), live alert feed and a privacy-conscious alert preview.
 * No chat or call content is ever shared — only risk band, category, source (app) and time.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ContactsLegacy from 'expo-contacts/legacy';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppGlyph } from '@/components/kids/AppGlyph';
import { ChildProtectionSection } from '@/components/kids/ChildProtectionSection';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, EmptyState, IconCircle, InlineNotice, SectionHeader, SegmentedControl } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { guardianAlertGuidance, isChildSafetyAlert } from '@/constants/childSafetyGuidance';
import { INDICATOR_META } from '@/constants/indicators';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { colors, radius, riskPalette, spacing } from '@/constants/theme';
import { defineStrings, fmt, formatRelative, formatTime, tr, useStrings, useUiLanguage } from '@/i18n';
import { useFamily } from '@/state/family';
import { useServerStatus } from '@/state/serverStatus';
import type { AlertSourceKind, FamilyAlert, IndicatorType } from '@/types/security';

const S = defineStrings({
  en: {
    title: 'Family protection',
    subtitle: 'Alerts only. DaCy never shows anyone your messages, calls or codes.',
    live: 'Live backend',
    prototype: 'Local prototype mode',
    childTitle: 'Protecting a child or a grandparent',
    childBody:
      'Install DaCy on their phone and join your family. When Call Guard detects someone trying to deceive them, you get an alert within seconds. For children, DaCy Kids can also screen the apps you choose — you receive alerts only, never the messages.',
    link: 'Family link',
    guardianRole: 'I am the guardian',
    protectedRole: 'Protect this phone',
    yourName: 'Your name (shown in alerts)',
    nameGuardianPh: 'e.g. Aysel',
    nameProtectedPh: 'e.g. Grandma',
    create: 'Create family group',
    code: 'Join code',
    codePh: '6-character code',
    join: 'Join family',
    needServer: 'Linking needs the DaCy server. Until then alerts stay on this phone (prototype mode).',
    linkedGuardian: 'You are the guardian. Share this code with the protected phone:',
    linkedProtected: 'This phone is protected. Alerts go to: ',
    members: 'Members',
    guardian: 'guardian',
    protected: 'protected',
    leave: 'Leave family group',
    pin: 'Leave PIN (4–8 digits)',
    pinConfirm: 'Repeat the PIN',
    pinHint: 'Protected phones (e.g. your child) can leave the group only with this PIN. Keep it to yourself.',
    pinMismatch: 'The PINs do not match.',
    pinFormat: 'The PIN must be 4–8 digits.',
    leaveTitle: 'Leaving needs the guardian’s PIN',
    leaveHint: 'Ask the person who created the family group to enter their PIN.',
    confirmLeave: 'Confirm and leave',
    cancel: 'Cancel',
    changePin: 'Change leave PIN',
    newPin: 'New leave PIN',
    savePin: 'Save PIN',
    pinSaved: 'Leave PIN updated.',
    pinWrong: 'Wrong PIN. {left}',
    pinLocked: 'Too many wrong PINs. Leaving is locked for 15 minutes.',
    trusted: 'Trusted circle',
    trustedHint: 'Calls from these numbers are recognised in the first 5 seconds; DaCy then deletes what it heard and switches off.',
    name: 'Name',
    relation: 'Relation',
    relationPh: 'e.g. Son',
    phone: 'Phone number',
    add: 'Add contact',
    pick: 'Pick from contacts',
    noContacts: 'No trusted contacts yet.',
    alerts: 'Alerts',
    alertsOwn: 'Alerts sent from this phone',
    noAlerts: 'No alerts',
    noAlertsBody: 'High-risk events from your family appear here within seconds.',
    noAlertsOwnBody: 'Alerts from this phone go only to your guardian. Other family members never see them.',
    demo: 'Demo',
    nextSteps: 'What to do now',
    showSteps: 'Show all next steps ({n})',
    hideSteps: 'Hide the steps',
    preview: 'Alert preview — what is shared',
    previewHint: 'This is exactly what leaves the phone. Nothing else.',
    notShared: 'Never shared: message text, audio, transcripts, codes, card data, phone numbers.',
    risk: 'Risk',
    event: 'Event',
    time: 'Time',
    from: 'From',
    high: 'High',
    critical: 'Critical',
    call: 'Call',
    message: 'Message',
    screen: 'Screen scan',
    voice: 'Voice',
    app: 'App',
    clearLocal: 'Clear local alerts',
  },
  az: {
    title: 'Ailə qoruması',
    subtitle: 'Yalnız xəbərdarlıq. DaCy mesajlarınızı, zənglərinizi və kodlarınızı heç kimə göstərmir.',
    live: 'Canlı server',
    prototype: 'Lokal prototip rejimi',
    childTitle: 'Uşağı və ya nənə-babanı qorumaq',
    childBody:
      'DaCy-ni onların telefonuna quraşdırın və ailənizə qoşun. Zəng qoruması onları aldatmağa çalışan birini aşkarlayanda, bir neçə saniyəyə xəbərdarlıq alırsınız. Uşaqlar üçün DaCy Kids sizin seçdiyiniz tətbiqləri də yoxlaya bilər — siz yalnız xəbərdarlıq alırsınız, mesajları heç vaxt.',
    link: 'Ailə bağlantısı',
    guardianRole: 'Mən qəyyumam',
    protectedRole: 'Bu telefonu qoru',
    yourName: 'Adınız (xəbərdarlıqda görünür)',
    nameGuardianPh: 'məs. Aysel',
    nameProtectedPh: 'məs. Nənə',
    create: 'Ailə qrupu yarat',
    code: 'Qoşulma kodu',
    codePh: '6 simvollu kod',
    join: 'Ailəyə qoşul',
    needServer: 'Qoşulmaq üçün DaCy serveri lazımdır. O vaxta qədər xəbərdarlıqlar bu telefonda qalır (prototip rejimi).',
    linkedGuardian: 'Siz qəyyumsunuz. Bu kodu qorunan telefonla paylaşın:',
    linkedProtected: 'Bu telefon qorunur. Xəbərdarlıqlar bura gedir: ',
    members: 'Üzvlər',
    guardian: 'qəyyum',
    protected: 'qorunan',
    leave: 'Ailə qrupundan çıx',
    pin: 'Çıxış PIN-i (4–8 rəqəm)',
    pinConfirm: 'PIN-i təkrar yazın',
    pinHint: 'Qorunan telefonlar (məsələn, uşağınız) qrupdan yalnız bu PIN ilə çıxa bilər. PIN-i heç kimə deməyin.',
    pinMismatch: 'PIN-lər eyni deyil.',
    pinFormat: 'PIN 4–8 rəqəmdən ibarət olmalıdır.',
    leaveTitle: 'Çıxmaq üçün qəyyumun PIN-i lazımdır',
    leaveHint: 'Ailə qrupunu yaradan şəxsdən PIN-i daxil etməsini xahiş edin.',
    confirmLeave: 'Təsdiqlə və çıx',
    cancel: 'Ləğv et',
    changePin: 'Çıxış PIN-ini dəyiş',
    newPin: 'Yeni çıxış PIN-i',
    savePin: 'PIN-i yadda saxla',
    pinSaved: 'Çıxış PIN-i yeniləndi.',
    pinWrong: 'PIN səhvdir. {left}',
    pinLocked: 'Çox səhv PIN daxil edildi. Çıxış 15 dəqiqəlik bloklandı.',
    trusted: 'Etibarlı dairə',
    trustedHint: 'Bu nömrələrdən gələn zənglər ilk 5 saniyədə tanınır; DaCy eşitdiyini silir və söndürülür.',
    name: 'Ad',
    relation: 'Qohumluq',
    relationPh: 'məs. Oğlum',
    phone: 'Telefon nömrəsi',
    add: 'Kontakt əlavə et',
    pick: 'Kontaktlardan seç',
    noContacts: 'Hələ etibarlı kontakt yoxdur.',
    alerts: 'Xəbərdarlıqlar',
    alertsOwn: 'Bu telefondan göndərilən xəbərdarlıqlar',
    noAlerts: 'Xəbərdarlıq yoxdur',
    noAlertsBody: 'Ailənizdən gələn yüksək riskli hadisələr burada bir neçə saniyəyə görünür.',
    noAlertsOwnBody: 'Bu telefondan gedən xəbərdarlıqlar yalnız qəyyumunuza çatır. Ailənin digər üzvləri onları görmür.',
    demo: 'Demo',
    nextSteps: 'İndi nə etməli',
    showSteps: 'Bütün addımları göstər ({n})',
    hideSteps: 'Addımları gizlət',
    preview: 'Xəbərdarlığa baxış — nə paylaşılır',
    previewHint: 'Telefondan çıxan məlumat məhz budur. Başqa heç nə.',
    notShared: 'Heç vaxt paylaşılmır: mesaj mətni, səs, transkript, kodlar, kart məlumatı, telefon nömrələri.',
    risk: 'Risk',
    event: 'Hadisə',
    time: 'Vaxt',
    from: 'Kimdən',
    high: 'Yüksək',
    critical: 'Kritik',
    call: 'Zəng',
    message: 'Mesaj',
    screen: 'Ekran skanı',
    voice: 'Səs',
    app: 'Tətbiq',
    clearLocal: 'Lokal xəbərdarlıqları təmizlə',
  },
});

const PREVIEW_CATEGORIES: IndicatorType[] = ['OTP_REQUEST', 'MONEY_TRANSFER_REQUEST', 'FAMILY_EMERGENCY', 'SAFE_ACCOUNT_TRANSFER', 'SUSPICIOUS_URL'];

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, secure, maxLength }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'characters' | 'words';
  secure?: boolean;
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="smallStrong">{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'words'}
        autoCorrect={false}
        secureTextEntry={secure}
        maxLength={maxLength}
        textContentType={secure ? 'oneTimeCode' : undefined}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * One alert. On the guardian's phone, a child-safety alert also carries static next steps
 * (the alert itself has no message content): "don't blame" is always visible, the rest
 * (keep evidence, the category's action, report) one tap away.
 */
function AlertRow({ alert, guidance }: { alert: FamilyAlert; guidance: boolean }) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const [expanded, setExpanded] = useState(false);
  const palette = riskPalette[alert.band];
  const app = alert.source === 'app' && alert.app && MONITORED_APPS[alert.app] ? alert.app : null;
  const sourceLabel = alert.source === 'app' ? (app ? MONITORED_APPS[app].name : t.app) : t[alert.source];
  const steps = guidance && isChildSafetyAlert(alert) ? guardianAlertGuidance(alert.category) : [];
  const row = (
    <View style={styles.alertRow}>
      <View>
        <IconCircle icon={app ? 'shield-half-outline' : 'warning'} color={palette.fg} size={36} />
        {app ? (
          <View style={styles.alertAppBadge}>
            <AppGlyph app={app} size={18} solid />
          </View>
        ) : null}
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">
          {alert.fromName} · {alert.band === 'critical' ? t.critical : t.high}
        </AppText>
        <AppText variant="small">
          {tr(INDICATOR_META[alert.category].label, lang)} · {sourceLabel}
        </AppText>
        {alert.demo ? <Badge label={t.demo} icon="flask-outline" palette={riskPalette.moderate} style={styles.demoBadge} /> : null}
      </View>
      <AppText variant="small" color={colors.textMuted}>
        {formatRelative(alert.createdAt, lang)}
      </AppText>
    </View>
  );
  if (!steps.length) return row;
  const visibleSteps = expanded ? steps : steps.slice(0, 1);
  return (
    <View style={styles.alertWrap}>
      {row}
      <View style={[styles.steps, { borderColor: palette.border }]}>
        <AppText variant="caption">{t.nextSteps}</AppText>
        {visibleSteps.map((step, i) => (
          <View key={step.en} style={styles.stepRow}>
            <Ionicons name={i === 0 ? 'heart-outline' : 'arrow-forward-circle-outline'} size={16} color={colors.textSecondary} style={styles.stepIcon} />
            <AppText variant="small" style={styles.flex}>
              {tr(step, lang)}
            </AppText>
          </View>
        ))}
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={8}
          style={({ pressed }) => [styles.stepsToggle, pressed && styles.pressed]}>
          <AppText variant="smallStrong" color={colors.primary}>
            {expanded ? t.hideSteps : fmt(t.showSteps, { n: steps.length })}
          </AppText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function FamilyScreen() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const { status } = useServerStatus();
  const family = useFamily();
  const online = status === 'online';
  const [role, setRole] = useState<'guardian' | 'protected'>('guardian');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [leavePin, setLeavePin] = useState('');
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [changingPin, setChangingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [cName, setCName] = useState('');
  const [cRelation, setCRelation] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [band, setBand] = useState<'high' | 'critical'>('critical');
  const [category, setCategory] = useState<IndicatorType>('OTP_REQUEST');
  const [source, setSource] = useState<AlertSourceKind>('call');
  const { markAlertsSeen } = family;

  const focused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      markAlertsSeen();
    }, [markAlertsSeen]),
  );

  // Alerts that arrive while this tab is open count as seen.
  useEffect(() => {
    if (focused && family.unseenCount > 0) markAlertsSeen();
  }, [focused, family.unseenCount, markAlertsSeen]);

  const pinValid = (value: string) => /^\d{4,8}$/.test(value);

  const doLink = async () => {
    setLinkError(null);
    if (role === 'guardian') {
      if (!pinValid(pin)) {
        setLinkError(t.pinFormat);
        return;
      }
      if (pin !== pin2) {
        setLinkError(t.pinMismatch);
        return;
      }
    }
    setLinkBusy(true);
    const res = role === 'guardian' ? await family.createFamily(displayName, pin) : await family.joinFamily(code, displayName);
    setLinkBusy(false);
    if (!res.ok) setLinkError(res.message);
    else {
      setPin('');
      setPin2('');
    }
  };

  const doLeave = async () => {
    setLeaveError(null);
    setLeaveBusy(true);
    const res = await family.leaveFamily(family.link?.role === 'guardian' ? undefined : leavePin);
    setLeaveBusy(false);
    if (!res.ok) {
      if (res.code === 'LEAVE_PIN_LOCKED') setLeaveError(t.pinLocked);
      else if (res.code === 'LEAVE_PIN_INVALID') {
        const left = res.message.match(/(\d+) attempt/)?.[1];
        setLeaveError(t.pinWrong.replace('{left}', left ? (lang === 'az' ? `${left} cəhd qalıb.` : `${left} attempt(s) left.`) : ''));
      } else setLeaveError(res.message);
      setLeavePin('');
      return;
    }
    setLeaving(false);
    setLeavePin('');
  };

  const doChangePin = async () => {
    if (!pinValid(newPin)) {
      setPinMessage({ ok: false, text: t.pinFormat });
      return;
    }
    const res = await family.changeLeavePin(newPin);
    setPinMessage(res.ok ? { ok: true, text: t.pinSaved } : { ok: false, text: res.message });
    if (res.ok) {
      setNewPin('');
      setChangingPin(false);
    }
  };

  const pickContact = async () => {
    const contact = await ContactsLegacy.presentContactPickerAsync().catch(() => null);
    if (!contact) return;
    setCName(contact.name ?? '');
    setCPhone(contact.phoneNumbers?.[0]?.number ?? '');
  };

  const addContact = () => {
    if (!cName.trim() || !cPhone.trim()) return;
    family.addContact({ name: cName.trim(), relation: cRelation.trim(), phone: cPhone.trim() });
    setCName('');
    setCRelation('');
    setCPhone('');
  };

  // Privacy preview only: shows the exact payload a real detection sends. Nothing is sent from here.
  const payload = { band, category, source };
  const protectedPhone = family.link?.role === 'protected';
  const nowIso = new Date().toISOString();
  const previewLine = `${t.risk}: ${band === 'critical' ? t.critical : t.high} | ${t.event}: ${tr(INDICATOR_META[category].label, lang)} | ${t.time}: ${formatTime(nowIso)}`;

  return (
    <Screen title={t.title} subtitle={t.subtitle}>
      <Badge
        label={family.live ? t.live : t.prototype}
        icon={family.live ? 'radio-outline' : 'flask-outline'}
        caps
        size="md"
        palette={family.live ? riskPalette.low : riskPalette.moderate}
      />

      <Card variant="sunken">
        <View style={styles.rowCenter}>
          <Ionicons name="happy-outline" size={22} color={colors.cyan} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t.childTitle}
          </AppText>
        </View>
        <AppText variant="small">{t.childBody}</AppText>
      </Card>

      <SectionHeader title={t.link} />
      <Card>
        {family.link ? (
          <>
            {family.link.role === 'guardian' ? (
              <>
                <AppText variant="body">{t.linkedGuardian}</AppText>
                <AppText style={styles.code} selectable>
                  {family.link.code}
                </AppText>
              </>
            ) : (
              <AppText variant="body">
                {t.linkedProtected}
                {family.members.filter((m) => m.role === 'guardian').map((m) => m.displayName).join(', ') || '—'}
              </AppText>
            )}
            {family.members.length ? (
              <>
                <AppText variant="caption">{t.members}</AppText>
                {family.members.map((m) => (
                  <View key={m.memberId} style={styles.rowCenter}>
                    <Ionicons name={m.role === 'guardian' ? 'shield-outline' : 'person-outline'} size={18} color={colors.textSecondary} />
                    <AppText variant="body" style={styles.flex}>
                      {m.displayName}
                      {m.memberId === family.link?.memberId ? ' ✓' : ''}
                    </AppText>
                    <AppText variant="small">{m.role === 'guardian' ? t.guardian : t.protected}</AppText>
                  </View>
                ))}
              </>
            ) : null}
            {family.link.role === 'guardian' ? (
              <>
                {pinMessage ? <InlineNotice tone={pinMessage.ok ? 'success' : 'danger'}>{pinMessage.text}</InlineNotice> : null}
                {changingPin ? (
                  <>
                    <Field label={t.newPin} value={newPin} onChangeText={(v) => setNewPin(v.replace(/\D/g, ''))} keyboardType="number-pad" secure maxLength={8} autoCapitalize="none" />
                    <View style={styles.buttonRow}>
                      <Button label={t.savePin} icon="key-outline" onPress={() => void doChangePin()} style={styles.flex} />
                      <Button label={t.cancel} variant="secondary" onPress={() => setChangingPin(false)} style={styles.flex} />
                    </View>
                  </>
                ) : (
                  <Button
                    label={t.changePin}
                    icon="key-outline"
                    variant="secondary"
                    fullWidth
                    onPress={() => {
                      setPinMessage(null);
                      setChangingPin(true);
                    }}
                  />
                )}
                <Button label={t.leave} icon="log-out-outline" variant="ghost" fullWidth loading={leaveBusy} onPress={() => void doLeave()} />
              </>
            ) : leaving ? (
              <>
                <InlineNotice tone="warning" icon="lock-closed-outline" title={t.leaveTitle}>
                  {t.leaveHint}
                </InlineNotice>
                <Field label={t.pin} value={leavePin} onChangeText={(v) => setLeavePin(v.replace(/\D/g, ''))} keyboardType="number-pad" secure maxLength={8} autoCapitalize="none" />
                {leaveError ? <InlineNotice tone="danger">{leaveError}</InlineNotice> : null}
                <View style={styles.buttonRow}>
                  <Button label={t.confirmLeave} icon="log-out-outline" variant="danger" loading={leaveBusy} disabled={!pinValid(leavePin)} onPress={() => void doLeave()} style={styles.flex} />
                  <Button
                    label={t.cancel}
                    variant="secondary"
                    onPress={() => {
                      setLeaving(false);
                      setLeavePin('');
                      setLeaveError(null);
                    }}
                    style={styles.flex}
                  />
                </View>
              </>
            ) : (
              <Button label={t.leave} icon="lock-closed-outline" variant="ghost" fullWidth onPress={() => setLeaving(true)} />
            )}
          </>
        ) : (
          <>
            <SegmentedControl
              value={role}
              onChange={(v) => {
                setRole(v);
                setLinkError(null);
              }}
              options={[
                { value: 'guardian', label: t.guardianRole, icon: 'shield-outline' },
                { value: 'protected', label: t.protectedRole, icon: 'person-outline' },
              ]}
            />
            <Field
              label={t.yourName}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={role === 'guardian' ? t.nameGuardianPh : t.nameProtectedPh}
            />
            {role === 'protected' ? (
              <Field label={t.code} value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder={t.codePh} autoCapitalize="characters" />
            ) : (
              <>
                <Field label={t.pin} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} keyboardType="number-pad" secure maxLength={8} autoCapitalize="none" />
                <Field label={t.pinConfirm} value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, ''))} keyboardType="number-pad" secure maxLength={8} autoCapitalize="none" />
                <AppText variant="small">{t.pinHint}</AppText>
              </>
            )}
            {!online ? <InlineNotice tone="warning">{t.needServer}</InlineNotice> : null}
            {linkError ? <InlineNotice tone="danger">{linkError}</InlineNotice> : null}
            <Button
              label={role === 'guardian' ? t.create : t.join}
              icon={role === 'guardian' ? 'add-circle-outline' : 'link-outline'}
              fullWidth
              loading={linkBusy}
              disabled={
                !online ||
                !displayName.trim() ||
                (role === 'protected' && code.trim().length < 6) ||
                (role === 'guardian' && (!pin || !pin2))
              }
              onPress={() => void doLink()}
            />
          </>
        )}
      </Card>

      <ChildProtectionSection />

      <SectionHeader
        title={protectedPhone ? t.alertsOwn : t.alerts}
        actionLabel={family.alerts.some((a) => a.familyId === 'local') ? t.clearLocal : undefined}
        onAction={family.clearLocalAlerts}
      />
      <Card>
        {family.alerts.length ? (
          family.alerts.slice(0, 20).map((a, i) => (
            <View key={a.id} style={styles.alertWrap}>
              {i > 0 ? <Divider /> : null}
              <AlertRow alert={a} guidance={!protectedPhone} />
            </View>
          ))
        ) : (
          <EmptyState icon="notifications-outline" title={t.noAlerts} body={protectedPhone ? t.noAlertsOwnBody : t.noAlertsBody} />
        )}
      </Card>

      <SectionHeader title={t.trusted} />
      <Card>
        <AppText variant="small">{t.trustedHint}</AppText>
        {family.contacts.length ? (
          family.contacts.map((c) => (
            <View key={c.id} style={styles.rowCenter}>
              <IconCircle icon="person" color={colors.low} size={34} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{c.name}</AppText>
                <AppText variant="small">{[c.relation, c.phone].filter(Boolean).join(' · ')}</AppText>
              </View>
              <Pressable onPress={() => family.removeContact(c.id)} accessibilityRole="button" accessibilityLabel={`${lang === 'az' ? 'Sil' : 'Remove'}: ${c.name}`} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ))
        ) : (
          <AppText variant="small" color={colors.textMuted}>
            {t.noContacts}
          </AppText>
        )}
        <Divider />
        <Field label={t.name} value={cName} onChangeText={setCName} />
        <Field label={t.relation} value={cRelation} onChangeText={setCRelation} placeholder={t.relationPh} />
        <Field label={t.phone} value={cPhone} onChangeText={setCPhone} placeholder="+994 50 123 45 67" keyboardType="phone-pad" autoCapitalize="none" />
        <View style={styles.buttonRow}>
          <Button label={t.add} icon="person-add-outline" onPress={addContact} disabled={!cName.trim() || !cPhone.trim()} style={styles.flex} />
          {Platform.OS !== 'web' ? <Button label={t.pick} icon="people-circle-outline" variant="secondary" onPress={() => void pickContact()} style={styles.flex} /> : null}
        </View>
      </Card>

      <SectionHeader title={t.preview} />
      <Card>
        <AppText variant="small">{t.previewHint}</AppText>
        <SegmentedControl
          value={band}
          onChange={setBand}
          options={[
            { value: 'high', label: t.high },
            { value: 'critical', label: t.critical },
          ]}
        />
        <View style={styles.wrap}>
          {PREVIEW_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={[styles.chip, category === c && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === c }}>
              <AppText variant="smallStrong" color={colors.text}>
                {tr(INDICATOR_META[c].label, lang)}
              </AppText>
            </Pressable>
          ))}
        </View>
        <SegmentedControl
          value={source}
          onChange={setSource}
          options={[
            { value: 'call', label: t.call },
            { value: 'message', label: t.message },
            { value: 'screen', label: t.screen },
          ]}
        />
        <View style={[styles.previewBox, { borderColor: riskPalette[band].border }]}>
          <AppText variant="bodyStrong" color={riskPalette[band].fg}>
            {previewLine}
          </AppText>
          <AppText variant="mono" selectable>
            {JSON.stringify(payload, null, 2)}
          </AppText>
        </View>
        <InlineNotice tone="success" icon="lock-closed-outline">
          {t.notShared}
        </InlineNotice>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  code: { fontSize: 34, fontWeight: '800', letterSpacing: 6, color: colors.cyan, textAlign: 'center', paddingVertical: spacing.sm },
  field: { gap: spacing.xs },
  input: {
    color: colors.text,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  alertWrap: { gap: spacing.md },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  alertAppBadge: { position: 'absolute', right: -4, bottom: -4, borderRadius: 6, borderWidth: 2, borderColor: colors.surface },
  demoBadge: { marginTop: spacing.xs },
  steps: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surfaceSunken,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepIcon: { marginTop: 1 },
  stepsToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  pressed: { opacity: 0.7 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  previewBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceSunken },
});
