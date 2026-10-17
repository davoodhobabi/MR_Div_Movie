export type RemoteAudioTrack = {
  index: number;
  language?: string;
  title?: string;
  default?: boolean;
};

const LANGUAGE_FA: Record<string, string> = {
  jpn: 'ژاپنی',
  jap: 'ژاپنی',
  ja: 'ژاپنی',
  japanese: 'ژاپنی',
  eng: 'انگلیسی',
  en: 'انگلیسی',
  english: 'انگلیسی',
  fas: 'فارسی',
  per: 'فارسی',
  fa: 'فارسی',
  persian: 'فارسی',
  kor: 'کره‌ای',
  ko: 'کره‌ای',
  korean: 'کره‌ای',
  chi: 'چینی',
  zho: 'چینی',
  zh: 'چینی',
  chinese: 'چینی',
  ara: 'عربی',
  ar: 'عربی',
  arabic: 'عربی',
  hin: 'هندی',
  hi: 'هندی',
  spa: 'اسپانیایی',
  es: 'اسپانیایی',
  fra: 'فرانسوی',
  fr: 'فرانسوی',
  deu: 'آلمانی',
  ger: 'آلمانی',
  de: 'آلمانی',
  rus: 'روسی',
  ru: 'روسی',
  tur: 'ترکی',
  tr: 'ترکی',
};

function namedLabel(track: RemoteAudioTrack): string | null {
  const language = (track.language || '').trim().toLowerCase();
  if (LANGUAGE_FA[language]) return LANGUAGE_FA[language];
  const title = (track.title || '').trim();
  const folded = title.toLowerCase();
  if (folded.includes('japan')) return 'ژاپنی';
  if (folded.includes('english')) return 'انگلیسی';
  if (folded.includes('persian') || folded.includes('farsi')) return 'فارسی';
  if (title && !/^audio\b/i.test(title) && title.length < 32) return title;
  return null;
}

export function audioTrackLabels(tracks: RemoteAudioTrack[]): string[] {
  const used = new Map<string, number>();
  return tracks.map((track, position) => {
    const base =
      namedLabel(track) ||
      `صدای ${(position + 1).toLocaleString('fa-IR')}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    if (count === 1) return base;
    return `${base} ${count.toLocaleString('fa-IR')}`;
  });
}
