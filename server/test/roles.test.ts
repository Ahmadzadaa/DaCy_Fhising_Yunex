import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { validateSplit } from '../src/roles.js';

describe('caller / owner split validation', () => {
  const t = 'Narahat olmayın. Bloku açmaq üçün mənə kart nömrənizi və CVV kodunu deyin. Bir dəqiqə, kartım çantadadır.';
  test('accepts pieces that reproduce the transcript (punctuation and case ignored)', () => {
    assert.ok(
      validateSplit(t, [
        { role: 'caller', text: 'Narahat olmayın, bloku açmaq üçün mənə kart nömrənizi və CVV kodunu deyin' },
        { role: 'owner', text: 'bir dəqiqə kartım çantadadır' },
      ]),
    );
  });
  test('rejects pieces that change, translate or drop words', () => {
    assert.equal(validateSplit(t, [{ role: 'caller', text: 'Bloku açmak için kart numaranızı söyleyin' }]), false);
    assert.equal(validateSplit(t, [{ role: 'caller', text: 'Narahat olmayın.' }]), false);
    assert.equal(validateSplit(t, []), false);
  });
});
