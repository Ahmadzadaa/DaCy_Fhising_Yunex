import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScanListItem } from '@/components/ScanListItem';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, InlineNotice, SegmentedControl } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import { defineStrings, fmt, useStrings } from '@/i18n';
import { entryBand } from '@/services/storage/historyRepository';
import { useHistory } from '@/state/history';
import { useSettings } from '@/state/settings';
import type { HistoryEntry } from '@/types/security';

type Filter = 'all' | 'text' | 'voice' | 'call' | 'threats';

const S = defineStrings({
  en: {
    title: 'History',
    subtitle: 'Stored only on this phone. Codes and card numbers are masked; calls keep metadata only.',
    all: 'All',
    text: 'Messages',
    voice: 'Voice',
    call: 'Calls',
    threats: 'Threats',
    count: '{n} results',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'Your checks will appear here.',
    emptyFilter: 'No results for this filter.',
    deleteAll: 'Delete all history',
    confirmDelete: 'Tap again to permanently delete everything',
    deleted: 'History deleted.',
    textOff: 'Message text is not being saved (Settings → Privacy).',
  },
  az: {
    title: 'Tarixçə',
    subtitle: 'Yalnız bu telefonda saxlanılır. Kodlar və kart nömrələri gizlədilir; zənglər üçün yalnız metadata qalır.',
    all: 'Hamısı',
    text: 'Mesajlar',
    voice: 'Səs',
    call: 'Zənglər',
    threats: 'Təhlükələr',
    count: '{n} nəticə',
    emptyTitle: 'Hələ heç nə yoxdur',
    emptyBody: 'Yoxlamalarınız burada görünəcək.',
    emptyFilter: 'Bu filtr üzrə nəticə yoxdur.',
    deleteAll: 'Bütün tarixçəni sil',
    confirmDelete: 'Hər şeyi birdəfəlik silmək üçün yenidən toxunun',
    deleted: 'Tarixçə silindi.',
    textOff: 'Mesaj mətni saxlanılmır (Ayarlar → Məxfilik).',
  },
});

function matches(entry: HistoryEntry, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'threats') {
    const band = entryBand(entry);
    return band === 'high' || band === 'critical';
  }
  return entry.kind === filter;
}

export default function HistoryScreen() {
  const t = useStrings(S);
  const { entries, clearAll } = useHistory();
  const { settings } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const visible = useMemo(() => entries.filter((e) => matches(e, filter)), [entries, filter]);

  return (
    <Screen title={t.title} subtitle={t.subtitle}>
      {!settings.storeTextInHistory ? <InlineNotice tone="info">{t.textOff}</InlineNotice> : null}

      <SegmentedControl<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t.all },
          { value: 'text', label: t.text },
          { value: 'voice', label: t.voice },
          { value: 'call', label: t.call },
          { value: 'threats', label: t.threats },
        ]}
      />

      {deleted ? <InlineNotice tone="success">{t.deleted}</InlineNotice> : null}

      {entries.length === 0 ? (
        <Card>
          <EmptyState icon="time-outline" title={t.emptyTitle} body={t.emptyBody} />
        </Card>
      ) : (
        <>
          <AppText variant="caption">{fmt(t.count, { n: visible.length })}</AppText>
          {visible.length === 0 ? (
            <AppText variant="small" align="center">
              {t.emptyFilter}
            </AppText>
          ) : (
            <View style={styles.list}>
              {visible.map((entry) => (
                <ScanListItem
                  key={entry.id}
                  entry={entry}
                  onPress={() => router.push({ pathname: '/result/[id]', params: { id: entry.id } })}
                />
              ))}
            </View>
          )}
          <Button
            label={confirming ? t.confirmDelete : t.deleteAll}
            icon="trash-outline"
            variant={confirming ? 'danger' : 'secondary'}
            fullWidth
            onPress={async () => {
              if (!confirming) {
                setConfirming(true);
                setDeleted(false);
                return;
              }
              await clearAll();
              setConfirming(false);
              setDeleted(true);
            }}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
});
