import { Chatroom, Message } from '../types';
import { fixObjectEncoding } from './encoding';

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
          name: fixObjectEncoding(chatroomName),
          messages,
        });
      }
    }
  }

  return chatrooms;
}
