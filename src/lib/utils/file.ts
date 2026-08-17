import { Chatroom, Message, Participant } from '@/types';

export function decodeFBString(str: string | undefined): string {
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

export async function findInboxFolder(
  dirHandle: FileSystemDirectoryHandle | null
): Promise<FileSystemDirectoryHandle | null> {
  if (!dirHandle) return null;
  return dirHandle;
}

export async function getFileHandleRecursively(
  dirHandle: FileSystemDirectoryHandle | null,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  if (!dirHandle) return null;
  const parts = relativePath.split('/').filter(Boolean);
  let currentDir: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    try {
      if (currentDir.kind === 'directory') {
        currentDir = await currentDir.getDirectoryHandle(parts[i]);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  try {
    if (currentDir.kind === 'directory') {
      return await currentDir.getFileHandle(parts[parts.length - 1]);
    }
  } catch {
    return null;
  }
  return null;
}

export async function readJsonFile<T>(fileHandle: FileSystemFileHandle): Promise<T> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text) as T;
}

export async function getChatrooms(
  dirHandle: FileSystemDirectoryHandle | null
): Promise<Chatroom[]> {
  if (!dirHandle) return [];
  const chatrooms: Chatroom[] = [];

  // Helper để xử lý việc đọc nội dung một file json chat
  async function processJsonFile(fileEntry: FileSystemFileHandle, fallbackName: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await readJsonFile<any>(fileEntry);
      const messages: Message[] = [];
      const participantSet = new Set<string>();
      let chatroomName = fallbackName;

      if (data.title) {
        chatroomName = decodeFBString(data.title);
      }
      if (data.participants && Array.isArray(data.participants)) {
        for (const p of data.participants) {
          if (p.name) {
            participantSet.add(decodeFBString(p.name));
          }
        }
      }
      if (data.messages && Array.isArray(data.messages)) {
        messages.push(...data.messages);
      }

      if (messages.length > 0) {
        messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        const lastTimestamp = messages[messages.length - 1]?.timestamp_ms || 0;

        if (participantSet.size === 0) {
          for (const msg of messages) {
            if (msg.sender_name) {
              participantSet.add(decodeFBString(msg.sender_name));
            }
          }
        }

        const participants: Participant[] = Array.from(participantSet).map((name) => ({
          name,
        }));

        chatrooms.push({
          id: fallbackName,
          name: chatroomName,
          title: chatroomName,
          dirName: fallbackName,
          lastSent: lastTimestamp,
          participants,
          messages,
        });
      }
    } catch (e) {
      console.error(`Lỗi đọc file ${fileEntry.name}:`, e);
    }
  }

  // Quét toàn bộ cấp độ trong thư mục được chọn
  for await (const entry of dirHandle.values()) {
    if (entry.name === 'media' || entry.name === 'files' || entry.name === 'audio') {
      continue;
    }

    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
      // Trường hợp các file .json nằm ngay ở cấp gốc (H:/messages/*.json)
      await processJsonFile(entry as FileSystemFileHandle, entry.name.replace('.json', ''));
    } else if (entry.kind === 'directory') {
      // Trường hợp các thư mục chứa chat (H:/messages/chat_name/)
      try {
        const subDir = await dirHandle.getDirectoryHandle(entry.name);
        for await (const subEntry of subDir.values()) {
          if (subEntry.kind === 'file' && subEntry.name.endsWith('.json')) {
            await processJsonFile(subEntry as FileSystemFileHandle, entry.name);
          }
        }
      } catch (err) {
        console.error(`Không thể mở thư mục con ${entry.name}:`, err);
      }
    }
  }

  return chatrooms;
}
