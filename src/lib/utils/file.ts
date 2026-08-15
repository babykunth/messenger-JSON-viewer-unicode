import { Chatroom, Message } from '../types';

function decodeFBString(str: string): string {
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

function fixObjectEncoding<T>(obj: T): T {
  if (typeof obj === 'string') {
    return decodeFBString(obj) as unknown as T;
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

export async function readJsonFile<T>(fileHandle: FileSystemFileHandle): Promise<T> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  const data = JSON.parse(text);
  return fixObjectEncoding<T>(data);
}

export async function getChatrooms(
  dirHandle: FileSystemDirectoryHandle
): Promise<Chatroom[]> {
  const chatrooms: Chatroom[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const messages: Message[] = [];
      let chatroomName = entry.name;

      for await (const fileEntry of entry.values()) {
        if (fileEntry.kind === 'file' && fileEntry.name.endsWith('.json')) {
          try {
            const data = await readJsonFile<any>(fileEntry);
            if (data.title) {
              chatroomName = data.title;
            }
            if (data.messages && Array.isArray(data.messages)) {
              messages.push(...data.messages);
            }
          } catch (e) {
            console.error(`Lỗi đọc file ${fileEntry.name}:`, e);
          }
        }
      }

      if (messages.length > 0) {
        messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        chatrooms.push({
          id: entry.name,
          name: chatroomName,
          messages,
        });
      }
    }
  }

  return chatrooms;
}
