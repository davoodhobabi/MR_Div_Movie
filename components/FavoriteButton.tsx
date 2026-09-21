import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { strings } from '../constants/strings';
import { colors } from '../constants/theme';
import { Glass } from './Glass';

type FavoriteButtonProps = {
  favorited: boolean;
  onPress: () => void;
  size?: 'sm' | 'md';
};

export function FavoriteButton({
  favorited,
  onPress,
  size = 'md',
}: FavoriteButtonProps) {
  const iconSize = size === 'sm' ? 20 : 24;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={favorited ? strings.unfavoriteA11y : strings.favoriteA11y}
    >
      <Glass style={[styles.button, size === 'sm' && styles.buttonSm]}>
        <Ionicons
          name={favorited ? 'heart' : 'heart-outline'}
          size={iconSize}
          color={favorited ? colors.accent : colors.text}
        />
      </Glass>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: {
    width: 36,
    height: 36,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.92 }],
  },
});
