import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

type PosterImageProps = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  onError?: () => void;
  /** Stable key so FlatList recycling reuses the native image view. */
  recyclingKey?: string;
  /** Low for grids/shelves; high for title hero. */
  priority?: 'low' | 'normal' | 'high';
};

/** Cached poster decode — only mounts for cells the list keeps alive. */
export function PosterImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  recyclingKey,
  priority = 'low',
}: PosterImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit={resizeMode}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      priority={priority}
      transition={0}
      onError={onError}
    />
  );
}
