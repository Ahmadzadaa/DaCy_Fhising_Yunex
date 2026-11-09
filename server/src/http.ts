/**
 * Request helpers: body parsing/validation that never echoes user content into
 * errors or logs, multipart field access, URL extraction and image sniffing.
 */
import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError, describeZodError } from './errors.js';
import type { ImageMediaType } from './llm.js';

/** Parses the JSON body. Parser errors include body snippets, so they are replaced. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError('BAD_REQUEST', 'Body must be valid JSON');
  }
}

export function validate<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError('BAD_REQUEST', describeZodError(parsed.error));
  return parsed.data;
}

export type FormFields = Record<string, string | File | (string | File)[]>;

export async function readMultipart(c: Context): Promise<FormFields> {
  const type = c.req.header('content-type') ?? '';
  if (!/multipart\/form-data/i.test(type)) {
    throw new ApiError('BAD_REQUEST', 'Expected a multipart/form-data body');
  }
  try {
    return (await c.req.parseBody({ all: true })) as FormFields;
  } catch {
    throw new ApiError('BAD_REQUEST', 'Malformed multipart body');
  }
}

export function formFile(fields: FormFields, name: string): File | null {
  const value = fields[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first instanceof File ? first : null;
}

export function formString(fields: FormFields, name: string): string | undefined {
  const value = fields[name];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

export function formFlag(fields: FormFields, name: string): boolean {
  const value = formString(fields, name)?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/** Returns `value` when it is one of `allowed`, else `fallback`. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  const v = value?.trim().toLowerCase();
  return allowed.find((a) => a === v) ?? fallback;
}

/**
 * Finds http(s):// and www. links in free text (max `limit`, de-duplicated),
 * returned exactly as they appear, minus trailing punctuation.
 */
export function extractUrls(text: string, limit = 3): string[] {
  const found: string[] = [];
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"'`«»“”‘’]+/gi;
  for (const match of text.matchAll(re)) {
    let url = match[0];
    // Trim punctuation that usually ends the sentence rather than the link.
    while (/[.,;:!?)\]}>]$/.test(url)) {
      if (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) break;
      url = url.slice(0, -1);
    }
    if (url.length < 8 || /^(?:https?:\/\/|www\.)$/i.test(url)) continue;
    if (!found.some((f) => f.toLowerCase() === url.toLowerCase())) found.push(url);
    if (found.length >= limit) break;
  }
  return found;
}

/** Detects the image type from magic bytes (clients often send image/jpg or octet-stream). */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  const b = (i: number): number => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return 'image/gif';
  if (
    b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}
