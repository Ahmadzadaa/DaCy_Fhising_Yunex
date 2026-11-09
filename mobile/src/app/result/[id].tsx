import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ResultView } from '@/components/result/ResultView';
import { ScanListItem } from '@/components/ScanListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/misc';
import { Screen } from '@/components/ui/Screen';
import { defineStrings, useStrings } from '@/i18n';
import { useHistory } from '@/state/history';

const S = defineStrings({
  en: {
    notFound: 'Result not found',
    notFoundBody: 'It may have been deleted from history.',
    back: 'Back to history',
    delete: 'Delete this result',
    confirm: 'Tap again to delete',
  },
  az: {
    notFound: 'Nəticə tapılmadı',
    notFoundBody: 'Ola bilsin ki, tarixçədən silinib.',
    back: 'Tarixçəyə qayıt',
    delete: 'Bu nəticəni sil',
    confirm: 'Silmək üçün yenidən toxunun',
  },
});

export default function ResultDetailScreen() {
  const t = useStrings(S);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, remove } = useHistory();
  const [confirming, setConfirming] = useState(false);
  const entry = entries.find((e) => e.id === id);

  if (!entry) {
    return (
      <Screen edges={['bottom']}>
        <Card>
          <EmptyState icon="document-outline" title={t.notFound} body={t.notFoundBody} actionLabel={t.back} onAction={() => router.replace('/history')} />
        </Card>
      </Screen>
    );
  }

  const deleteButton = (
    <Button
      label={confirming ? t.confirm : t.delete}
      icon="trash-outline"
      variant={confirming ? 'danger' : 'ghost'}
      fullWidth
      onPress={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        remove(entry.id);
        router.back();
      }}
    />
  );

  return (
    <Screen edges={['bottom']}>
      {entry.kind === 'call' ? (
        <>
          <ScanListItem entry={entry} />
          {deleteButton}
        </>
      ) : (
        <ResultView result={entry} actions={deleteButton} />
      )}
    </Screen>
  );
}
