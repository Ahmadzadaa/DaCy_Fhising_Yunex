import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FamilyAlertBanner } from '@/components/FamilyAlertBanner';
import { colors } from '@/constants/theme';
import { FamilyProvider } from '@/state/family';
import { HistoryProvider } from '@/state/history';
import { ServerStatusProvider } from '@/state/serverStatus';
import { SettingsProvider, useSettings } from '@/state/settings';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.critical,
  },
};

function RootNavigator() {
  const { loaded, settings } = useSettings();
  const az = settings.uiLanguage === 'az';

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded]);

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerBackTitle: az ? 'Geri' : 'Back',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: az ? 'Ekran skanı' : 'Screen scan' }} />
        <Stack.Screen name="result/[id]" options={{ title: az ? 'Nəticə' : 'Result' }} />
        <Stack.Screen name="settings" options={{ title: az ? 'Ayarlar' : 'Settings' }} />
        <Stack.Screen name="shortcut-guide" options={{ title: az ? 'Ekran skanı qısayolu' : 'Screen Scan shortcut' }} />
        <Stack.Screen name="kids-demo" options={{ title: az ? 'Uşaq telefonu simulyatoru' : 'Child phone simulator' }} />
      </Stack>
      <FamilyAlertBanner />
      <StatusBar style="dark" />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <SettingsProvider>
          <ServerStatusProvider>
            <HistoryProvider>
              <FamilyProvider>
                <RootNavigator />
              </FamilyProvider>
            </HistoryProvider>
          </ServerStatusProvider>
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
