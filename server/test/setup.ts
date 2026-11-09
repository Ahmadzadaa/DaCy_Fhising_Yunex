/**
 * Imported first by every test file: makes the run hermetic (no API keys, no
 * request logs, family store in a temp dir). Config is read lazily, so setting
 * process.env here is enough even though app modules are imported afterwards.
 */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

for (const name of [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'STT_PROVIDER',
  'STT_MODEL',
  'DACY_LLM_MODEL',
  'RATE_LIMIT_PER_MIN',
]) {
  delete process.env[name];
}
process.env.DACY_LOG_REQUESTS = '0';
process.env.DACY_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), 'dacy-test-'));
