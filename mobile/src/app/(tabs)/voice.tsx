import { useState } from 'react';
import { View, StyleSheet } from 'react-native';

import { ModeBadge } from '@/components/ModeBadge';
import { AppText } from '@/components/ui/AppText';
import { SegmentedControl } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import { CallGuardPanel } from '@/features/callGuard/CallGuardPanel';
import { VoiceLabPanel } from '@/features/voiceLab/VoiceLabPanel';
import { defineStrings, useStrings } from '@/i18n';
import { resolveMode } from '@/services/ai/modelProvider';
import { useProviderContext } from '@/state/useProviderContext';

const S = defineStrings({
  en: { title: 'Call Guard', guard: 'Live call', lab: 'Voice Lab' },
  az: { title: 'Zəng qoruması', guard: 'Canlı zəng', lab: 'Səs laboratoriyası' },
});

export default function VoiceScreen() {
  const t = useStrings(S);
  const ctx = useProviderContext();
  const [tab, setTab] = useState<'guard' | 'lab'>('guard');

  return (
    <Screen title={t.title} titleAccessory={<ModeBadge mode={resolveMode(ctx).mode} />}>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'guard', label: t.guard, icon: 'call-outline' },
          { value: 'lab', label: t.lab, icon: 'pulse-outline' },
        ]}
      />
      {/* Keep the live guard mounted while switching tabs so a running call is not interrupted. */}
      <View style={tab === 'guard' ? undefined : styles.hidden}>
        <CallGuardPanel />
      </View>
      {tab === 'lab' ? <VoiceLabPanel /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hidden: { display: 'none' },
});
