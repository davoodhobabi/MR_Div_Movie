/** Split "720p Web-DL x265" → resolution + release version for Persian labels. */
export function splitQuality(raw: string): {
  resolution: string;
  version: string;
} {
  const cleaned = raw.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(\d{3,4}p)\b\s*(.*)$/i);
  if (!match) {
    return { resolution: cleaned, version: '' };
  }
  return {
    resolution: match[1],
    version: match[2].trim(),
  };
}

function toFaDigits(value: string): string {
  return value.replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!);
}

/** e.g. "720p Web-DL" → "کیفیت ۷۲۰p منبع Web-DL" */
export function formatQualityLabel(raw: string): string {
  const { resolution, version } = splitQuality(raw);
  if (!resolution) return raw.trim();
  if (!version) return `کیفیت ${toFaDigits(resolution)}`;
  return `کیفیت ${toFaDigits(resolution)} منبع ${version}`;
}

const UNIT_FA: Record<string, string> = {
  KB: 'کیلوبایت',
  MB: 'مگابایت',
  GB: 'گیگابایت',
  TB: 'ترابایت',
};

type ParsedSize = {
  value: number;
  unit: keyof typeof UNIT_FA;
  decimals: number;
};

function formatFaAmount(value: number, decimals: number): string {
  const digits = Math.min(Math.max(decimals, 0), 2);
  return value.toLocaleString('fa-IR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function parseLatinSize(raw: string): ParsedSize | null {
  const match = raw
    .trim()
    .match(/^~?\s*([\d.]+)\s*(TB|GB|MB|KB)\b(?:\s*\/\s*ep)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toUpperCase() as keyof typeof UNIT_FA;
  const fraction = match[1].includes('.')
    ? (match[1].split('.')[1] ?? '').length
    : 0;
  return { value, unit, decimals: fraction };
}

function parsePersianSize(raw: string): ParsedSize | null {
  const match = raw
    .trim()
    .match(
      /^(?:هر اپیزود\s+)?(?:حدودا\s+)?([\d۰-۹.,٫]+)\s+(کیلوبایت|مگابایت|گیگابایت|ترابایت)$/,
    );
  if (!match) return null;
  const latin = match[1]
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/,/g, '');
  const value = Number(latin);
  if (!Number.isFinite(value)) return null;
  const unitFa = match[2];
  const unit =
    unitFa === 'ترابایت'
      ? 'TB'
      : unitFa === 'گیگابایت'
        ? 'GB'
        : unitFa === 'مگابایت'
          ? 'MB'
          : 'KB';
  const fraction = latin.includes('.') ? (latin.split('.')[1] ?? '').length : 0;
  return { value, unit, decimals: fraction };
}

function resolveSize(raw: string): ParsedSize | null {
  return parseLatinSize(raw) ?? parsePersianSize(raw);
}

/** Movie / single-file size: "2.71 GB" → "۲٫۷۱ گیگابایت" */
export function formatFileSizeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const parsed = resolveSize(trimmed);
  if (!parsed) return trimmed;
  const decimals =
    parsed.unit === 'MB' || parsed.unit === 'KB'
      ? Math.min(parsed.decimals, 2)
      : Math.max(parsed.decimals, parsed.value % 1 === 0 ? 0 : 2);
  return `${formatFaAmount(parsed.value, decimals)} ${UNIT_FA[parsed.unit]}`;
}

/** Series avg size: "~141 MB/ep" → "هر اپیزود حدودا ۱۴۱ مگابایت" */
export function formatAvgSizeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const already = trimmed.match(
    /^هر اپیزود حدودا\s+([\d۰-۹.,٫]+)\s+(مگابایت|گیگابایت|کیلوبایت|ترابایت)$/,
  );
  if (already) return trimmed;

  const faShort = trimmed.match(
    /^(?:حدودا\s+)?([\d۰-۹.,٫]+)\s+(مگابایت|گیگابایت|کیلوبایت|ترابایت)(?:\/قسمت)?$/,
  );
  if (faShort) {
    return `هر اپیزود حدودا ${faShort[1]} ${faShort[2]}`;
  }

  const parsed = parseLatinSize(trimmed);
  if (!parsed) return trimmed;

  const decimals =
    parsed.unit === 'MB' || parsed.unit === 'KB'
      ? 0
      : Math.min(Math.max(parsed.decimals, 2), 2);
  const amount =
    parsed.unit === 'MB' || parsed.unit === 'KB'
      ? formatFaAmount(Math.round(parsed.value), 0)
      : formatFaAmount(parsed.value, decimals);

  return `هر اپیزود حدودا ${amount} ${UNIT_FA[parsed.unit]}`;
}
