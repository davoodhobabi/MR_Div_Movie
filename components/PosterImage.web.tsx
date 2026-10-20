import { View, type ImageStyle, type StyleProp } from 'react-native';

type PosterImageProps = {
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  onError?: () => void;
  recyclingKey?: string;
  priority?: 'low' | 'normal' | 'high';
};

/** Browser fetches the poster only as the card nears the viewport. */
export function PosterImage({
  uri,
  style,
  resizeMode = 'cover',
  onError,
  priority = 'low',
}: PosterImageProps) {
  return (
    <View style={style}>
      <img
        src={uri}
        alt=""
        loading={priority === 'high' ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority === 'high' ? 'high' : 'low'}
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
