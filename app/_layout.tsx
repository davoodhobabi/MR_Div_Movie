import '../lib/rtl';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { colors, fonts } from '../constants/theme';
import { CatalogProvider } from '../context/CatalogContext';

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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflowX;
    const prevBodyOverflow = body.style.overflowX;
    const prevBodyBg = body.style.backgroundColor;
    html.style.overflowX = 'hidden';
    body.style.overflowX = 'hidden';
    body.style.backgroundColor = colors.background;
    return () => {
      html.style.overflowX = prevHtmlOverflow;
      body.style.overflowX = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.root}>
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
  root: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.background,
  },
});
