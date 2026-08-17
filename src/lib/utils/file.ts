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

  // Nếu bản thân thư mục này đã chứa các thư mục chat hoặc file json, hoặc có thư mục con là 'inbox'
  let hasValidContent = false;
  for await (const entry of dirHandle.values()) {
    if (entry.name === 'inbox' && entry.kind === 'directory') {
      return entry;
    }
    if (entry.kind === 'directory' || (entry.kind === 'file' && entry.name.endsWith('.json'))) {
      hasValidContent = true;
    }
  }

  if (hasValidContent) {
    return dirHandle;
  }

  // Nếu không, tiếp tục tìm sâu xuống các thư mục con bên trong (hỗ trợ your_facebook_activity)
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const found = await findInboxFolder(entry);
      if (found) return found;
    }
  }

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

export async function loadChats(
  dirHandle: FileSystemDirectoryHandle | null
): Promise<Chatroom[]> {
  if (!dirHandle) return [];
  const chatrooms: Chatroom[] = [];

  for await (const entry of dirHandle.values()) {
    // Bỏ qua các thư mục không liên quan như media hoặc file hệ thống
    if (entry.kind === 'directory' && entry.name !== 'media') {
      try {
        const subDir = await dirHandle.getDirectoryHandle(entry.name);
        const messages: Message[] = [];
        const participantSet = new Set<string>();
        let chatroomName = entry.name;

        for await (const fileEntry of subDir.values()) {
          if (fileEntry.kind === 'file' && fileEntry.name.endsWith('.json')) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const data = await readJsonFile<any>(fileEntry);
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
            } catch (e) {
              console.error(`Lỗi đọc file ${fileEntry.name}:`, e);
            }
          }
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
            id: entry.name,
            name: chatroomName,
            title: chatroomName,
            dirName: entry.name,
            lastSent: lastTimestamp,
            participants,
            messages,
          });
        }
      } catch (err) {
        console.error(`Không thể mở thư mục chat ${entry.name}:`, err);
      }
    }
  }

  return chatrooms;
}
