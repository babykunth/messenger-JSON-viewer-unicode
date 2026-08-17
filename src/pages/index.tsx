import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { findInboxFolder } from '@/lib/utils/file';
import {
  decodeString,
  getMyselfName,
  loadChats,
  useChatStatistics,
  useCurrentMessage,
} from '@/lib/utils/message';
import { Chatroom, Message } from '@/types';

// Hàm lấy FileHandle thông minh từ URI tương đối của Messenger
async function getFileHandleFromUri(
  rootDir: FileSystemDirectoryHandle,
  uri: string
): Promise<FileSystemFileHandle | null> {
  try {
    let parts = uri.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return null;
    const rootName = rootDir.name.toLowerCase();
    const firstMatchingIdx = parts.findIndex(
      (p) => p.toLowerCase() === rootName
    );
    if (firstMatchingIdx !== -1) {
      parts = parts.slice(firstMatchingIdx + 1);
    } else {
      if (parts[0] === 'your_facebook_activity') parts.shift();
      if (parts[0] === 'messages' && rootName !== 'your_facebook_activity')
        parts.shift();
    }
    let currentDir = rootDir;
    for (const part of parts) {
      try {
        currentDir = await currentDir.getDirectoryHandle(part);
      } catch {
        break;
      }
    }
    return await currentDir.getFileHandle(fileName);
  } catch {
    try {
      const fileName = uri.split('/').pop();
      if (fileName) {
        return await rootDir.getFileHandle(fileName);
      }
    } catch {
      return null;
    }
  }
  return null;
}

// Component FsImage hiển thị ảnh cục bộ
const FsImage = ({
  rootDir,
  uri,
  alt,
}: {
  rootDir: FileSystemDirectoryHandle | null;
  uri: string;
  alt: string;
}) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    async function loadImage() {
      if (!rootDir || !uri) {
        setError(true);
        return;
      }
      try {
        const fileHandle = await getFileHandleFromUri(rootDir, uri);
        if (!fileHandle) throw new Error('File not found');
        const file = await fileHandle.getFile();
        if (isMounted) {
          objectUrl = URL.createObjectURL(file);
          setImgUrl(objectUrl);
          setError(false);
        }
      } catch (err) {
        if (isMounted) setError(true);
      }
    }
    loadImage();
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rootDir, uri]);

  if (error) {
    return (
      <span className='text-xs text-blue-600 dark:text-blue-400 underline block mt-1 break-all font-medium'>
        📷 [Photo: {uri}]
      </span>
    );
  }
  if (!imgUrl) {
    return (
      <span className='text-xs text-gray-500 dark:text-gray-400 italic block mt-1 animate-pulse'>
        📷 Đang tải ảnh...
      </span>
    );
  }
  return (
    <>
      <img
        src={imgUrl}
        alt={alt}
        onClick={() => setIsOpen(true)}
        className='max-w-xs max-h-80 rounded-lg object-cover border border-gray-300 dark:border-gray-700 mt-1 shadow-md cursor-pointer hover:opacity-90 transition-opacity'
      />
      {isOpen && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4'
          onClick={() => setIsOpen(false)}
        >
          <div className='relative max-w-full max-h-full flex items-center justify-center'>
            <button
              onClick={() => setIsOpen(false)}
              className='absolute -top-10 right-0 text-white text-2xl font-bold bg-gray-800/85 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center'
              title='Đóng'
            >
              ✕
            </button>
            <img
              src={imgUrl}
              alt={alt}
              className='max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl'
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};

// Component FsVideo mới dùng để tải và phát trực tiếp video từ thư mục cục bộ
const FsVideo = ({
  rootDir,
  uri,
}: {
  rootDir: FileSystemDirectoryHandle | null;
  uri: string;
}) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;
    async function loadVideo() {
      if (!rootDir || !uri) {
        setError(true);
        return;
      }
      try {
        const fileHandle = await getFileHandleFromUri(rootDir, uri);
        if (!fileHandle) throw new Error('Video not found');
        const file = await fileHandle.getFile();
        if (isMounted) {
          objectUrl = URL.createObjectURL(file);
          setVideoUrl(objectUrl);
          setError(false);
        }
      } catch (err) {
        if (isMounted) setError(true);
      }
    }
    loadVideo();
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rootDir, uri]);

  if (error) {
    return (
      <span className='text-xs text-blue-600 dark:text-blue-400 underline block mt-1 break-all font-medium'>
        🎥 [Video: {uri}]
      </span>
    );
  }
  if (!videoUrl) {
    return (
      <span className='text-xs text-gray-500 dark:text-gray-400 italic block mt-1 animate-pulse'>
        🎥 Đang tải video...
      </span>
    );
  }
  return (
    <video
      controls
      className='max-h-80 w-full rounded-lg object-contain bg-black mt-1 shadow-md'
      src={videoUrl}
    />
  );
};

