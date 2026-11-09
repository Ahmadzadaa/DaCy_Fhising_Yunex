/**
 * Stylised child's phone for the DaCy Kids simulator: a generic chat screen (no real
 * app's design — only the Ionicons glyph + app name), a home screen when the app is
 * closed, and DaCy's gentle, dismissable tip for the child. The child is never blocked.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppGlyph } from '@/components/kids/AppGlyph';
import { AppText } from '@/components/ui/AppText';
import { MONITORED_APPS } from '@/constants/monitoredApps';
import { colors, radius, spacing } from '@/constants/theme';
import { defineStrings, fmt, useStrings, useUiLanguage } from '@/i18n';
import { MONITORED_APP_IDS, type MonitoredAppId, type UiLanguage } from '@/types/security';

export interface PhoneMessage {
  id: string;
  from: 'contact' | 'child';
  text: string;
  day: number;
  time: string;
}

export interface ChildPhoneProps {
  app: MonitoredAppId;
  contactName: string;
  messages: PhoneMessage[];
  /** Shows a "typing…" bubble for the contact. */
  typing: boolean;
  appOpen: boolean;
  onOpenApp: () => void;
  /** Gentle tip for the child (null = hidden). */
  tip: string | null;
  onDismissTip: () => void;
  width: number;
  height: number;
  /** Clock shown in the status bar. */
  clock: string;
}

const S = defineStrings({
  en: {
    message: 'Message…',
    typing: '{name} is typing',
    tipTitle: 'DaCy · just for you',
    tipSub: 'This tip is just for you. Your guardian gets only a short safety notice — never your messages.',
    gotIt: 'Got it',
    tapToOpen: 'Tap {app} to open it',
    chatLabel: 'Chat with {name} in {app}',
    homeLabel: 'Home screen. {app} is closed.',
  },
  az: {
    message: 'Mesaj…',
    typing: '{name} yazır',
    tipTitle: 'DaCy · yalnız sənin üçün',
    tipSub: 'Bu məsləhət sənin üçündür. Qəyyumun yalnız qısa təhlükəsizlik bildirişi alır — mesajlarını heç vaxt görmür.',
    gotIt: 'Aydındır',
    tapToOpen: 'Açmaq üçün toxun: {app}',
    chatLabel: '{app} tətbiqində {name} ilə yazışma',
    homeLabel: 'Ana ekran. {app} bağlıdır.',
  },
});

/** Azerbaijani ordinal suffix (vowel harmony of the last spoken number word): 9-cu, 21-ci, 40-cı. */
export function azOrdinalSuffix(n: number): string {
  if (n <= 0) return 'cı';
  if (n % 1000 === 0) return 'ci';
  if (n % 100 === 0) return 'cü';
  const last = n % 10;
  if (last === 0) {
    const tens: Record<number, string> = { 10: 'cu', 20: 'ci', 30: 'cu', 40: 'cı', 50: 'ci', 60: 'cı', 70: 'ci', 80: 'ci', 90: 'cı' };
    return tens[n % 100] ?? 'ci';
  }
  const ones: Record<number, string> = { 1: 'ci', 2: 'ci', 3: 'cü', 4: 'cü', 5: 'ci', 6: 'cı', 7: 'ci', 8: 'ci', 9: 'cu' };
  return ones[last];
}

/** "Day 9" / "9-cu gün". */
export function dayLabel(day: number, lang: UiLanguage): string {
  return lang === 'az' ? `${day}-${azOrdinalSuffix(day)} gün` : `Day ${day}`;
}

function TypingBubble({ label }: { label: string }) {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 650 }), -1, true);
  }, [pulse]);
  const dotsStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(120)}
      style={[styles.bubble, styles.bubbleContact, styles.typing]}
      accessible
      accessibilityLabel={label}>
      <Animated.View style={[styles.dots, dotsStyle]}>
        <View style={styles.dot} />
        <View style={styles.dot} />
        <View style={styles.dot} />
      </Animated.View>
    </Animated.View>
  );
}

