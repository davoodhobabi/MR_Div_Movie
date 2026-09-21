export const strings = {
  brand: 'MrDiv_Movie',
  catalogReady: (count: string) => `${count} عنوان آماده جستجو`,
  searchPlaceholder: 'جستجو با نام یا کد IMDb',
  searchA11y: 'جستجو',
  clearSearchA11y: 'پاک کردن جستجو',
  noMatch: (query: string) => `عنوانی مطابق «${query}» پیدا نشد.`,
  searchHint: 'نام فارسی، انگلیسی یا کد IMDb را بنویسید.',
  tabFavorites: 'علاقه‌ها',
  tabMovies: 'فیلم‌ها',
  tabHome: 'خانه',
  tabSearch: 'جستجو',
  tabSeries: 'سریال‌ها',
  homeHeadline: 'خانه',
  seeAll: 'مشاهده همه',
  nowPlayingSection: 'در حال پخش',
  nowPlayingEmpty: 'هنوز فیلمی را نصفه نگذاشته‌اید.',
  nowPlayingEmptyHint: 'هر عنوانی که پخش کنید و وسطش رها کنید، اینجا می‌ماند.',
  continuePercent: (percent: string) => `${percent}٪ تماشا شده`,
  removeFromNowPlayingA11y: 'حذف از در حال پخش',
  favoritesCarouselEmpty: 'هنوز علاقه‌مندی ندارید.',
  favoritesCarouselHint: 'با زدن قلب روی فیلم یا سریال، اینجا می‌آید.',
  tabSettings: 'درباره دیو',
  moviesTitle: 'فیلم‌ها',
  seriesTitle: 'سریال‌ها',
  moviesEmpty: 'فیلمی در فهرست نیست.',
  seriesEmpty: 'سریالی در فهرست نیست.',
  favoritesEmpty: 'هنوز عنوانی ذخیره نشده.',
  browseSearchPlaceholder: 'جستجو در این فهرست',
  browseCount: (count: string) => `${count} عنوان`,
  startSearchTitle: 'شروع جستجو',
  settingsPageTitle: 'درباره دیو',
  favoritesTitle: 'علاقه‌مندی‌ها',
  favoritesCount: (count: string) => `${count} عنوان`,
  favoritesEmptyHint: 'با زدن قلب روی هر عنوان، اینجا ذخیره می‌شود.',
  favorited: 'علاقه‌مندی',
  favoriteA11y: 'افزودن به علاقه‌مندی‌ها',
  unfavoriteA11y: 'حذف از علاقه‌مندی‌ها',
  movie: 'فیلم',
  series: 'سریال',
  titleFallback: 'عنوان',
  titleNotFound: 'عنوان پیدا نشد.',
  imdb: 'IMDb',
  rating: 'امتیاز',
  votes: 'رأی',
  noSources: 'هنوز منبعی ثبت نشده.',
  openImdb: 'مشاهده در IMDb',
  sourceUnavailable: 'هنوز لینک مجاز برای این منبع تنظیم نشده است.',
  sizeUnknown: 'حجم نامشخص',
  tapToPlay: 'یک کیفیت را انتخاب کنید تا پخش شروع شود',
  tapToPlaySeries: 'فصل، کیفیت و اپیزود را انتخاب کنید',
  pickSeason: 'انتخاب فصل',
  pickQuality: 'انتخاب کیفیت',
  pickEpisode: 'انتخاب قسمت',
  seasonLabel: (n: number) => `فصل ${n.toLocaleString('fa-IR')}`,
  episodeCount: (n: number) => `${n.toLocaleString('fa-IR')} قسمت`,
  loadingEpisodes: 'در حال دریافت فهرست قسمت‌ها…',
  backStep: 'بازگشت',
  retryFetch: 'تلاش دوباره',
  folderError: (code: string) => {
    switch (code) {
      case 'EMPTY_LIST':
        return 'فایل ویدیویی در این فولدر پیدا نشد (شاید فقط زیر‌پوشه باشد یا لینک قدیمی).';
      case 'EMPTY_HTML':
        return 'پاسخ سرور خالی بود.';
      case 'TIMEOUT':
        return 'دریافت فهرست قسمت‌ها طولانی شد.';
      case 'IRAN_IP_REQUIRED':
        return 'سرور فقط با IP ایران پاسخ می‌دهد. VPN/پروکسی را خاموش کنید.';
      case 'EMPTY_URL':
        return 'آدرس فولدر خالی است.';
      default:
        if (code.startsWith('HTTP_')) {
          return `دریافت فولدر ناموفق بود (${code.replace('HTTP_', '')}).`;
        }
        return 'دریافت فهرست قسمت‌ها ناموفق بود.';
    }
  },
  nowPlaying: 'در حال پخش',
  nowPlayingLabel: 'در حال پخش',
  playbackLoading: 'در حال آماده‌سازی پخش…',
  playbackFailed:
    'پخش این فایل ناموفق بود. کیفیت دیگری را امتحان کنید یا دوباره تلاش کنید.',
  playbackCodecUnsupported:
    'دیکودر نرم‌افزاری هم نتوانست این فایل را پخش کند. کیفیت/منبع دیگری را امتحان کنید.',
  tapToResume: 'برای ادامه پخش لمس کنید',
  downloadFile: 'دانلود فایل',
  playbackHint:
    'پلیر داخلی با دیکودر نرم‌افزاری FFmpeg کدک‌های رایج (از جمله HEVC داخل MKV) را پوشش می‌دهد. زیرنویس SoftSub در صورت وجود خودکار انتخاب می‌شود.',
  playerSubtitlesOn: 'زیرنویس روشن',
  playerSubtitlesOff: 'زیرنویس خاموش',
  playerSubtitlesCycle: 'تعویض زیرنویس',
  playerFullscreen: 'تمام‌صفحه',
  playerExitFullscreen: 'خروج از تمام‌صفحه',
  playerMute: 'بی‌صدا',
  playerUnmute: 'با صدا',
  playerSeekBack: '۱۵ ثانیه عقب',
  playerSeekForward: '۱۵ ثانیه جلو',
  playerPlay: 'پخش',
  playerPause: 'توقف',
  playerNoSubtitles: 'زیرنویسی در این فایل پیدا نشد',
  playerSubtitleTrack: (label: string) => `زیرنویس: ${label}`,
  sampleVideo: 'ویدیوی نمونه',
  searchPrefix: 'جستجو',
  settingsA11y: 'درباره دیو',
  supportMrDiv: 'حمایت از آقای دیو',
  supportMrDivUrl: 'https://donito.me/mrDiv',
  supportReminderTitle: 'اگر از اپ خوشت آمده',
  supportReminderBody:
    'با حمایت از آقای دیو کمک می‌کنی این برنامه ادامه پیدا کند.',
  supportReminderLater: 'بعداً',
  supportGoalFallbackTitle: 'هدف حمایت',
  supportGoalProgress: (filled: string, goal: string) =>
    `${filled} از ${goal}`,
  telegramChannel: '@mr_div_products',
  telegramChannelUrl: 'https://t.me/mr_div_products',
  telegramChannelTitle: 'محصولات جدید',
  telegramChannelHint: 'کانال تلگرام آقای دیو',
  telegramChannelA11y: 'باز کردن کانال تلگرام محصولات جدید',
  cancel: 'انصراف',
} as const;
