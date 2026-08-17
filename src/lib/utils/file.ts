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
  if (dirHandle.name === 'inbox') {
    return dirHandle;
  }

  // 1. Kiểm tra nhanh xem thư mục hiện tại có phải là dạng chứa các thư mục chat trực tiếp không (cấu trúc đơn giản H:/messages/)
  let hasChatSubdirs = false;
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      if (entry.name === 'inbox') {
        return entry; // Tìm thấy inbox theo chuẩn Facebook cũ
      }
      if (entry.name === 'messages') {
        try {
          const inbox = await entry.getDirectoryHandle('inbox');
          return inbox;
        } catch {
          // Bỏ qua nếu không thấy
        }
      }
      // Kiểm tra nếu thư mục con này có chứa file .json bên trong (đặc trưng của thư mục chat)
      try {
        const subDir = await dirHandle.getDirectoryHandle(entry.name);
        for await (const subEntry of subDir.values()) {
          if (subEntry.kind === 'file' && subEntry.name.endsWith('.json')) {
            hasChatSubdirs = true;
            break;
          }
        }
      } catch {
        // Bỏ qua lỗi truy cập
      }
    }
  }

  // Nếu thư mục hiện tại chứa các thư mục chat trực tiếp, trả về chính nó (hỗ trợ H:/messages/)
  if (hasChatSubdirs) {
    return dirHandle;
  }

  // 2. Dự phòng: Duyệt sâu vào các thư mục con khác
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory' && entry.name !== 'inbox' && entry.name !== 'messages') {
      const found = await findInboxFolder(entry);
      if (found) return found;
    }
  }

  return null;
}

export async function getFileHandleRecursively(
  dirHandle: FileSystemDirectoryHandle | null,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  if (!dirHandle) return null;
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
  dirHandle: FileSystemDirectoryHandle | null
): Promise<Chatroom[]> {
  if (!dirHandle) return [];
  const chatrooms: Chatroom[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const messages: Message[] = [];
      const participantSet = new Set<string>();
      let chatroomName = entry.name;

      for await (const fileEntry of entry.values()) {
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

        // Nếu file JSON không có field participants, tự lấy danh sách người gửi
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
    }
  }

  return chatrooms;
}
