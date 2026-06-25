const pinyinMap: Record<string, string> = {
  首: 'shou',
  页: 'ye',
  体: 'ti',
  检: 'jian',
};

function toAsciiWords(value: string): string {
  return Array.from(value)
    .map((char) => (pinyinMap[char] ? ` ${pinyinMap[char]} ` : char))
    .join('');
}

function slugify(value: string): string {
  const slug = toAsciiWords(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'scan';
}

/** Filesystem-safe local timestamp: `YYYY-MM-DD_HH-mm-ss`. */
export function formatScanTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function createScanId(date = new Date(), pageName?: string): string {
  return `${formatScanTimestamp(date)}-${slugify(pageName ?? 'scan')}`;
}
