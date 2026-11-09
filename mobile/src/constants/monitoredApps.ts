/**
 * Apps a guardian can select for DaCy Kids screening. Names and Ionicons glyphs
 * are used only to identify the app in settings and alerts.
 */
import type { IconName } from '@/constants/indicators';
import type { Localized, MonitoredAppId } from '@/types/security';

export interface MonitoredAppMeta {
  id: MonitoredAppId;
  name: string;
  icon: IconName;
  /** Brand-neutral accent used for the app chip. */
  color: string;
  /** Android package name the native agent would match (documentation for the production agent). */
  androidPackage: string;
  kind: Localized;
}

export const MONITORED_APPS: Record<MonitoredAppId, MonitoredAppMeta> = {
  instagram: { id: 'instagram', name: 'Instagram', icon: 'logo-instagram', color: '#C13584', androidPackage: 'com.instagram.android', kind: { en: 'Social · DMs', az: 'Sosial · mesajlar' } },
  whatsapp: { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp', color: '#25A35A', androidPackage: 'com.whatsapp', kind: { en: 'Messaging', az: 'Mesajlaşma' } },
  telegram: { id: 'telegram', name: 'Telegram', icon: 'paper-plane-outline', color: '#2A9BD6', androidPackage: 'org.telegram.messenger', kind: { en: 'Messaging', az: 'Mesajlaşma' } },
  tiktok: { id: 'tiktok', name: 'TikTok', icon: 'logo-tiktok', color: '#EE1D52', androidPackage: 'com.zhiliaoapp.musically', kind: { en: 'Video · DMs', az: 'Video · mesajlar' } },
  snapchat: { id: 'snapchat', name: 'Snapchat', icon: 'logo-snapchat', color: '#C9A400', androidPackage: 'com.snapchat.android', kind: { en: 'Disappearing messages', az: 'Silinən mesajlar' } },
  discord: { id: 'discord', name: 'Discord', icon: 'logo-discord', color: '#5865F2', androidPackage: 'com.discord', kind: { en: 'Gaming chat', az: 'Oyun çatı' } },
  roblox: { id: 'roblox', name: 'Roblox', icon: 'game-controller-outline', color: '#6B7280', androidPackage: 'com.roblox.client', kind: { en: 'Game chat', az: 'Oyun çatı' } },
  messages: { id: 'messages', name: 'SMS', icon: 'chatbubble-ellipses-outline', color: '#3E8E41', androidPackage: 'com.google.android.apps.messaging', kind: { en: 'Text messages', az: 'SMS mesajları' } },
};

export const DEFAULT_MONITORED_APPS: MonitoredAppId[] = ['instagram', 'whatsapp', 'telegram', 'tiktok', 'snapchat', 'roblox'];
