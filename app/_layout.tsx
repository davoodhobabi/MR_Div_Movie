import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { CatalogProvider } from '../context/CatalogContext';
import '../lib/rtl';

function AppShell() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontFamily: fonts.medium,
            fontWeight: '600',
          },
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="player"
          options={{
            title: 'در حال پخش',
            presentation: 'card',
          }}
        />
        <Stack.Screen name="title/[id]" options={{ title: 'عنوان' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [fonts.regular]: require('../assets/fonts/IRANSansXNoEn-Regular.ttf'),
    [fonts.medium]: require('../assets/fonts/IRANSansXNoEn-Medium.ttf'),
    [fonts.bold]: require('../assets/fonts/IRANSansXNoEn-Bold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CatalogProvider>
        <AppShell />
      </CatalogProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hydrate: {
    flex: 1,
    backgroundColor: colors.background,
  },
  root: {
    flex: 1,
    ...(Platform.OS === 'web' ? { direction: 'rtl' as const } : null),
  },
});
