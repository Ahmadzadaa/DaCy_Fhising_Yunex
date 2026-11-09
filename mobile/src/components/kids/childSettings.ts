/**
 * DaCy Kids settings as the UI uses them. One rule everywhere for "nothing saved yet"
 * (`childSettings === null`):
 *  - on a PROTECTED phone (the child's): nothing is screened — DaCy screens only the
 *    apps a guardian actually selected;
 *  - on the guardian's phone or a phone that is not linked: the recommended defaults
 *    are shown (and used by the simulator) until the guardian saves a choice.
 */
import { Platform } from 'react-native';

import { DEFAULT_MONITORED_APPS } from '@/constants/monitoredApps';
import type { ChildSafetySettings, FamilyRole, MonitoredAppId } from '@/types/security';

export interface EffectiveChildSettings {
  enabled: boolean;
  monitoredApps: MonitoredAppId[];
  childWarnings: boolean;
  /** Nothing saved yet; the recommended defaults are shown (guardian / unlinked phone). */
  isDefault: boolean;
  /** Nothing saved yet on a protected phone: screening is off until the guardian chooses apps. */
  notSet: boolean;
}

export function effectiveChildSettings(
  settings: ChildSafetySettings | null,
  role: FamilyRole | null | undefined = null,
): EffectiveChildSettings {
  if (!settings) {
    if (role === 'protected') return { enabled: false, monitoredApps: [], childWarnings: true, isDefault: false, notSet: true };
    return { enabled: true, monitoredApps: [...DEFAULT_MONITORED_APPS], childWarnings: true, isDefault: true, notSet: false };
  }
  return {
    enabled: settings.enabled,
    monitoredApps: settings.monitoredApps,
    childWarnings: settings.childWarnings,
    isDefault: false,
    notSet: false,
  };
}

/** True when DaCy Kids is on and the given app is one of the guardian's selected apps. */
export function isAppScreened(settings: EffectiveChildSettings, app: MonitoredAppId): boolean {
  return settings.enabled && settings.monitoredApps.includes(app);
}

/**
 * Whether THIS build can screen other apps in the background. Always false here:
 *  - iPhone: Apple does not let any app read other apps;
 *  - Android: the DaCy agent (AccessibilityService + NotificationListener) is a native
 *    module that Expo Go cannot load, so this demo build does not include it.
 * The child-phone simulator shows how the agent would work. Never claim more.
 */
export const KIDS_AGENT_AVAILABLE: boolean = false;

/** Why app screening is not active on this phone (for honest wording). */
export const KIDS_AGENT_LIMIT: 'ios' | 'demo-build' = Platform.OS === 'ios' ? 'ios' : 'demo-build';
