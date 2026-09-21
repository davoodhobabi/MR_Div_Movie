import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogBrowseList } from '../../components/CatalogBrowseList';
import { strings } from '../../constants/strings';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';

export default function FavoritesScreen() {
  const { favorites } = useCatalog();

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <CatalogBrowseList
          items={favorites}
          title={strings.favoritesTitle}
          emptyIcon="heart-outline"
          emptyTitle={strings.favoritesEmpty}
          emptyHint={strings.favoritesEmptyHint}
        />
      </SafeAreaView>
    </GlassScreen>
  );
}

const styles = {
  safe: {
    flex: 1,
  },
};
