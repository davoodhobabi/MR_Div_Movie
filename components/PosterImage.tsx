import { Image, type ImageStyle, type StyleProp } from 'react-native';

type PosterImageProps = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  onError?: () => void;
};

/** Native posters decode only for cells the list has mounted. */
export function PosterImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
}: PosterImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      fadeDuration={0}
      onError={onError}
    />
  );
}
