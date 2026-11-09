import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cleanTranscript } from '../src/stt.js';

describe('speech-to-text silence artifacts', () => {
  test('drops whole-transcript artifacts produced on silence or noise', () => {
    for (const t of ['Thank you for watching.', 'Thank you.', 'Subtitles by the Amara.org community', '...', '  ']) {
      assert.equal(cleanTranscript(t), '', t);
    }
  });
  test('keeps real speech, even when it mentions thanks', () => {
    const real = 'Thank you, your request was reviewed and everything is in order.';
    assert.equal(cleanTranscript(real), real);
    assert.equal(cleanTranscript('Read me the SMS code now.'), 'Read me the SMS code now.');
  });
});
