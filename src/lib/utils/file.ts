export async function getFileHandleRecursively(
  dirHandle: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle | null> {
  const parts = path.split('/').filter(Boolean);
  let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (currentHandle.kind === 'directory') {
      try {
        if (i === parts.length - 1) {
          const fileHandle = await currentHandle.getFileHandle(part);
          return fileHandle;
        } else {
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }
  return null;
}

export async function findInboxFolder(
  directoryHandle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  // 1. Kiểm tra trực tiếp tại thư mục gốc được chọn (H:/messages/)
  try {
    for await (const [name, handle] of directoryHandle.entries()) {
      if (name === 'inbox' && handle.kind === 'directory') {
        return handle as FileSystemDirectoryHandle;
      }
    }

    let hasChatData = false;
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'directory' || name.endsWith('.json')) {
        hasChatData = true;
        break;
      }
    }

    if (hasChatData) {
      return directoryHandle;
    }
  } catch (err) {
    console.error(err);
  }

  // 2. Dự phòng: Duyệt sâu vào các thư mục con bên trong (phục vụ cấu trúc your_facebook_activity)
  try {
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'directory') {
        const subDir = handle as FileSystemDirectoryHandle;
        const result = await findInboxFolder(subDir);
        if (result) {
          return result;
        }
      }
    }
  } catch (err) {
    console.error(err);
  }

  return null;
}
