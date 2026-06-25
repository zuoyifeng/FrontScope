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

export function createScanId(date = new Date(), pageName?: string): string {
  const timestamp = date.toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${slugify(pageName ?? 'scan')}`;
}
