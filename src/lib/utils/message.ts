import { Message } from '../../types';

export function decodeString(str: string | undefined): string {
  if (!str) return '';
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return str || '';
  }
}

export function useGroupedActorsByReaction(message: Message) {
  if (!message.reactions) return null;

  const grouped: Record<string, string[]> = {};
  for (const r of message.reactions) {
    if (!grouped[r.reaction]) {
      grouped[r.reaction] = [];
    }
    grouped[r.reaction].push(r.actor);
  }

  return grouped;
}
