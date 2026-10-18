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
} from 'react';
import { BackHandler, findNodeHandle } from 'react-native';
import { isAndroidTv } from '../lib/tv';

type TvMenuFocusValue = {
  menuTag: number | null;
  entryTag: number | null;
  focusPulse: number;
  registerMenu: (host: unknown) => void;
  registerEntry: (host: unknown) => void;
  onMenuFocus: () => void;
  onMenuBlur: () => void;
};

const TvMenuFocusContext = createContext<TvMenuFocusValue | null>(null);

export function TvMenuFocusProvider({ children }: { children: ReactNode }) {
  const tabsFocused = useIsFocused();
  const menuFocused = useRef(false);
  const focusGen = useRef(0);
  const [menuTag, setMenuTag] = useState<number | null>(null);
  const [entryTag, setEntryTag] = useState<number | null>(null);
  const [focusPulse, setFocusPulse] = useState(0);

  const registerMenu = useCallback((host: unknown) => {
    const tag = host ? findNodeHandle(host as never) : null;
    setMenuTag((prev) => (prev === tag ? prev : tag));
  }, []);

  const registerEntry = useCallback((host: unknown) => {
    const tag = host ? findNodeHandle(host as never) : null;
    setEntryTag((prev) => (prev === tag ? prev : tag));
  }, []);

  const onMenuFocus = useCallback(() => {
    focusGen.current += 1;
    menuFocused.current = true;
  }, []);

  const onMenuBlur = useCallback(() => {
    const token = focusGen.current;
    setTimeout(() => {
      if (focusGen.current === token) menuFocused.current = false;
    }, 48);
  }, []);

  const focusMenu = useCallback(() => {
    setFocusPulse((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!isAndroidTv() || !tabsFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuFocused.current) return false;
      focusMenu();
      return true;
    });
    return () => sub.remove();
  }, [tabsFocused, focusMenu]);

  const value = useMemo(
    () => ({
      menuTag,
      entryTag,
      focusPulse,
      registerMenu,
      registerEntry,
      onMenuFocus,
      onMenuBlur,
    }),
    [menuTag, entryTag, focusPulse, registerMenu, registerEntry, onMenuFocus, onMenuBlur],
  );

  return (
    <TvMenuFocusContext.Provider value={value}>{children}</TvMenuFocusContext.Provider>
  );
}

export function useTvMenuFocus(): TvMenuFocusValue | null {
  return useContext(TvMenuFocusContext);
}
