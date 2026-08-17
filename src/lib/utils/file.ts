import { Chatroom, Message, Participant } from '@/types';

// Hàm giải mã chuẩn xác chuỗi tiếng Việt bị lỗi mã hóa (Mojibake) từ Facebook
export function decodeFBString(str: string | undefined): string {
  if (!str) return '';
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }
    // Sử dụng TextDecoder với chuẩn utf-8 và ép buộc xử lý lỗi thay thế
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // Nếu vẫn còn lỗi mã hóa Latin-1 thô, thực hiện decode an toàn qua escape/decodeURIComponent
    try {
      return decodeURIComponent(escape(decoded));
    } catch {
      return decoded;
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

// Cải tiến hàm tìm kiếm file để hỗ trợ tuyệt đối thư mục media nằm ở cấp gốc hoặc trong thư mục chat
export async function getFileHandleRecursively(
  dirHandle: FileSystemDirectoryHandle | null,
  relativePath: string
): Promise<FileSystemFileHandle | null> {
  if (!dirHandle || !relativePath) return null;
  
  // Chuẩn hóa đường dẫn, loại bỏ các tiền tố thư mục rác
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
      // Nếu không tìm thấy theo phân cấp, thử tìm trực tiếp từ thư mục gốc
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
    // Thử tìm vét cạn trực tiếp từ thư mục gốc nếu đường dẫn sâu bị lệch
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
        // Sắp xếp tin nhắn theo thứ tự thời gian tăng dần để các tính năng thống kê hoạt động đúng
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
    // Bỏ qua các tệp không chứa đoạn chat
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
