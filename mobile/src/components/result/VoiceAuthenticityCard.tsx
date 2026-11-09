import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/misc';
import { colors, spacing } from '@/constants/theme';
import { defineStrings, tr, useStrings, useUiLanguage } from '@/i18n';
import type { VoiceAuthenticity } from '@/types/security';

const S = defineStrings({
  en: {
    title: 'Voice authenticity (anti-spoofing)',
    badge: 'Experimental · model pending',
    status: 'No result — not evaluated',
    point1: 'Suspicious words do not prove a cloned voice, and a natural-sounding voice does not prove the caller is real.',
    point2: 'An anti-spoofing model (e.g. AASIST / RawNet2) must first be validated on Azerbaijani phone speech before DaCy shows any authenticity score.',
    point3: 'Until then: confirm through a second channel — call the person back on their known number or ask a family question.',
  },
  az: {
    title: 'Səsin həqiqiliyi (anti-spoofing)',
    badge: 'Eksperimental · model gözlənilir',
    status: 'Nəticə yoxdur — qiymətləndirilməyib',
    point1: 'Şübhəli sözlər səsin klonlandığını sübut etmir, təbii səslənən səs də zəng edənin real olduğunu sübut etmir.',
    point2: 'DaCy hər hansı həqiqilik balı göstərməzdən əvvəl anti-spoofing modeli (məsələn, AASIST / RawNet2) Azərbaycan dilində telefon nitqi üzərində yoxlanılmalıdır.',
    point3: 'O vaxta qədər ikinci kanalla təsdiqləyin: şəxsə tanış nömrəsi ilə geri zəng edin və ya ailəyə aid sual verin.',
  },
});

export function VoiceAuthenticityCard({ authenticity }: { authenticity: VoiceAuthenticity }) {
  const t = useStrings(S);
  const lang = useUiLanguage();
  return (
    <Card variant="sunken">
      <View style={styles.top}>
        <SectionHeader title={t.title} />
      </View>
      <Badge
        label={t.badge}
        icon="flask-outline"
        caps
        palette={{ fg: '#6E6E73', bg: '#F5F5F7', border: '#E5E5EA' }}
      />
      <View style={styles.statusRow}>
        <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
        <AppText variant="bodyStrong" color={colors.textSecondary}>
          {t.status}
        </AppText>
      </View>
      <AppText variant="small">{tr(authenticity.note, lang)}</AppText>
      <View style={styles.points}>
        {[t.point1, t.point2, t.point3].map((p, i) => (
          <View key={i} style={styles.pointRow}>
            <AppText variant="small" color={colors.textMuted}>
              •
            </AppText>
            <AppText variant="small" style={styles.flex}>
              {p}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  points: { gap: spacing.xs },
  pointRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
