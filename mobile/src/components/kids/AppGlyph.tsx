/**
 * Brand-neutral app identifier: an Ionicons glyph in a rounded square, tinted with
 * the catalog accent. Never a copy of a real app's logo artwork.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { MONITORED_APPS } from '@/constants/monitoredApps';
import type { MonitoredAppId } from '@/types/security';

export function AppGlyph({ app, size = 32, solid = false }: { app: MonitoredAppId; size?: number; solid?: boolean }) {
  const meta = MONITORED_APPS[app];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: solid ? meta.color : `${meta.color}1F`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessible={false}>
      <Ionicons name={meta.icon} size={Math.round(size * 0.56)} color={solid ? '#FFFFFF' : meta.color} />
    </View>
  );
}
