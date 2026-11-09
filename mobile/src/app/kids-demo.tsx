/**
 * DaCy Kids — child phone simulator.
 *
 * Expo Go cannot run a background agent, so this screen shows the production idea on a
 * simulated child's phone: a scripted chat plays message by message; the on-device
 * grooming engine screens it ONLY while the selected app is open; when the engine says
 * the guardian should know, a minimal alert (band, category, app, time) is sent through
 * the normal family relay — and a follow-up alert when the risk escalates (higher band
 * or a more serious category, e.g. a photo request turning into sextortion). Simulator
 * alerts are marked `demo: true` so a guardian never mistakes them for a real detection.
 * Message text never leaves the phone (memory only).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppGlyph } from '@/components/kids/AppGlyph';
import { ChildPhone, dayLabel, type PhoneMessage } from '@/components/kids/ChildPhone';
import { effectiveChildSettings, isAppScreened } from '@/components/kids/childSettings';
import { RiskTimeline, type TimelinePoint } from '@/components/kids/RiskTimeline';
import { StageStepper } from '@/components/kids/StageStepper';
import { RiskGauge } from '@/components/result/RiskGauge';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, EmptyState, IconCircle, InlineNotice, PulseDot, SegmentedControl, type NoticeTone } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { BAND_META, INDICATOR_META, type IconName } from '@/constants/indicators';
import { KIDS_SCENARIOS, type KidsScenario } from '@/constants/kidsScenarios';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { colors, radius, riskPalette, spacing } from '@/constants/theme';
import { defineStrings, fmt, formatTime, tr, useStrings, useUiLanguage } from '@/i18n';
import { alertPriorityRank, assessConversation, GROOMING_ENGINE_VERSION, STAGE_META } from '@/services/security/groomingEngine';
import { scoreToBand } from '@/services/security/riskEngine';
import { useFamily, type AlertDelivery } from '@/state/family';
import type { ChatMessage, FamilyAlertPayload, IndicatorType, Localized, UiLanguage } from '@/types/security';

const S = defineStrings({
  en: {
    intro:
      'A simulated child’s phone. The child chats normally; DaCy screens the selected app only while it is open and never interrupts. The agent panel shows what DaCy notices — the child never sees it.',
    scenario: 'Scenario',
    expectAlert: 'Should alert',
    expectNone: 'Should not alert',
    guardianNotice:
      'You are the guardian on this phone. To see an alert arrive here, open the simulator on the child’s phone.',
    speed: 'Playback speed',
    normal: 'Normal',
    fast: 'Fast',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    replay: 'Play again',
    restart: 'Restart',
    progress: 'Message {n}/{total}',
    phoneCaption: 'Child’s phone',
    appOpen: '{app} open',
    appClosed: 'App closed',
    screeningActive: 'Screening active while {app} is open',
    screeningPaused: 'Screening paused — app closed',
    pausedHint: 'The chat continues when the child opens {app} again.',
    notScreened: 'Not screened',
    notScreenedTitle: '{app} is not screened',
    notScreenedBody: 'The guardian has not selected {app}, so DaCy does not look at it at all. The child keeps chatting as usual.',
    kidsOffTitle: 'DaCy Kids is off',
    kidsOffBody: 'App screening is switched off in Family settings, so nothing is screened.',
    kidsNotSetTitle: 'App screening is not set up',
    kidsNotSetBody: 'The guardian has not chosen any apps yet, so this phone screens nothing. The guardian chooses apps in Family.',
    chooseApps: 'Choose apps',
    defaultsNote: 'Using the recommended settings until the guardian saves their own in Family.',
    agentTitle: 'DaCy agent (invisible to the child)',
    onDevice: 'Runs on the phone',
    engine: 'Engine {v}',
    familyLive: 'Family linked · live',
    familyOffline: 'Linked · server offline — alert kept on this phone',
    familyLocal: 'Not linked · alerts stay on this phone',
    risk: 'Conversation risk',
    timeline: 'Risk over the conversation',
    waiting: 'Waiting for messages…',
    alertMarker: 'Alert',
    timelineA11y: 'Risk timeline: score {score} of 100 after {n} messages.',
    timelineA11yAlert: ' Parent alert at message {m}.',
    stage: 'Grooming stage',
    signals: 'Detected signals',
    noSignals: 'Nothing suspicious so far.',
    titleSending: 'Notifying the parent…',
    titleLive: 'Parent notified',
    titleLocal: 'Alert created — not delivered',
    titleGuardian: 'Test alert added to your list',
    sending: 'Sending…',
    deliveredLive: 'Delivered live to the family',
    deliveredOffline: 'Linked, but the DaCy server is not reachable — the alert is kept on this phone.',
    deliveredUnlinked: 'Saved on this phone — link a family for live alerts.',
    deliveredGuardian: 'Added to your own alert list. No banner or notification appears, because this phone is the guardian’s.',
    demoMarked: 'Sent as a demo alert, so the guardian never mistakes it for a real detection.',
    followUp: 'Follow-up alert: the risk has escalated',
    earlierAlerts: 'Earlier alerts',
    alertItem: 'Message {n} · {band} · {event}',
    alertShortLive: 'Parent notified',
    alertShortLocal: 'Alert created',
    liveScore: '{score}/100 · {band}',
    payloadTitle: 'Exactly what left the phone',
    riskLabel: 'Risk',
    eventLabel: 'Event',
    appLabel: 'App',
    timeLabel: 'Time',
    high: 'High',
    critical: 'Critical',
    neverShared: 'Never shared: message text, the contact’s name, photos or screenshots.',
    firedAt: 'Triggered at message {n} · {day}',
    guidance: 'Guidance for the parent',
    tipShown: 'A gentle, private tip was shown to the child — nothing was blocked.',
    tipOff: 'Child tips are off — nothing was shown to the child.',
    showTip: 'Show the child’s tip again',
    noAlertTitle: 'No alert — normal conversation',
    noAlertBody: 'Nothing left the phone.',
    notScreenedDone: 'Not screened — nothing was analysed and nothing left the phone.',
    matches: 'Matches the expected result',
    differs: 'Differs from the expected result',
    privacy:
      'Messages stay on the child’s phone, in memory only, and are discarded when this screen closes. Only the alert — band, category, app and time — leaves the device.',
    noScenarios: 'No scenarios available',
    noScenariosBody: 'The scenario catalog is empty.',
  },
  az: {
    intro:
      'Simulyasiya edilmiş uşaq telefonu. Uşaq adi qaydada yazışır; DaCy seçilmiş tətbiqi yalnız o açıq olanda yoxlayır və heç vaxt mane olmur. Agent paneli DaCy-nin nəyi gördüyünü göstərir — uşaq onu görmür.',
    scenario: 'Ssenari',
    expectAlert: 'Xəbərdarlıq olmalı',
    expectNone: 'Xəbərdarlıq olmamalı',
    guardianNotice:
      'Bu telefonda siz qəyyumsunuz. Xəbərdarlığın bura gəldiyini görmək üçün simulyatoru uşağın telefonunda açın.',
    speed: 'Oynatma sürəti',
    normal: 'Normal',
    fast: 'Sürətli',
    start: 'Başlat',
    pause: 'Fasilə',
    resume: 'Davam et',
    replay: 'Yenidən oynat',
    restart: 'Yenidən başlat',
    progress: 'Mesaj {n}/{total}',
    phoneCaption: 'Uşağın telefonu',
    appOpen: '{app} açıq',
    appClosed: 'Tətbiq bağlı',
    screeningActive: '{app} açıq olduğu müddətdə yoxlama aktivdir',
    screeningPaused: 'Yoxlama dayandırılıb — tətbiq bağlıdır',
    pausedHint: 'Uşaq {app} tətbiqini yenidən açanda yazışma davam edir.',
    notScreened: 'Yoxlanılmır',
    notScreenedTitle: '{app} yoxlanılmır',
    notScreenedBody: 'Qəyyum {app} tətbiqini seçməyib, ona görə DaCy ona ümumiyyətlə baxmır. Uşaq adi qaydada yazışmağa davam edir.',
    kidsOffTitle: 'DaCy Kids söndürülüb',
    kidsOffBody: 'Tətbiq yoxlaması Ailə ayarlarında söndürülüb, ona görə heç nə yoxlanılmır.',
    kidsNotSetTitle: 'Tətbiq yoxlaması qurulmayıb',
    kidsNotSetBody: 'Qəyyum hələ heç bir tətbiq seçməyib, ona görə bu telefon heç nəyi yoxlamır. Tətbiqləri qəyyum Ailə bölməsində seçir.',
    chooseApps: 'Tətbiqləri seç',
    defaultsNote: 'Qəyyum Ailə bölməsində öz ayarlarını saxlayana qədər tövsiyə olunan ayarlar istifadə olunur.',
    agentTitle: 'DaCy agenti (uşaq görmür)',
    onDevice: 'Telefonda işləyir',
    engine: 'Mühərrik {v}',
    familyLive: 'Ailə qoşulub · canlı',
    familyOffline: 'Qoşulub · server əlçatan deyil — xəbərdarlıq bu telefonda qalır',
    familyLocal: 'Qoşulmayıb · xəbərdarlıqlar bu telefonda qalır',
    risk: 'Yazışma riski',
    timeline: 'Yazışma boyu risk',
    waiting: 'Mesajlar gözlənilir…',
    alertMarker: 'Xəbərdarlıq',
    timelineA11y: 'Risk qrafiki: {n} mesajdan sonra bal 100-dən {score}.',
    timelineA11yAlert: ' Valideynə xəbərdarlıq {m} nömrəli mesajda göndərildi.',
    stage: 'Şirnikləndirmə (grooming) mərhələsi',
    signals: 'Aşkarlanan əlamətlər',
    noSignals: 'Hələlik şübhəli heç nə yoxdur.',
    titleSending: 'Valideynə bildirilir…',
    titleLive: 'Valideynə xəbər verildi',
    titleLocal: 'Xəbərdarlıq yaradıldı — çatdırılmadı',
    titleGuardian: 'Test xəbərdarlığı siyahınıza əlavə edildi',
    sending: 'Göndərilir…',
    deliveredLive: 'Ailəyə canlı çatdırıldı',
    deliveredOffline: 'Qoşulub, amma DaCy serveri əlçatan deyil — xəbərdarlıq bu telefonda saxlanılır.',
    deliveredUnlinked: 'Bu telefonda saxlanıldı — canlı xəbərdarlıq üçün ailəni qoşun.',
    deliveredGuardian: 'Öz xəbərdarlıq siyahınıza əlavə edildi. Bu telefon qəyyumundur, ona görə banner və bildiriş görünmür.',
    demoMarked: 'Demo xəbərdarlığı kimi göndərildi ki, qəyyum onu real aşkarlama ilə qarışdırmasın.',
    followUp: 'Təkrar xəbərdarlıq: risk artıb',
    earlierAlerts: 'Əvvəlki xəbərdarlıqlar',
    alertItem: 'Mesaj {n} · {band} · {event}',
    alertShortLive: 'Valideynə xəbər verildi',
    alertShortLocal: 'Xəbərdarlıq yaradıldı',
    liveScore: '{score}/100 · {band}',
    payloadTitle: 'Telefondan çıxan məlumat məhz budur',
    riskLabel: 'Risk',
    eventLabel: 'Hadisə',
    appLabel: 'Tətbiq',
    timeLabel: 'Vaxt',
    high: 'Yüksək',
    critical: 'Kritik',
    neverShared: 'Heç vaxt paylaşılmır: mesaj mətni, kontaktın adı, şəkillər və ya ekran görüntüləri.',
    firedAt: 'İşə düşdü: mesaj {n} · {day}',
    guidance: 'Valideyn üçün tövsiyə',
    tipShown: 'Uşağa yumşaq, şəxsi məsləhət göstərildi — heç nə bloklanmadı.',
    tipOff: 'Uşağa məsləhət söndürülüb — uşağa heç nə göstərilmədi.',
    showTip: 'Uşağın məsləhətini yenidən göstər',
    noAlertTitle: 'Xəbərdarlıq yoxdur — adi yazışma',
    noAlertBody: 'Telefondan heç nə çıxmadı.',
    notScreenedDone: 'Yoxlanılmadı — heç nə təhlil edilmədi və telefondan heç nə çıxmadı.',
    matches: 'Gözlənilən nəticəyə uyğundur',
    differs: 'Gözlənilən nəticədən fərqlənir',
    privacy:
      'Mesajlar uşağın telefonunda, yalnız yaddaşda qalır və bu ekran bağlananda silinir. Cihazdan yalnız xəbərdarlıq — risk səviyyəsi, kateqoriya, tətbiq və vaxt — çıxır.',
    noScenarios: 'Ssenari yoxdur',
    noScenariosBody: 'Ssenari kataloqu boşdur.',
  },
});

const SPEED_MS = { normal: 2_200, fast: 800 } as const;
const FIRST_MESSAGE_DELAY_MS = 450;
const DAY_MS = 86_400_000;
const BAND_RANK = { high: 0, critical: 1 } as const;

type Speed = keyof typeof SPEED_MS;

interface TimelineMessage extends PhoneMessage {
  chat: ChatMessage;
}

type AlertBand = FamilyAlertPayload['band'];

interface SentAlert {
  id: string;
  payload: FamilyAlertPayload & { band: AlertBand; category: IndicatorType };
  sentAt: string;
  /** Index of the message that triggered the alert. */
  messageIndex: number;
  day: number;
  delivery: 'sending' | AlertDelivery;
  tip: Localized;
  guardianActions: Localized[];
  /** True for an escalation after an earlier alert in the same run. */
  followUp: boolean;
}

