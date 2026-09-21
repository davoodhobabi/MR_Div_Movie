import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogBrowseList } from '../../components/CatalogBrowseList';
import { strings } from '../../constants/strings';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';

export default function MoviesScreen() {
  const { movies } = useCatalog();

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <CatalogBrowseList
          items={movies}
          title={strings.moviesTitle}
          emptyIcon="film-outline"
          emptyTitle={strings.moviesEmpty}
        />
      </SafeAreaView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
});