function StatusBar({ clock, light }: { clock: string; light?: boolean }) {
  const fg = light ? '#FFFFFF' : colors.text;
  return (
    <View style={styles.statusBar} accessible={false}>
      <AppText style={[styles.clock, { color: fg }]}>{clock}</AppText>
      <View style={styles.island} />
      <View style={styles.statusIcons}>
        <Ionicons name="cellular" size={12} color={fg} />
        <Ionicons name="wifi" size={12} color={fg} />
        <Ionicons name="battery-full" size={16} color={fg} />
      </View>
    </View>
  );
}

export function ChildPhone({
  app,
  contactName,
  messages,
  typing,
  appOpen,
  onOpenApp,
  tip,
  onDismissTip,
  width,
  height,
  clock,
}: ChildPhoneProps) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  const meta = MONITORED_APPS[app];
  const scrollRef = useRef<ScrollViewInstance>(null);
  const initial = contactName.replace(/^[^0-9A-Za-zÀ-žƏə]+/, '').charAt(0).toUpperCase() || '?';
  // The tip floats over the bottom of the chat. While it is shown, the chat gets that much extra
  // bottom padding so the newest message stays visible above it (playback keeps going).
  const [tipHeight, setTipHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(0);
  const tipShown = !!tip && appOpen;
  const tipOverlap = tipShown ? Math.max(0, tipHeight + TIP_BOTTOM - inputBarHeight) + spacing.sm : 0;

  useEffect(() => {
    if (!tipShown || tipHeight <= 0) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [tipShown, tipHeight]);

  return (
    <View style={[styles.frame, { width, height }]}>
      <View style={styles.screen}>
        {/* ---------- chat (kept mounted so bubbles do not re-animate) ---------- */}
        <View style={styles.flex} accessibilityLabel={fmt(t.chatLabel, { name: contactName, app: meta.name })}>
          <StatusBar clock={clock} />
          <View style={styles.chatHeader}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
            <View style={[styles.avatar, { backgroundColor: `${meta.color}22` }]}>
              <AppText style={[styles.avatarText, { color: meta.color }]}>{initial}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="smallStrong" color={colors.text} numberOfLines={1}>
                {meta.name} · {contactName}
              </AppText>
            </View>
            <AppGlyph app={app} size={24} />
          </View>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[styles.chatContent, tipShown && { paddingBottom: Math.max(spacing.lg, tipOverlap) }]}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || prev.day !== m.day;
              const mine = m.from === 'child';
              return (
                <View key={m.id} style={styles.messageBlock}>
                  {newDay ? (
                    <Animated.View entering={FadeIn.duration(250)} style={styles.daySep}>
                      <AppText style={styles.daySepText}>
                        {dayLabel(m.day, lang)} · {m.time}
                      </AppText>
                    </Animated.View>
                  ) : null}
                  <Animated.View
                    entering={FadeInDown.duration(280)}
                    style={[styles.bubble, mine ? styles.bubbleChild : styles.bubbleContact]}>
                    <AppText style={[styles.bubbleText, mine && styles.bubbleTextChild]}>{m.text}</AppText>
                    <AppText style={[styles.bubbleTime, mine && styles.bubbleTimeChild]}>{m.time}</AppText>
                  </Animated.View>
                </View>
              );
            })}
            {typing && appOpen ? <TypingBubble label={fmt(t.typing, { name: contactName })} /> : null}
          </ScrollView>
          <View style={styles.inputBar} onLayout={(e: LayoutChangeEvent) => setInputBarHeight(e.nativeEvent.layout.height)}>
            <View style={styles.input}>
              <AppText style={styles.inputText}>{t.message}</AppText>
            </View>
            <View style={[styles.send, { backgroundColor: colors.primary }]}>
              <Ionicons name="arrow-up" size={16} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* ---------- gentle tip for the child ---------- */}
        {tipShown ? (
          <Animated.View
            entering={FadeInDown.duration(320)}
            exiting={FadeOutDown.duration(200)}
            style={styles.tip}
            accessibilityLiveRegion="polite"
            onLayout={(e: LayoutChangeEvent) => setTipHeight(e.nativeEvent.layout.height)}>
            <View style={styles.tipHeader}>
              <View style={styles.tipIcon}>
                <Ionicons name="shield-checkmark" size={16} color={colors.low} />
              </View>
              <View style={styles.flex}>
                <AppText variant="smallStrong" color={colors.text}>
                  {t.tipTitle}
                </AppText>
                <AppText style={styles.tipSub}>{t.tipSub}</AppText>
              </View>
            </View>
            <AppText style={styles.tipText}>{tip}</AppText>
            <Pressable onPress={onDismissTip} accessibilityRole="button" style={({ pressed }) => [styles.tipButton, pressed && styles.pressed]}>
              <AppText variant="smallStrong" color={colors.primary}>
                {t.gotIt}
              </AppText>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* ---------- home screen while the app is closed ---------- */}
        {!appOpen ? (
          <Animated.View
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(180)}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={fmt(t.homeLabel, { app: meta.name })}>
            <LinearGradient colors={['#EBCDB4', '#C98D6B']} style={StyleSheet.absoluteFill} />
            <StatusBar clock={clock} light />
            <AppText style={styles.homeClock}>{clock}</AppText>
            <View style={styles.grid}>
              {MONITORED_APP_IDS.map((id) => {
                const isTarget = id === app;
                return (
                  <Pressable
                    key={id}
                    onPress={isTarget ? onOpenApp : undefined}
                    disabled={!isTarget}
                    accessibilityRole={isTarget ? 'button' : undefined}
                    accessibilityLabel={MONITORED_APPS[id].name}
                    style={({ pressed }) => [styles.gridItem, pressed && styles.pressed]}>
                    <View style={isTarget ? styles.targetRing : null}>
                      <AppGlyph app={id} size={44} solid />
                    </View>
                    <AppText style={styles.gridLabel} numberOfLines={1}>
                      {MONITORED_APPS[id].name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.homeHint}>
              <AppText style={styles.homeHintText}>{fmt(t.tapToOpen, { app: meta.name })}</AppText>
            </View>
          </Animated.View>
        ) : null}
        <View style={styles.homeIndicator} pointerEvents="none" />
      </View>
    </View>
  );
}

const BEZEL = 9;
/** Distance of the child's tip from the bottom of the screen (just above the input bar). */
const TIP_BOTTOM = 70;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: {
    alignSelf: 'center',
    padding: BEZEL,
    borderRadius: 46,
    backgroundColor: '#2A211B',
    shadowColor: '#6B4A2B',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  screen: { flex: 1, borderRadius: 46 - BEZEL, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  statusBar: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 6,
  },
  clock: { fontSize: 13, lineHeight: 16, fontWeight: '700', minWidth: 40 },
  island: { width: 84, height: 24, borderRadius: 12, backgroundColor: '#111111' },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 40, justifyContent: 'flex-end' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderStrong,
  },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, lineHeight: 17, fontWeight: '700' },
  chatContent: { padding: spacing.md, gap: spacing.xs + 2, paddingBottom: spacing.lg },
  messageBlock: { gap: spacing.xs + 2 },
  daySep: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    marginVertical: spacing.xs,
  },
  daySepText: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textSecondary },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5 },
  bubbleContact: { alignSelf: 'flex-start', backgroundColor: '#F1ECE6', borderBottomLeftRadius: 6 },
  bubbleChild: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleText: { fontSize: 14, lineHeight: 19, color: colors.text },
  bubbleTextChild: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, lineHeight: 13, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 1 },
  bubbleTimeChild: { color: 'rgba(255,255,255,0.75)' },
  typing: { paddingVertical: 12 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  inputText: { fontSize: 14, color: colors.textMuted },
  send: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', opacity: 0.85 },
  tip: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: TIP_BOTTOM,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(46, 143, 94, 0.28)',
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#2A211B',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 143, 94, 0.12)',
  },
  tipSub: { fontSize: 11, lineHeight: 14, color: colors.textMuted },
  tipText: { fontSize: 14, lineHeight: 20, color: colors.text },
  tipButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  pressed: { opacity: 0.7 },
  homeClock: {
    fontSize: 52,
    lineHeight: 60,
    fontWeight: '300',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.12)',
    textShadowRadius: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xl,
    rowGap: spacing.lg,
  },
  gridItem: { width: '25%', alignItems: 'center', gap: 5 },
  targetRing: { borderRadius: 16, borderWidth: 2, borderColor: '#FFFFFF', padding: 2 },
  gridLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 3,
  },
  homeHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
  },
  homeHintText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    backgroundColor: 'rgba(42, 33, 27, 0.28)',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    marginLeft: -55,
    width: 110,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(42, 33, 27, 0.55)',
  },
});
