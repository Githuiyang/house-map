export function toStableSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[·•]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
