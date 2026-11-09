/**
 * Loads server/.env (if present) into process.env. Imported first by src/index.ts.
 * Variables already set in the shell take precedence over the file.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
try {
  process.loadEnvFile(envFile);
} catch {
  // No .env file: run with the shell environment only (all keys are optional).
}
