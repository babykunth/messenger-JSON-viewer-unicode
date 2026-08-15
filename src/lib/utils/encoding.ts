export function fixVietnameseEncoding(str: string): string {
  if (!str) return str;
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return str;
  }
}

export function fixObjectEncoding<T>(obj: T): T {
  if (typeof obj === 'string') {
    return fixVietnameseEncoding(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => fixObjectEncoding(item)) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      newObj[key] = fixObjectEncoding((obj as Record<string, unknown>)[key]);
    }
    return newObj as T;
  }
  return obj;
}
