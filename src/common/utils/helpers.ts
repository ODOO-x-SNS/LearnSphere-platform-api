/**
 * Generate a slug from a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Build a cursor-based pagination response.
 */
export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number,
): { data: T[]; paging: { nextCursor: string | null; limit: number } } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id })).toString('base64') : null;
  return {
    data,
    paging: { nextCursor, limit },
  };
}

/**
 * Decode a cursor string.
 */
export function decodeCursor(cursor: string): { id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
