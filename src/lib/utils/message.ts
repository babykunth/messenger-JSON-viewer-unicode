import { Message } from '@/types';

// Giải mã chuỗi bị lỗi mã hóa Unicode / Mojibake (Latin-1 sang UTF-8) từ Facebook
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

// Lấy tên bản thân từ lịch sử tin nhắn
export function getMyselfName(messages: Message[]): string | null {
  if (!messages || messages.length === 0) return null;
  
  const nameCounts: Record<string, number> = {};
  for (const msg of messages) {
    if (msg.sender_name) {
      const decodedName = decodeString(msg.sender_name);
      nameCounts[decodedName] = (nameCounts[decodedName] || 0) + 1;
    }
  }

  let mostFrequentName: string | null = null;
  let maxCount = 0;
  for (const [name, count] of Object.entries(nameCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequentName = name;
    }
  }

  return mostFrequentName;
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