const Home: NextPage = () => {
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(
    null
  );
  const [inboxDir, setInboxDir] = useState<FileSystemDirectoryHandle | null>(
    null
  );
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const handleOpenFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (handle) {
        setDirectory(handle);
        const inbox = await findInboxFolder(handle);
        setInboxDir(inbox);
      }
    } catch (err) {
      console.error('Lỗi khi chọn thư mục:', err);
    }
  };

  const { data: chats } = useSWR<Chatroom[]>(
    () => (inboxDir?.name ? ['chats', inboxDir.name] : null),
    () => loadChats(inboxDir)
  );

  const { data: myName = null } = useSWR(
    () => (directory ? ['myName', directory.name] : null),
    () => getMyselfName(directory)
  );

  const filteredChats = useMemo(() => {
    if (!chats) return [];
    const searchLower = search.toLowerCase();
    return chats
      .filter(
        (c) =>
          c.title?.toLowerCase().includes(searchLower) ||
          c.dirName?.toLowerCase().includes(searchLower) ||
          c.name?.toLowerCase().includes(searchLower)
      )
      .sort((a, b) => b.lastSent - a.lastSent);
  }, [chats, search]);

  const currentMessage = useCurrentMessage(chats || null, selectedChatId);
  const isDark = theme === 'dark';

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans ${
        isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'
      }`}
    >
      <Head>
        <title>Messenger Archive Viewer</title>
      </Head>
      
      {/* Sidebar bên trái */}
      <aside
        className={`flex w-80 flex-col border-r ${
          isDark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'
        }`}
      >
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <h1 className='text-base font-bold truncate'>
            {directory ? `${directory.name}'s history` : 'Messenger Viewer'}
          </h1>
          <div className='flex gap-1.5'>
            <button
              onClick={handleOpenFolder}
              className={`p-2 rounded-lg transition-colors text-base ${
                isDark
                  ? 'hover:bg-gray-800 text-gray-200'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
              title='Chọn thư mục'
            >
              📁
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-lg transition-colors text-base ${
                isDark
                  ? 'hover:bg-gray-800 text-gray-200'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
              title='Đổi giao diện'
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className='p-3'>
          <input
            type='text'
            placeholder='Tìm kiếm cuộc trò chuyện...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full px-3 py-2 text-sm rounded-lg outline-none transition-all ${
              isDark
                ? 'bg-gray-800 text-white placeholder-gray-400 border border-gray-700 focus:border-blue-500'
                : 'bg-gray-50 text-gray-900 placeholder-gray-500 border border-gray-300 focus:border-blue-500 focus:bg-white'
            }`}
          />
        </div>

        <div className='flex-1 overflow-y-auto px-2 space-y-1'>
          {!directory && (
            <div
              className={`p-4 text-center text-sm ${
                isDark ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Vui lòng nhấn vào biểu tượng thư mục 📁 để tải dữ liệu Messenger.
            </div>
          )}
          {filteredChats.map((chat) => {
            const id = chat.id || chat.dirName;
            const isSelected = selectedChatId === id;
            return (
              <div
                key={id}
                onClick={() => setSelectedChatId(id)}
                className={`cursor-pointer rounded-xl p-3 transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : isDark
                    ? 'hover:bg-gray-800/80 text-gray-200'
                    : 'hover:bg-gray-100 text-gray-800'
                }`}
              >
                <p className='font-semibold truncate text-sm'>
                  {chat.title || chat.name}
                </p>
                <p
                  className={`text-xs truncate mt-0.5 ${
                    isSelected
                      ? 'text-blue-100'
                      : isDark
                      ? 'text-gray-400'
                      : 'text-gray-500'
                  }`}
                >
                  {chat.dirName}
                </p>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Khu vực khung chat chính */}
      <main className='flex flex-1 flex-col overflow-hidden'>
        {currentMessage ? (
          <div className='flex h-full w-full'>
            <div
              className={`flex flex-1 flex-col overflow-hidden border-r ${
                isDark ? 'border-gray-800' : 'border-gray-200'
              }`}
            >
              <div
                className={`flex items-center justify-between border-b p-4 shadow-sm ${
                  isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
                }`}
              >
                <div>
                  <h2 className='text-lg font-bold'>
                    {currentMessage.title || currentMessage.name}
                  </h2>
                  <p
                    className={`text-xs font-medium ${
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {currentMessage.messages.length} tin nhắn
                  </p>
                </div>
              </div>

              {/* Danh sách tin nhắn */}
              <div
                className={`flex-1 overflow-y-auto p-4 space-y-4 ${
                  isDark ? 'bg-gray-900' : 'bg-gray-50'
                }`}
              >
                {currentMessage.messages.map((msg: any, idx: number) => {
                  const sender = decodeString(msg.sender_name);
                  const isMe = myName ? sender === myName : false;
                  const decodedContent = decodeString(msg.content || '');
                  
                  // Kiểm tra trích xuất đường dẫn video từ nội dung chuỗi (định dạng [Video: đường_dẫn])
                  const videoMatch = decodedContent.match(/\[Video:\s*([^\]]+)\]/);
                  const embeddedVideoUri = videoMatch ? videoMatch[1].trim() : null;

                  const hasContent = Boolean(msg.content) && !embeddedVideoUri;
                  const hasPhotos = msg.photos && msg.photos.length > 0;
                  const hasSticker = Boolean(msg.sticker);
                  const hasVideos = (msg.videos && msg.videos.length > 0) || embeddedVideoUri;
                  const hasShare = Boolean(msg.share?.link);

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${
                        isMe ? 'items-end' : 'items-start'
                      }`}
                    >
                      <span
                        className={`text-xs mb-1 font-medium ${
                          isDark ? 'text-gray-400' : 'text-gray-600'
                        }`}
                      >
                        {sender}
                      </span>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : isDark
                            ? 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                            : 'bg-white text-gray-900 rounded-bl-none border border-gray-200'
                        }`}
                      >
                        {/* Nội dung chữ bình thường */}
                        {hasContent && (
                          <p className='whitespace-pre-wrap break-words'>
                            {decodedContent}
                          </p>
                        )}

                        {/* Hình ảnh */}
                        {hasPhotos && (
                          <div className='mt-2 flex flex-col gap-2'>
                            {msg.photos.map((p: any, pIdx: number) => (
                              <FsImage
                                key={pIdx}
                                rootDir={directory}
                                uri={p.uri}
                                alt={`photo-${pIdx}`}
                              />
                            ))}
                          </div>
                        )}

                        {/* Sticker */}
                        {hasSticker && (
                          <div
                            className={`mt-1 italic text-xs flex items-center gap-1 ${
                              isMe
                                ? 'text-yellow-200'
                                : isDark
                                ? 'text-yellow-400'
                                : 'text-yellow-600'
                            }`}
                          >
                            <span>🎨 [Sticker: {msg.sticker.uri}]</span>
                          </div>
                        )}

                        {/* Video trực tiếp (Xử lý cả mảng msg.videos hoặc chuỗi embeddedVideoUri trong content) */}
                        {hasVideos && (
                          <div className='mt-2 flex flex-col gap-2'>
                            {msg.videos ? (
                              msg.videos.map((v: any, vIdx: number) => (
                                <FsVideo
                                  key={vIdx}
                                  rootDir={directory}
                                  uri={typeof v === 'string' ? v : v.uri}
                                />
                              ))
                            ) : embeddedVideoUri ? (
                              <FsVideo
                                rootDir={directory}
                                uri={embeddedVideoUri}
                              />
                            ) : null}
                          </div>
                        )}

                        {/* Share link */}
                        {hasShare && (
                          <div className='mt-1'>
                            <a
                              href={msg.share.link}
                              target='_blank'
                              rel='noreferrer'
                              className='underline text-blue-300 break-all'
                            >
                              {decodeString(
                                msg.share.share_text || msg.share.link
                              )}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className='flex flex-1 items-center justify-center text-sm text-gray-500'>
            Chọn một đoạn chat để xem lịch sử tin nhắn
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
