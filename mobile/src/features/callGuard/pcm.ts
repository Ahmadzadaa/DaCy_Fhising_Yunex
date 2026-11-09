/**
 * Small PCM helpers for the live call guard: concatenation, resampling,
 * loudness (RMS) and WAV encoding. Pure TypeScript, no native code.
 */

export const TARGET_SAMPLE_RATE = 16_000;

export function concatInt16(chunks: Int16Array[]): Int16Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Linear-interpolation resampler (good enough for speech-to-text). */
export function resampleInt16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[Math.min(idx + 1, input.length - 1)] ?? a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

/** Mixes interleaved multi-channel int16 down to mono. */
export function toMono(input: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return input;
  const frames = Math.floor(input.length / channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) sum += input[f * channels + c] ?? 0;
    out[f] = Math.round(sum / channels);
  }
  return out;
}

/** Root-mean-square level, 0..1. */
export function rmsInt16(samples: Int16Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = (samples[i] ?? 0) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i] ?? 0, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}
