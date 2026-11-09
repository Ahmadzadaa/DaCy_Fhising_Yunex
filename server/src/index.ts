import './env.js'; // must stay first: loads server/.env before anything reads process.env
import os from 'node:os';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { getLlmModel, getPort, getSttConfig, getTtsConfig, isLlmConfigured } from './config.js';
import { flushFamilyStore } from './family.js';

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) out.push(entry.address);
    }
  }
  return out;
}

const port = getPort();
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  const stt = getSttConfig();
  const on = (flag: boolean): string => (flag ? 'on' : 'off');
  const urls = lanAddresses().map((ip) => `http://${ip}:${info.port}`);
  console.log(
    `DaCy server listening on 0.0.0.0:${info.port} | LAN: ${urls.length ? urls.join(', ') : 'none'} | ` +
      `llm=${isLlmConfigured() ? `on(${getLlmModel()})` : 'off'} vision=${on(isLlmConfigured())} ` +
      `stt=${stt ? `on(${stt.provider}/${stt.model})` : 'off'} tts=${on(getTtsConfig() !== null)} ` +
      'urlInspection=on familyRelay=on',
  );
});

function shutdown(): void {
  flushFamilyStore();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
