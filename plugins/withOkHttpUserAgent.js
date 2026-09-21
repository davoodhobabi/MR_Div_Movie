const { withMainApplication, createRunOncePlugin } = require('expo/config-plugins');

const UA =
  'MrDivMovie/1.0.12 (personal Android catalog; Wikipedia poster lookup)';
const MARKER = 'OkHttpClientProvider.setOkHttpClientFactory';

function withOkHttpUserAgent(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    if (!src.includes('import com.facebook.react.modules.network.OkHttpClientProvider')) {
      src = src.replace(
        'import expo.modules.ApplicationLifecycleDispatcher',
        `import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.ApplicationLifecycleDispatcher`,
      );
    }

    src = src.replace(
      'override fun onCreate() {\n    super.onCreate()',
      `override fun onCreate() {
    val appContext = this
    OkHttpClientProvider.setOkHttpClientFactory(
      OkHttpClientFactory {
        OkHttpClientProvider.createClientBuilder(appContext)
          .addNetworkInterceptor { chain ->
            chain.proceed(
              chain.request()
                .newBuilder()
                .header("User-Agent", "${UA}")
                .build()
            )
          }
          .build()
      }
    )
    super.onCreate()`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withOkHttpUserAgent,
  'with-okhttp-user-agent',
  '1.0.0',
);
