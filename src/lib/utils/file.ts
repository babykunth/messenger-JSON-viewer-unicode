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

  // Kiểm tra xem thư mục hiện tại có chứa thư mục 'inbox' hoặc các thư mục chat trực tiếp không
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      if (entry.name === 'inbox') {
        return entry;
      }
      if (entry.name === 'messages') {
        try {
          const inbox = await entry.getDirectoryHandle('inbox');
          return inbox;
        } catch {
          // Bỏ qua
        }
      }
    }
  }

  // Nếu chọn thẳng thư mục 'messages' (chứa các thư mục chat ở ngay cấp gốc)
  return dirHandle;
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

  // Xác định xem thư mục truyền vào là 'inbox' hay là thư mục 'messages' trực tiếp
  let targetDir = dirHandle;
  try {
    const inboxCheck = await dirHandle.getDirectoryHandle('inbox');
    if (inboxCheck) {
      targetDir = inboxCheck;
    }
  } catch {
    // Không có thư mục con inbox, giữ nguyên targetDir là chính nó (phục vụ H:/messages/)
  }

  for await (const entry of targetDir.values()) {
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
