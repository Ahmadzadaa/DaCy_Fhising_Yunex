import Ionicons from '@expo/vector-icons/Ionicons';
import Tabs, { type BottomTabNavigationOptions } from 'expo-router/js-tabs';

import { TabBar } from '@/components/ui/TabBar';
import type { IconName } from '@/constants/indicators';
import { colors } from '@/constants/theme';
import { useFamily } from '@/state/family';
import { useSettings } from '@/state/settings';

function icon(name: IconName, focusedName: IconName): NonNullable<BottomTabNavigationOptions['tabBarIcon']> {
  return function TabIcon({ color, focused }) {
    return <Ionicons name={focused ? focusedName : name} size={23} color={typeof color === 'string' ? color : colors.textMuted} />;
  };
}

export default function TabLayout() {
  const { settings } = useSettings();
  const { unseenCount } = useFamily();
  const az = settings.uiLanguage === 'az';

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: az ? 'Əsas' : 'Home', tabBarIcon: icon('shield-outline', 'shield') }} />
      <Tabs.Screen name="analyze" options={{ title: az ? 'Yoxla' : 'Check', tabBarIcon: icon('scan-outline', 'scan') }} />
      <Tabs.Screen name="voice" options={{ title: az ? 'Zəng' : 'Call Guard', tabBarIcon: icon('call-outline', 'call') }} />
      <Tabs.Screen name="history" options={{ title: az ? 'Tarixçə' : 'History', tabBarIcon: icon('time-outline', 'time') }} />
      <Tabs.Screen
        name="family"
        options={{
          title: az ? 'Ailə' : 'Family',
          tabBarIcon: icon('people-outline', 'people'),
          tabBarBadge: unseenCount > 0 ? unseenCount : undefined,
        }}
      />
    </Tabs>
  );
}
