export async function findInboxFolder(
  directoryHandle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  // 1. Kiểm tra trực tiếp tại thư mục gốc được chọn (H:/messages/)
  // Nếu có thư mục con tên là 'inbox' (cấu trúc chuẩn Facebook)
  try {
    for await (const [name, handle] of directoryHandle.entries()) {
      if (name === 'inbox' && handle.kind === 'directory') {
        return handle as FileSystemDirectoryHandle;
      }
    }

    // Nếu không có thư mục 'inbox', kiểm tra xem thư mục hiện tại 
    // có chứa các file .json hoặc thư mục chat / media trực tiếp không (cấu trúc đơn giản H:/messages/)
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
