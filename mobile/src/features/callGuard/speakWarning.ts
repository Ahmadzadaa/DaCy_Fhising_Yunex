/**
 * Spoken in-call warnings.
 *  - English: on-device iOS voice (expo-speech), works offline.
 *  - Azerbaijani: iOS has no Azerbaijani voice, so the DaCy server's TTS is used
 *    when available; otherwise the closest on-device voice (Turkish) reads the text.
 */
import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import { ttsUrl } from '@/services/api/client';
import type { Localized, UiLanguage } from '@/types/security';

export const WARNING_TEXT: Record<'high' | 'critical', Localized> = {
  high: {
    en: 'Warning. This call shows signs of a scam. Do not share any code or card details.',
    az: 'Diqqət. Bu zəngdə dələduzluq əlamətləri var. Heç bir kod və ya kart məlumatı deməyin.',
  },
  critical: {
    en: 'Stop. This is very likely a scam. Do not share any code, card details or money. End the call.',
    az: 'Dayanın. Bu, böyük ehtimalla dələduzluqdur. Heç bir kod və kart məlumatı deməyin, pul köçürməyin. Zəngi bitirin.',
  },
};

export interface SpeakOptions {
  baseUrl: string;
  serverTts: boolean;
  /** Called when playback finished (or failed). */
  onDone: () => void;
}

function speakOnDevice(text: string, language: string, onDone: () => void): void {
  Speech.speak(text, {
    language,
    rate: 0.95,
    onDone,
    onStopped: onDone,
    onError: () => onDone(),
  });
}

export function speakWarning(text: string, lang: UiLanguage, options: SpeakOptions): void {
  void Speech.stop();
  if (lang === 'en') {
    speakOnDevice(text, 'en-US', options.onDone);
    return;
  }
  if (options.serverTts) {
    try {
      const player = createAudioPlayer({ uri: ttsUrl(options.baseUrl, text, 'az') });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        sub.remove();
        clearTimeout(guard);
        player.remove();
        options.onDone();
      };
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) finish();
      });
      // Safety net: never keep the microphone muted for longer than 12 s.
      const guard = setTimeout(finish, 12_000);
      player.play();
      return;
    } catch {
      // fall through to the on-device voice
    }
  }
  speakOnDevice(text, 'tr-TR', options.onDone);
}
