import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { AppTabBar } from '../../components/AppTabBar';
import { strings } from '../../constants/strings';
import { TabBarBlurTargetProvider } from '../../context/GlassContext';

export default function TabsLayout() {
  return (
    <TabBarBlurTargetProvider>
      <Tabs
        initialRouteName="index"
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarStyle: {
            position: 'absolute',
            height: 0,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
          },
        }}
      >
        <Tabs.Screen
          name="favorites"
          options={{
            title: strings.tabFavorites,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'heart' : 'heart-outline'}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="movies"
          options={{
            title: strings.tabMovies,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'film' : 'film-outline'}
                size={22}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: strings.tabHome,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="series"
          options={{
            title: strings.tabSeries,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'tv' : 'tv-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: strings.tabSettings,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'information-circle' : 'information-circle-outline'}
                size={22}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </TabBarBlurTargetProvider>
  );
}
