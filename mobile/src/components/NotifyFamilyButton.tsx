import * as Haptics from 'expo-haptics';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { defineStrings, useStrings } from '@/i18n';
import { useFamily, type AlertDelivery } from '@/state/family';
import type { AlertSourceKind, RiskAssessment } from '@/types/security';

const S = defineStrings({
  en: { notify: 'Alert my family', sentLive: 'Family alerted', sentLocal: 'Saved (prototype mode — not linked)' },
  az: { notify: 'Ailəmə xəbər ver', sentLive: 'Ailəyə xəbər verildi', sentLocal: 'Saxlanıldı (prototip rejimi — qoşulmayıb)' },
});

/** Shown on high/critical results: sends a minimal-metadata alert to the family relay. */
export function NotifyFamilyButton({ assessment, source }: { assessment: RiskAssessment; source: AlertSourceKind }) {
  const t = useStrings(S);
  const { sendAlert } = useFamily();
  const [state, setState] = useState<'idle' | 'sending' | AlertDelivery>('idle');

  if (assessment.band !== 'high' && assessment.band !== 'critical') return null;
  const category = assessment.indicators.find((i) => i.points > 0)?.type ?? 'SUSPICIOUS_URL';

  const label = state === 'live' ? t.sentLive : state === 'local' ? t.sentLocal : t.notify;
  return (
    <Button
      label={label}
      icon={state === 'live' || state === 'local' ? 'checkmark-circle-outline' : 'people-outline'}
      variant="secondary"
      loading={state === 'sending'}
      disabled={state === 'live' || state === 'local'}
      fullWidth
      onPress={async () => {
        setState('sending');
        const delivery = await sendAlert({ band: assessment.band === 'critical' ? 'critical' : 'high', category, source });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setState(delivery);
      }}
    />
  );
}
