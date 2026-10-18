import { View, type ImageStyle, type StyleProp } from 'react-native';

type PosterImageProps = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  onError?: () => void;
};

/** Browser fetches the poster only as the card nears the viewport. */
export function PosterImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
}: PosterImageProps) {
  return (
    <View style={style}>
      <img
        src={uri}
        alt=""
        loading="lazy"
        decoding="async"
        onError={onError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: resizeMode === 'contain' ? 'contain' : 'cover',
          display: 'block',
        }}
      />
    </View>
  );
}
