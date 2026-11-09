/**
 * Writes an audio chunk to a short-lived file so it can be uploaded with
 * multipart/form-data, and deletes it right after. Native: app cache dir.
 * Web: an in-memory blob: URL.
 */
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { UploadFile } from '@/services/api/client';

export interface TempAudioFile extends UploadFile {
  dispose: () => void;
}

export function writeTempWav(bytes: Uint8Array, name: string): TempAudioFile {
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as BlobPart], { type: 'audio/wav' });
    const uri = URL.createObjectURL(blob);
    return { uri, name, type: 'audio/wav', dispose: () => URL.revokeObjectURL(uri) };
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(bytes);
  return {
    uri: file.uri,
    name,
    type: 'audio/wav',
    dispose: () => {
      try {
        if (file.exists) file.delete();
      } catch {
        // Best effort: the OS also clears the cache directory.
      }
    },
  };
}

/** Deletes a recording file by URI (Voice Lab recordings). */
export function deleteFileUri(uri: string | null | undefined): void {
  if (!uri || Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // ignore
  }
}
