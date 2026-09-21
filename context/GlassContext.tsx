import { BlurTargetView } from 'expo-blur';
import { useIsFocused } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenBackdrop } from '../components/ScreenBackdrop';
import { colors } from '../constants/theme';

export const GlassTargetContext = createContext<RefObject<View | null> | null>(
  null,
);

type TabBarBlurTargetValue = {
  register: (ref: RefObject<View | null>) => void;
  target: RefObject<View | null> | null;
};

export const TabBarBlurTargetContext =
  createContext<TabBarBlurTargetValue | null>(null);

export function TabBarBlurTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<RefObject<View | null> | null>(null);
  const register = useCallback((ref: RefObject<View | null>) => {
    setTarget((current) => (current === ref ? current : ref));
  }, []);
  const value = useMemo(() => ({ register, target }), [register, target]);

  return (
    <TabBarBlurTargetContext.Provider value={value}>
      {children}
    </TabBarBlurTargetContext.Provider>
  );
}

type GlassScreenProps = {
  children: ReactNode;
  captureTabBarBlur?: boolean;
};

export function GlassScreen({
  children,
  captureTabBarBlur = false,
}: GlassScreenProps) {
  const boxTargetRef = useRef<View | null>(null);
  const contentTargetRef = useRef<View | null>(null);
  const focused = useIsFocused();
  const tabBarBlur = useContext(TabBarBlurTargetContext);

  useEffect(() => {
    if (!captureTabBarBlur || !focused) return;
    tabBarBlur?.register(contentTargetRef);
  }, [captureTabBarBlur, focused, tabBarBlur]);

  return (
    <GlassTargetContext.Provider value={boxTargetRef}>
      <View style={styles.root}>
        <BlurTargetView
          ref={boxTargetRef}
          collapsable={false}
          style={styles.backdrop}
          pointerEvents="none"
        >
          <ScreenBackdrop />
        </BlurTargetView>
        {captureTabBarBlur ? (
          <BlurTargetView
            ref={contentTargetRef}
            collapsable={false}
            style={styles.fill}
          >
            <View style={styles.backdrop} pointerEvents="none">
              <ScreenBackdrop />
            </View>
            {children}
          </BlurTargetView>
        ) : (
          children
        )}
      </View>
    </GlassTargetContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    flex: 1,
  },
});
