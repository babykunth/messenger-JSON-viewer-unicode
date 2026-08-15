import { Chatroom, Message } from '../types';

export function decodeFBString(str: string | undefined): string {
  if (!str) return '';
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

export async function getFileHandleRecursively(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split('/').filter(Boolean);
  let currentDir = dirHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    try {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }

  try {
    return await currentDir.getFileHandle(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

export async function readJsonFile<T>(fileHandle: FileSystemFileHandle): Promise<T> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text) as T;
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
              chatroomName = decodeFBString(data.title);
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
