import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CatalogBrowseList } from '../../components/CatalogBrowseList';
import { strings } from '../../constants/strings';
import { useCatalog } from '../../context/CatalogContext';
import { GlassScreen } from '../../context/GlassContext';

export default function SeriesScreen() {
  const { series } = useCatalog();

  return (
    <GlassScreen captureTabBarBlur>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <CatalogBrowseList
          items={series}
          title={strings.seriesTitle}
          emptyIcon="tv-outline"
          emptyTitle={strings.seriesEmpty}
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
