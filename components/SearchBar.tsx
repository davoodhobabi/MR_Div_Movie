import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { strings } from '../constants/strings';
import { colors, fonts, radii, spacing } from '../constants/theme';
import { useTvMenuFocus } from '../context/TvMenuFocus';
import { Glass } from './Glass';
import { isAndroidTv, useTvFocus } from '../lib/tv';

type SearchBarProps = {
  onSubmit: (query: string) => void;
  onChangeQuery?: (query: string) => void;
  placeholder?: string;
  initialValue?: string;
};

export function SearchBar({
  onSubmit,
  onChangeQuery,
  placeholder = strings.searchPlaceholder,
  initialValue = '',
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const clearFocus = useTvFocus();
  const inputRef = useRef<TextInput>(null);
  const screenFocused = useIsFocused();
  const menu = useTvMenuFocus();
  const registerEntry = menu?.registerEntry;
  const tv = isAndroidTv();

  useEffect(() => {
    if (!tv || !screenFocused || !registerEntry) return;
    const frame = requestAnimationFrame(() => registerEntry(inputRef.current));
    return () => {
      cancelAnimationFrame(frame);
      registerEntry(null);
    };
  }, [tv, screenFocused, registerEntry]);

  const updateValue = (next: string) => {
    setValue(next);
    onChangeQuery?.(next);
  };

  const handleSubmit: TextInputProps['onSubmitEditing'] = () => {
    const query = value.trim();
    if (!query) return;
    onSubmit(query);
  };

  return (
    <Glass
      intensity={focused ? 58 : 48}
      style={[styles.container, focused && styles.focused]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="search" size={20} color={colors.accent} />
      </View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={updateValue}
        {...(tv
          ? ({ nextFocusUp: menu?.menuTag ?? undefined } as {
              nextFocusUp?: number;
            })
          : null)}
        onSubmitEditing={handleSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel={strings.searchA11y}
        textAlign="right"
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => updateValue('')}
          hitSlop={10}
          {...clearFocus.props}
          accessibilityRole="button"
          accessibilityLabel={strings.clearSearchA11y}
          style={[styles.clear, clearFocus.style]}
        >
          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.search,
    paddingHorizontal: spacing.md,
    minHeight: 58,
    width: '100%',
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  focused: {
    borderColor: 'rgba(229, 9, 20, 0.45)',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    writingDirection: 'rtl',
  },
  clear: {
    padding: 2,
  },
});