/**
 * A new alert is sent for the first alert-worthy result of a run, and again only when the
 * risk escalates: a higher band, or a more serious category (ALERT_PRIORITY). Each
 * (band, category) pair is sent at most once per run.
 */
function shouldSendAlert(prev: SentAlert | undefined, band: AlertBand, category: IndicatorType, sent: ReadonlySet<string>): boolean {
  if (sent.has(`${band}:${category}`)) return false;
  if (!prev) return true;
  return BAND_RANK[band] > BAND_RANK[prev.payload.band] || alertPriorityRank(category) < alertPriorityRank(prev.payload.category);
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Places the scripted days so the last message falls on today; text in the UI language. */
function buildTimeline(scenario: KidsScenario, lang: UiLanguage, today: number): TimelineMessage[] {
  const lastDay = scenario.messages.reduce((max, m) => Math.max(max, m.day), 1);
  const base = today - (lastDay - 1) * DAY_MS;
  return scenario.messages.map((m, i) => {
    const [hh, mm] = m.time.split(':').map((n) => parseInt(n, 10));
    const minutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
    const at = new Date(base + (m.day - 1) * DAY_MS + minutes * 60_000).toISOString();
    const id = `${scenario.id}-${i}`;
    const text = tr(m.text, lang);
    return { id, from: m.from, text, day: m.day, time: m.time, chat: { id, from: m.from, text, at } };
  });
}

export default function KidsDemoScreen() {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const family = useFamily();
  const { sendAlert } = family;
  const { width, height: windowHeight } = useWindowDimensions();
  const wide = width >= 720;
  const role = family.link?.role ?? null;

  const [today] = useState(startOfToday);
  const [scenarioId, setScenarioId] = useState<string>(KIDS_SCENARIOS[0]?.id ?? '');
  const [speed, setSpeed] = useState<Speed>('normal');
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [appOpen, setAppOpen] = useState(true);
  /** Alerts of the current run: the first one, then one per escalation. */
  const [alerts, setAlerts] = useState<SentAlert[]>([]);
  const [tipOpen, setTipOpen] = useState(false);
  /** Bumped on every restart / scenario change. */
  const [runId, setRunId] = useState(0);
  /** (band:category) pairs already sent in the current run. */
  const sentRef = useRef<{ runId: number; keys: Set<string> }>({ runId: 0, keys: new Set() });

  const scenario = KIDS_SCENARIOS.find((s) => s.id === scenarioId) ?? KIDS_SCENARIOS[0];
  // On the child's (protected) phone, nothing saved by the guardian means nothing is screened.
  const settings = useMemo(() => effectiveChildSettings(family.childSettings, role), [family.childSettings, role]);
  const alert = alerts.length ? alerts[alerts.length - 1]! : null;
  const timeline = useMemo(() => (scenario ? buildTimeline(scenario, lang, today) : []), [scenario, lang, today]);
  const visible = useMemo(() => timeline.slice(0, shown), [timeline, shown]);
  const total = timeline.length;
  const finished = total > 0 && shown >= total;
  const active = playing && !finished;
  const screened = scenario ? isAppScreened(settings, scenario.app) : false;
  const childWarnings = settings.childWarnings;

  // On-device screening of what is on screen (only for a selected app).
  const assessment = useMemo(() => {
    if (!screened || !visible.length) return null;
    return assessConversation(
      visible.map((m) => m.chat),
      { now: visible[visible.length - 1].chat.at },
    );
  }, [screened, visible]);

  // Playback: one message per tick, only while playing AND the app is open.
  useEffect(() => {
    if (!active || !appOpen) return;
    const timer = setTimeout(() => setShown((n) => n + 1), shown === 0 ? FIRST_MESSAGE_DELAY_MS : SPEED_MS[speed]);
    return () => clearTimeout(timer);
  }, [active, appOpen, shown, speed]);

  // When the engine says the guardian should know (band high/critical): a minimal alert, and a
  // follow-up only when the risk escalates (e.g. a photo request turning into sextortion).
  useEffect(() => {
    if (!scenario || !assessment?.shouldAlert) return;
    if (assessment.band !== 'high' && assessment.band !== 'critical') return;
    if (sentRef.current.runId !== runId) sentRef.current = { runId, keys: new Set() };
    const band: AlertBand = assessment.band;
    const category = assessment.alertCategory ?? 'PERSONAL_IMAGE_REQUEST';
    if (!shouldSendAlert(alert ?? undefined, band, category, sentRef.current.keys)) return;
    sentRef.current.keys.add(`${band}:${category}`);
    const payload = { band, category, source: 'app' as const, app: scenario.app, demo: true as const };
    const sentAt = new Date().toISOString();
    const id = `${scenario.id}-${runId}-${band}-${category}`;
    const trigger = visible[visible.length - 1];
    setAlerts((prev) => [
      ...prev,
      {
        id,
        payload,
        sentAt,
        messageIndex: visible.length - 1,
        day: trigger?.day ?? 1,
        delivery: 'sending',
        tip: assessment.childTip,
        guardianActions: assessment.guardianActions,
        followUp: prev.length > 0,
      },
    ]);
    if (childWarnings) setTipOpen(true);
    void sendAlert(payload).then((delivery) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, delivery } : a))));
  }, [assessment, alert, runId, scenario, visible, childWarnings, sendAlert]);

  const reset = (autoplay: boolean) => {
    setRunId((r) => r + 1);
    setShown(0);
    setAlerts([]);
    setTipOpen(false);
    setAppOpen(true);
    setPlaying(autoplay);
  };

  const selectScenario = (id: string) => {
    if (id === scenarioId) return;
    setScenarioId(id);
    reset(false);
  };

  const points = useMemo<TimelinePoint[]>(() => {
    if (!assessment) return [];
    const byId = new Map(assessment.perMessage.map((p) => [p.messageId, p.score]));
    let last = 0;
    return visible.map((m) => {
      const score = byId.get(m.id);
      if (typeof score === 'number') last = score;
      return { score: last, band: scoreToBand(last) };
    });
  }, [assessment, visible]);

  if (!scenario) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon="phone-portrait-outline" title={t.noScenarios} body={t.noScenariosBody} />
      </Screen>
    );
  }

  const appMeta = MONITORED_APPS[scenario.app];
  const lastShown = visible[visible.length - 1];
  const clock = (lastShown ?? timeline[0])?.time ?? '09:41';
  const next = timeline[shown];
  const typing = active && appOpen && next?.from === 'contact';
  const progress = `${fmt(t.progress, { n: shown, total })}${lastShown ? ` · ${dayLabel(lastShown.day, lang)}` : ''}`;
  const expectedAlert = scenario.expected === 'alert';
  const resultMatches = alerts.length > 0 === expectedAlert;

  const primary = finished
    ? { label: t.replay, icon: 'refresh' as const, onPress: () => reset(true) }
    : active
      ? { label: t.pause, icon: 'pause' as const, onPress: () => setPlaying(false) }
      : shown > 0
        ? { label: t.resume, icon: 'play' as const, onPress: () => setPlaying(true) }
        : { label: t.start, icon: 'play' as const, onPress: () => setPlaying(true) };

  const phoneWidth = wide ? 318 : Math.min(width - spacing.lg * 2, 360);
  // On a phone, keep the simulated phone and the live strip below it on one screen.
  const phoneHeight = wide ? 610 : Math.round(Math.min(580, Math.max(460, windowHeight * 0.62)));
  const chipBasis = wide ? '31%' : '47%';

  /* ---------------- controls ---------------- */

  const controls = (
    <Card>
      <AppText variant="caption">{t.scenario}</AppText>
      <View style={styles.wrap}>
        {KIDS_SCENARIOS.map((s) => {
          const selected = s.id === scenario.id;
          const expectsAlert = s.expected === 'alert';
          return (
            <Pressable
              key={s.id}
              onPress={() => selectScenario(s.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${tr(s.title, lang)}, ${MONITORED_APPS[s.app].name}, ${expectsAlert ? t.expectAlert : t.expectNone}`}
              style={({ pressed }) => [styles.scenario, { flexBasis: chipBasis }, selected && styles.scenarioSelected, pressed && styles.pressed]}>
              <View style={styles.scenarioTop}>
                <AppGlyph app={s.app} size={26} />
                <AppText variant="smallStrong" color={colors.text} numberOfLines={3} style={styles.flex}>
                  {tr(s.title, lang)}
                </AppText>
              </View>
              <Badge
                label={expectsAlert ? t.expectAlert : t.expectNone}
                icon={expectsAlert ? 'notifications-outline' : 'checkmark-circle-outline'}
                palette={expectsAlert ? riskPalette.critical : riskPalette.low}
              />
            </Pressable>
          );
        })}
      </View>
      <AppText variant="caption">{t.speed}</AppText>
      <SegmentedControl
        value={speed}
        onChange={setSpeed}
        options={[
          { value: 'normal', label: t.normal, icon: 'walk-outline' },
          { value: 'fast', label: t.fast, icon: 'flash-outline' },
        ]}
      />
      <View style={styles.buttonRow}>
        <Button label={primary.label} icon={primary.icon} onPress={primary.onPress} style={styles.flex} />
        <Button label={t.restart} icon="refresh-outline" variant="secondary" onPress={() => reset(true)} disabled={shown === 0} style={styles.flex} />
      </View>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${total ? Math.round((shown / total) * 100) : 0}%` }]} />
        </View>
        <AppText variant="small" color={colors.textMuted}>
          {progress}
        </AppText>
      </View>
    </Card>
  );

  /* ---------------- phone ---------------- */

  const bandShort = (band: keyof typeof BAND_META) => tr(BAND_META[band].short, lang);
  const deliveredShort = (a: SentAlert) =>
    a.delivery === 'sending'
      ? t.sending
      : role === 'guardian'
        ? t.titleGuardian
        : a.delivery === 'live'
          ? t.alertShortLive
          : t.alertShortLocal;

  // Narrow screens: the agent panel is below the phone, so the key live numbers sit right under it.
  const liveStrip = (
    <View style={[styles.liveStrip, { width: phoneWidth }]}>
      <View style={[styles.flex, styles.wrap]}>
        {screened ? (
          <>
            <Badge
              label={fmt(t.liveScore, { score: assessment?.score ?? 0, band: bandShort(assessment?.band ?? 'low') })}
              icon="speedometer-outline"
              palette={riskPalette[assessment?.band ?? 'low']}
            />
            <Badge label={tr(STAGE_META[assessment?.stage ?? 'none'].label, lang)} icon="git-network-outline" />
            {alert ? (
              <Badge label={deliveredShort(alert)} icon="notifications" palette={riskPalette[alert.payload.band]} />
            ) : null}
          </>
        ) : (
          <Badge label={t.notScreened} icon="eye-off-outline" />
        )}
      </View>
      <Pressable
        onPress={primary.onPress}
        accessibilityRole="button"
        accessibilityLabel={primary.label}
        hitSlop={8}
        style={({ pressed }) => [styles.stripButton, pressed && styles.pressed]}>
        <Ionicons name={primary.icon} size={20} color={colors.primary} />
      </Pressable>
    </View>
  );

  const statusLine = !screened ? (
    <View style={styles.statusRow}>
      <Ionicons name="eye-off-outline" size={16} color={colors.textMuted} />
      <AppText variant="small" color={colors.textMuted} style={styles.flex}>
        {t.notScreened}
      </AppText>
    </View>
  ) : appOpen ? (
    <View style={styles.statusRow}>
      {active ? <PulseDot color={colors.low} size={9} /> : <View style={[styles.staticDot, { backgroundColor: colors.low }]} />}
      <AppText variant="smallStrong" color={colors.low} style={styles.flex}>
        {fmt(t.screeningActive, { app: appMeta.name })}
      </AppText>
    </View>
  ) : (
    <View style={styles.statusRow}>
      <Ionicons name="pause-circle" size={16} color={colors.moderate} />
      <View style={styles.flex}>
        <AppText variant="smallStrong" color={colors.moderate}>
          {t.screeningPaused}
        </AppText>
        <AppText variant="small">{fmt(t.pausedHint, { app: appMeta.name })}</AppText>
      </View>
    </View>
  );

  const phone = (
    <View style={[styles.phoneCol, wide && { width: phoneWidth }]}>
      <AppText variant="caption" align="center">
        {t.phoneCaption}
      </AppText>
      <ChildPhone
        app={scenario.app}
        contactName={scenario.contactName}
        messages={visible}
        typing={typing}
        appOpen={appOpen}
        onOpenApp={() => setAppOpen(true)}
        tip={tipOpen && alert && childWarnings ? tr(alert.tip, lang) : null}
        onDismissTip={() => setTipOpen(false)}
        width={phoneWidth}
        height={phoneHeight}
        clock={clock}
      />
      <SegmentedControl
        value={appOpen ? 'open' : 'closed'}
        onChange={(v) => setAppOpen(v === 'open')}
        options={[
          { value: 'open', label: fmt(t.appOpen, { app: appMeta.name }), icon: 'apps-outline' },
          { value: 'closed', label: t.appClosed, icon: 'home-outline' },
        ]}
        style={{ width: phoneWidth, alignSelf: 'center' }}
      />
      <View style={{ width: phoneWidth, alignSelf: 'center' }}>{statusLine}</View>
      {!wide ? liveStrip : null}
    </View>
  );

  /* ---------------- agent panel ---------------- */

  const bandLabel = (band: AlertBand) => (band === 'critical' ? t.critical : t.high);
  const alertTitle = (a: SentAlert) =>
    a.delivery === 'sending'
      ? role === 'guardian'
        ? t.sending
        : t.titleSending
      : role === 'guardian'
        ? t.titleGuardian
        : a.delivery === 'live'
          ? t.titleLive
          : t.titleLocal;
  // Delivery status as wrapping text (never a truncated badge): what happened and what to do.
  const delivery: { tone: NoticeTone; icon: IconName; text: string } =
    !alert || alert.delivery === 'sending'
      ? { tone: 'info', icon: 'time-outline', text: t.sending }
      : role === 'guardian'
        ? { tone: 'info', icon: 'person-outline', text: t.deliveredGuardian }
        : alert.delivery === 'live'
          ? { tone: 'success', icon: 'checkmark-done-outline', text: t.deliveredLive }
          : family.link
            ? { tone: 'warning', icon: 'cloud-offline-outline', text: t.deliveredOffline }
            : { tone: 'warning', icon: 'phone-portrait-outline', text: t.deliveredUnlinked };
  const indicators = assessment?.indicators.filter((i) => i.points > 0) ?? [];
  const timelineA11y =
    fmt(t.timelineA11y, { score: assessment?.score ?? 0, n: shown }) +
    (alert ? fmt(t.timelineA11yAlert, { m: alert.messageIndex + 1 }) : '');

  const agent = (
    <View style={[styles.agentCol, wide && styles.flex]}>
      <Card variant="raised">
        <View style={styles.rowCenter}>
          <IconCircle icon="eye-off-outline" color={colors.indigo} size={36} />
          <AppText variant="heading" style={styles.flex}>
            {t.agentTitle}
          </AppText>
        </View>
        {statusLine}
        <View style={styles.wrap}>
          <Badge label={t.onDevice} icon="phone-portrait-outline" />
          <Badge label={fmt(t.engine, { v: GROOMING_ENGINE_VERSION })} icon="hardware-chip-outline" />
          <Badge
            label={family.link ? (family.live ? t.familyLive : t.familyOffline) : t.familyLocal}
            icon={family.live ? 'radio-outline' : family.link ? 'cloud-offline-outline' : 'flask-outline'}
            palette={family.live ? riskPalette.low : family.link ? riskPalette.moderate : undefined}
          />
        </View>
        {settings.isDefault ? (
          <AppText variant="small" color={colors.textMuted}>
            {t.defaultsNote}
          </AppText>
        ) : null}
      </Card>

      {alert ? (
        <Card tone={riskPalette[alert.payload.band]} variant="raised">
          <View style={styles.rowCenter}>
            <IconCircle icon="notifications" color={riskPalette[alert.payload.band].fg} size={40} />
            <View style={styles.flex}>
              <AppText variant="title" color={riskPalette[alert.payload.band].fg}>
                {alertTitle(alert)}
              </AppText>
              <AppText variant="small">{fmt(t.firedAt, { n: alert.messageIndex + 1, day: dayLabel(alert.day, lang) })}</AppText>
            </View>
          </View>
          {alert.followUp ? (
            <Badge label={t.followUp} icon="trending-up-outline" palette={riskPalette[alert.payload.band]} />
          ) : null}
          <InlineNotice tone={delivery.tone} icon={delivery.icon}>
            {delivery.text}
          </InlineNotice>
          <View style={[styles.payload, { borderColor: riskPalette[alert.payload.band].border }]}>
            <AppText variant="caption">{t.payloadTitle}</AppText>
            <View style={styles.kv}>
              <AppText variant="small" color={colors.textMuted} style={styles.kvLabel}>
                {t.riskLabel}
              </AppText>
              <AppText variant="smallStrong" color={riskPalette[alert.payload.band].fg} style={styles.flex}>
                {bandLabel(alert.payload.band)}
              </AppText>
            </View>
            <View style={styles.kv}>
              <AppText variant="small" color={colors.textMuted} style={styles.kvLabel}>
                {t.eventLabel}
              </AppText>
              <AppText variant="smallStrong" color={colors.text} style={styles.flex}>
                {tr(INDICATOR_META[alert.payload.category].label, lang)}
              </AppText>
            </View>
            <View style={styles.kv}>
              <AppText variant="small" color={colors.textMuted} style={styles.kvLabel}>
                {t.appLabel}
              </AppText>
              <View style={[styles.flex, styles.rowTight]}>
                <AppGlyph app={scenario.app} size={20} />
                <AppText variant="smallStrong" color={colors.text}>
                  {appMeta.name}
                </AppText>
              </View>
            </View>
            <View style={styles.kv}>
              <AppText variant="small" color={colors.textMuted} style={styles.kvLabel}>
                {t.timeLabel}
              </AppText>
              <AppText variant="smallStrong" color={colors.text} style={styles.flex}>
                {formatTime(alert.sentAt)}
              </AppText>
            </View>
            <Divider />
            <AppText variant="mono" selectable>
              {JSON.stringify(alert.payload, null, 2)}
            </AppText>
          </View>
          <InlineNotice tone="success" icon="lock-closed-outline">
            {t.neverShared}
          </InlineNotice>
          <View style={styles.rowTop}>
            <Ionicons name="flask-outline" size={16} color={colors.textSecondary} />
            <AppText variant="small" style={styles.flex}>
              {t.demoMarked}
            </AppText>
          </View>
          <View style={styles.rowTop}>
            <Ionicons name={childWarnings ? 'chatbubble-ellipses-outline' : 'notifications-off-outline'} size={16} color={colors.textSecondary} />
            <AppText variant="small" style={styles.flex}>
              {childWarnings ? t.tipShown : t.tipOff}
            </AppText>
          </View>
          {childWarnings && !tipOpen ? (
            <Button label={t.showTip} icon="eye-outline" variant="ghost" size="sm" onPress={() => {
              setAppOpen(true);
              setTipOpen(true);
            }} />
          ) : null}
          {alert.guardianActions.length ? (
            <>
              <AppText variant="caption">{t.guidance}</AppText>
              {alert.guardianActions.map((a, i) => (
                <View key={i} style={styles.rowTop}>
                  <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.textSecondary} />
                  <AppText variant="small" style={styles.flex}>
                    {tr(a, lang)}
                  </AppText>
                </View>
              ))}
            </>
          ) : null}
          {alerts.length > 1 ? (
            <>
              <Divider />
              <AppText variant="caption">{t.earlierAlerts}</AppText>
              {alerts.slice(0, -1).map((a) => (
                <View key={a.id} style={styles.rowTop}>
                  <Ionicons name="notifications-outline" size={16} color={riskPalette[a.payload.band].fg} />
                  <AppText variant="small" style={styles.flex}>
                    {fmt(t.alertItem, {
                      n: a.messageIndex + 1,
                      band: bandLabel(a.payload.band),
                      event: tr(INDICATOR_META[a.payload.category].label, lang),
                    })}
                  </AppText>
                </View>
              ))}
            </>
          ) : null}
          {finished ? (
            <Badge
              label={resultMatches ? t.matches : t.differs}
              icon={resultMatches ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              palette={resultMatches ? riskPalette.low : riskPalette.moderate}
            />
          ) : null}
        </Card>
      ) : null}

      {finished && !alert ? (
        <Card tone={riskPalette.low} variant="raised">
          <View style={styles.rowCenter}>
            <IconCircle icon={screened ? 'shield-checkmark' : 'eye-off-outline'} color={colors.low} size={40} />
            <View style={styles.flex}>
              {screened ? (
                <>
                  <AppText variant="heading">{t.noAlertTitle}</AppText>
                  <AppText variant="small">{t.noAlertBody}</AppText>
                </>
              ) : (
                <AppText variant="bodyStrong">{t.notScreenedDone}</AppText>
              )}
            </View>
          </View>
          {screened ? (
            <Badge
              label={resultMatches ? t.matches : t.differs}
              icon={resultMatches ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              palette={resultMatches ? riskPalette.low : riskPalette.moderate}
            />
          ) : null}
        </Card>
      ) : null}

      {!screened ? (
        <Card variant="sunken">
          <View style={styles.rowCenter}>
            <AppGlyph app={scenario.app} size={36} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {settings.enabled ? fmt(t.notScreenedTitle, { app: appMeta.name }) : settings.notSet ? t.kidsNotSetTitle : t.kidsOffTitle}
            </AppText>
          </View>
          <AppText variant="small">
            {settings.enabled ? fmt(t.notScreenedBody, { app: appMeta.name }) : settings.notSet ? t.kidsNotSetBody : t.kidsOffBody}
          </AppText>
          {family.link?.role !== 'protected' ? (
            <Button label={t.chooseApps} icon="options-outline" variant="secondary" onPress={() => router.navigate('/family')} />
          ) : null}
        </Card>
      ) : (
        <>
          <Card>
            <AppText variant="caption">{t.risk}</AppText>
            <RiskGauge score={assessment?.score ?? 0} band={assessment?.band ?? 'low'} size={wide ? 170 : 160} caption={progress} />
            <Divider />
            <AppText variant="caption">{t.timeline}</AppText>
            <RiskTimeline
              points={points}
              total={total}
              alertIndices={alerts.map((a) => a.messageIndex)}
              alertLabel={t.alertMarker}
              startLabel={timeline[0] ? dayLabel(timeline[0].day, lang) : ''}
              endLabel={timeline[total - 1] ? dayLabel(timeline[total - 1].day, lang) : ''}
              emptyLabel={t.waiting}
              accessibilityLabel={timelineA11y}
            />
          </Card>

          <Card>
            <AppText variant="caption">{t.stage}</AppText>
            <StageStepper stage={assessment?.stage ?? 'none'} reached={assessment?.stagesReached ?? []} />
            <Divider />
            <AppText variant="caption">{t.signals}</AppText>
            {indicators.length ? (
              <View style={styles.wrap}>
                {indicators.map((i) => (
                  <Badge
                    key={i.id}
                    label={`${tr(INDICATOR_META[i.type].label, lang)} +${i.points}`}
                    icon={INDICATOR_META[i.type].icon}
                    palette={assessment ? riskPalette[assessment.band] : undefined}
                  />
                ))}
              </View>
            ) : (
              <AppText variant="small" color={colors.textMuted}>
                {t.noSignals}
              </AppText>
            )}
            {assessment && indicators.length ? <AppText variant="small">{tr(assessment.explanation, lang)}</AppText> : null}
          </Card>
        </>
      )}
    </View>
  );

  return (
    <Screen edges={['bottom']}>
      <AppText variant="small">{t.intro}</AppText>
      {role === 'guardian' ? (
        <InlineNotice tone="info" icon="person-outline">
          {t.guardianNotice}
        </InlineNotice>
      ) : null}
      {controls}
      <View style={wide ? styles.columns : styles.stack}>
        {phone}
        {agent}
      </View>
      <InlineNotice tone="success" icon="lock-closed-outline">
        {t.privacy}
      </InlineNotice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  scenario: {
    flexGrow: 1,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scenarioSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  scenarioTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.75 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.track, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  stack: { gap: spacing.lg },
  phoneCol: { gap: spacing.md },
  agentCol: { gap: spacing.lg, minWidth: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  staticDot: { width: 9, height: 9, borderRadius: 4.5 },
  liveStrip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stripButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  payload: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  kv: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kvLabel: { width: 64 },
});
