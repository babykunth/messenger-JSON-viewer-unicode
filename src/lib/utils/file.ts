import { Chatroom, Message, Participant } from '@/types';

// Hàm giải mã chuyên dụng xử lý triệt để lỗi font tiếng Việt (Mojibake) từ Facebook JSON
export function decodeFBString(str: string | undefined): string {
  if (!str) return '';
  try {
    let normalized = str;
    // Chuyển đổi chuỗi Latin-1 thô thành mảng byte chuẩn của Facebook
    const bytes = new Uint8Array(normalized.length);
    for (let i = 0; i < normalized.length; i++) {
      bytes[i] = normalized.charCodeAt(i) & 0xff;
    }
    const decodedUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    
    // Nếu chuỗi chứa các ký tự mã hóa đặc biệt, tiến hành xử lý qua decodeURIComponent
    try {
      return decodeURIComponent(escape(decodedUtf8));
    } catch {
      return decodedUtf8;
    }
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
  if (!dirHandle || !relativePath) return null;
  
  const cleanPath = relativePath.replace(/^messages\/|^\/|^\.\//g, '');
  const parts = cleanPath.split('/').filter(Boolean);
  let currentDir: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    try {
      if (currentDir.kind === 'directory') {
        currentDir = await currentDir.getDirectoryHandle(part);
      } else {
        return null;
      }
    } catch {
      try {
        currentDir = await dirHandle.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }
  }

  try {
    if (currentDir.kind === 'directory') {
      return await currentDir.getFileHandle(parts[parts.length - 1]);
    }
  } catch {
    try {
      const fileName = parts[parts.length - 1];
      return await dirHandle.getFileHandle(fileName);
    } catch {
      return null;
    }
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

  async function processJsonFile(fileEntry: FileSystemFileHandle, fallbackName: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await readJsonFile<any>(fileEntry);
      const messages: Message[] = [];
      const participantSet = new Set<string>();
      let chatroomName = decodeFBString(fallbackName);

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

      const rawMessages = data.messages || data.msg || data.list || (Array.isArray(data) ? data : []);
      if (Array.isArray(rawMessages)) {
        for (const msg of rawMessages) {
          messages.push({
            sender_name: decodeFBString(msg.sender_name || msg.sender || ''),
            timestamp_ms: Number(msg.timestamp_ms || msg.timestamp || Date.now()),
            content: decodeFBString(msg.content || msg.text || ''),
            photos: msg.photos || [],
            audio_files: msg.audio_files || [],
            files: msg.files || [],
            reactions: msg.reactions || [],
            type: msg.type || 'Generic',
          } as Message);
        }
      }

      if (messages.length > 0) {
        messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        const lastTimestamp = messages[messages.length - 1]?.timestamp_ms || 0;

        if (participantSet.size === 0) {
          for (const msg of messages) {
            if (msg.sender_name) {
              participantSet.add(msg.sender_name);
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

  for await (const entry of dirHandle.values()) {
    if (['files', 'audio'].includes(entry.name)) {
      continue;
    }

    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
      const cleanName = entry.name.replace('.json', '').replace(/_\d+$/, '');
      await processJsonFile(entry as FileSystemFileHandle, cleanName);
    } else if (entry.kind === 'directory') {
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
