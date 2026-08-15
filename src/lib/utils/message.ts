import useSWR from 'swr';
import { Chatroom, Message } from '@/types';
import { getChatrooms } from './file';

// Giải mã chuỗi mã hóa Latin-1/Mojibake từ Facebook về UTF-8
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

// Lấy tên bản thân dựa trên tần suất gửi tin nhắn
export function getMyselfName(messages: Message[]): string | null {
  if (!messages || messages.length === 0) return null;

  const nameCounts: Record<string, number> = {};
  for (const msg of messages) {
    if (msg.sender_name) {
      const name = decodeString(msg.sender_name);
      nameCounts[name] = (nameCounts[name] || 0) + 1;
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

// Tải danh sách chatroom từ thư mục inbox
export async function loadChats(inboxHandle: FileSystemDirectoryHandle): Promise<Chatroom[]> {
  return await getChatrooms(inboxHandle);
}

// Hook nhóm thả cảm xúc theo loại
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

// Hook gom nhóm các tin nhắn liên tiếp của cùng 1 người
export function useGroupedMessages(messages: Message[]) {
  const grouped: Message[][] = [];
  let currentGroup: Message[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = messages[i - 1];

    if (!prevMsg || prevMsg.sender_name === msg.sender_name) {
      currentGroup.push(msg);
    } else {
      grouped.push(currentGroup);
      currentGroup = [msg];
    }
  }

  if (currentGroup.length > 0) {
    grouped.push(currentGroup);
  }

  return grouped;
}

// Hook tính toán thống kê cuộc trò chuyện
export function useChatStatistics(chat: Chatroom | null) {
  const { data } = useSWR(chat ? `stats/${chat.id}` : null, () => {
    if (!chat) return null;

    const messageCount = chat.messages.length;
    const participants = new Set<string>();
    let firstTimestamp = chat.messages[0]?.timestamp_ms;
    let lastTimestamp = chat.messages[chat.messages.length - 1]?.timestamp_ms;

    for (const msg of chat.messages) {
      if (msg.sender_name) {
        participants.add(decodeString(msg.sender_name));
      }
    }

    return {
      messageCount,
      participantCount: participants.size,
      participants: Array.from(participants),
      firstTimestamp,
      lastTimestamp,
    };
  });

  return data;
}

// Hook lấy tin nhắn hiện tại
export function useCurrentMessage(chat: Chatroom | null, index: number) {
  if (!chat || !chat.messages[index]) return null;
  return chat.messages[index];
}
