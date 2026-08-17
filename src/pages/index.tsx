import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { findInboxFolder } from '@/lib/utils/file';
import {
  decodeString,
  getMyselfName,
  loadChats,
  useCurrentMessage,
} from '@/lib/utils/message';
import { Chatroom } from '@/types';

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

// Hàm phụ trợ tạo màu sắc nhất quán cho từng tên người dùng (giống Messenger)
function getUserColor(name: string, isDark: boolean): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorsDark = [
    'text-blue-400',
    'text-emerald-400',
    'text-amber-400',
    'text-rose-400',
    'text-purple-400',
    'text-cyan-400',
    'text-pink-400',
  ];
  const colorsLight = [
    'text-blue-600',
    'text-emerald-600',
    'text-amber-600',
    'text-rose-600',
    'text-purple-600',
    'text-cyan-600',
    'text-pink-600',
  ];
  const palette = isDark ? colorsDark : colorsLight;
  return palette[Math.abs(hash) % palette.length];
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
      <span className='text-xs text-blue-400 underline block mt-1 break-all font-medium'>
        📷 [Photo: {uri}]
      </span>
    );
  }
  if (!imgUrl) {
    return (
      <span className='text-xs text-gray-400 italic block mt-1 animate-pulse'>
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
        className='max-w-xs max-h-80 rounded-2xl object-cover mt-1 shadow-sm cursor-pointer hover:opacity-95 transition-opacity'
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

// Component FsVideo tải và phát trực tiếp video từ thư mục cục bộ
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
      <span className='text-xs text-blue-400 underline block mt-1 break-all font-medium'>
        🎥 [Video: {uri}]
      </span>
    );
  }
  if (!videoUrl) {
    return (
      <span className='text-xs text-gray-400 italic block mt-1 animate-pulse'>
        🎥 Đang tải video...
      </span>
    );
  }
  return (
    <video
      controls
      className='max-h-80 w-full rounded-2xl object-contain bg-black mt-1 shadow-sm'
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
        isDark ? 'bg-[#242526] text-[#e4e6eb]' : 'bg-white text-black'
      }`}
    >
      <Head>
        <title>Messenger Archive Viewer</title>
      </Head>
      
      {/* Sidebar danh sách đoạn chat */}
      <aside
        className={`flex w-[360px] flex-col border-r ${
          isDark ? 'border-[#393a3b] bg-[#242526]' : 'border-gray-200 bg-white'
        }`}
      >
        <div className='flex items-center justify-between px-4 pt-4 pb-2'>
          <h1 className='text-2xl font-bold tracking-tight'>Đoạn chat</h1>
          <div className='flex gap-1'>
            <button
              onClick={handleOpenFolder}
              className={`p-2.5 rounded-full transition-colors ${
                isDark ? 'hover:bg-[#3a3b3c] text-gray-200' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title='Chọn thư mục dữ liệu'
            >
              📁
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2.5 rounded-full transition-colors ${
                isDark ? 'hover:bg-[#3a3b3c] text-gray-200' : 'hover:bg-gray-100 text-gray-700'
              }`}
              title='Đổi giao diện'
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className='px-3 py-2'>
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-full ${
              isDark ? 'bg-[#3a3b3c]' : 'bg-[#f0f2f5]'
            }`}
          >
            <span className='text-gray-400 text-sm'>🔍</span>
            <input
              type='text'
              placeholder='Tìm kiếm trên Messenger'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full bg-transparent text-sm outline-none ${
                isDark ? 'text-white placeholder-gray-400' : 'text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
        </div>

        <div className='flex-1 overflow-y-auto px-2 space-y-0.5 mt-1'>
          {!directory && (
            <div className='p-6 text-center text-sm text-gray-400'>
              Nhấn vào biểu tượng thư mục 📁 ở góc trên để tải thư mục chứa tin nhắn Messenger của bạn.
            </div>
          )}
          {filteredChats.map((chat) => {
            const id = chat.id || chat.dirName;
            const isSelected = selectedChatId === id;
            return (
              <div
                key={id}
                onClick={() => setSelectedChatId(id)}
                className={`flex items-center gap-3 cursor-pointer rounded-xl p-2.5 transition-colors ${
                  isSelected
                    ? isDark ? 'bg-[#3a3b3c]' : 'bg-[#e4e6eb]'
                    : isDark ? 'hover:bg-[#3a3b3c]/60' : 'hover:bg-[#f2f2f2]'
                }`}
              >
                <div className='w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-inner'>
                  {(chat.title || chat.name || 'C').charAt(0).toUpperCase()}
                </div>
                <div className='flex-1 min-w-0'>
                  <p className='font-semibold truncate text-sm'>
                    {chat.title || chat.name}
                  </p>
                  <p className={`text-xs truncate mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {chat.dirName}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Khu vực khung chat chính */}
      <main className='flex flex-1 flex-col overflow-hidden'>
        {currentMessage ? (
          <div className='flex h-full w-full'>
            <div className={`flex flex-1 flex-col overflow-hidden ${isDark ? 'bg-[#242526]' : 'bg-white'}`}>
              
              {/* Header chat */}
              <div
                className={`flex items-center justify-between px-4 py-3 border-b shadow-xs z-10 ${
                  isDark ? 'border-[#393a3b] bg-[#242526]' : 'border-gray-200 bg-white'
                }`}
              >
                <div className='flex items-center gap-3'>
                  <div className='w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm'>
                    {(currentMessage.title || currentMessage.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className='text-sm font-bold leading-tight'>
                      {currentMessage.title || currentMessage.name}
                    </h2>
                    <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Lưu trữ tin nhắn
                    </p>
                  </div>
                </div>
              </div>

              {/* Danh sách tin nhắn */}
              <div
                className={`flex-1 overflow-y-auto p-4 space-y-1.5 ${
                  isDark ? 'bg-[#242526]' : 'bg-white'
                }`}
              >
                {currentMessage.messages.map((msg: any, idx: number, arr: any[]) => {
                  const sender = decodeString(msg.sender_name);
                  const isMe = myName ? sender === myName : false;
                  const decodedContent = decodeString(msg.content || '');
                  
                  const videoMatch = decodedContent.match(/\[Video:\s*([^\]]+)\]/);
                  const embeddedVideoUri = videoMatch ? videoMatch[1].trim() : null;

                  const hasContent = Boolean(msg.content) && !embeddedVideoUri;
                  const hasPhotos = msg.photos && msg.photos.length > 0;
                  const hasSticker = Boolean(msg.sticker);
                  const hasVideos = (msg.videos && msg.videos.length > 0) || embeddedVideoUri;
                  const hasShare = Boolean(msg.share?.link);

                  // Kiểm tra nhóm tin nhắn liên tiếp từ cùng một người
                  const prevMsg = idx > 0 ? arr[idx - 1] : null;
                  const prevSender = prevMsg ? decodeString(prevMsg.sender_name) : null;
                  const showSenderHeader = !isMe && sender !== prevSender;

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${
                        isMe ? 'items-end' : 'items-start'
                      } ${showSenderHeader ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {/* Tên người dùng hiển thị trực quan, nổi bật, có màu sắc riêng biệt giống Messenger */}
                      {showSenderHeader && (
                        <span className={`text-[12px] mb-1 ml-1 font-bold tracking-wide ${getUserColor(sender, isDark)}`}>
                          {sender}
                        </span>
                      )}

                      <div
                        className={`max-w-[65%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs ${
                          isMe
                            ? 'bg-[#0084ff] text-white rounded-tr-xs rounded-br-xs'
                            : isDark
                            ? 'bg-[#3e4042] text-[#e4e6eb] rounded-tl-xs rounded-bl-xs'
                            : 'bg-[#f0f2f5] text-black rounded-tl-xs rounded-bl-xs'
                        }`}
                      >
                        {/* Văn bản */}
                        {hasContent && (
                          <p className='whitespace-pre-wrap break-words'>
                            {decodedContent}
                          </p>
                        )}

                        {/* Hình ảnh */}
                        {hasPhotos && (
                          <div className='flex flex-col gap-1.5 my-1'>
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
                          <div className='italic text-xs py-1'>
                            <span>🎨 [Sticker]</span>
                          </div>
                        )}

                        {/* Video */}
                        {hasVideos && (
                          <div className='flex flex-col gap-1.5 my-1'>
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
                          <div>
                            <a
                              href={msg.share.link}
                              target='_blank'
                              rel='noreferrer'
                              className='underline text-blue-200 break-all text-xs'
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

              {/* Thanh nhập tin nhắn giả lập */}
              <div className={`p-3 border-t flex items-center gap-2 ${isDark ? 'border-[#393a3b] bg-[#242526]' : 'border-gray-200 bg-white'}`}>
                <div className={`flex-1 flex items-center rounded-full px-4 py-2 ${isDark ? 'bg-[#3a3b3c]' : 'bg-[#f0f2f5]'}`}>
                  <input
                    type='text'
                    disabled
                    placeholder='Aa (Chế độ xem lịch sử lưu trữ)'
                    className={`w-full bg-transparent text-sm outline-none cursor-not-allowed ${isDark ? 'text-gray-400 placeholder-gray-500' : 'text-gray-500 placeholder-gray-400'}`}
                  />
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className={`flex flex-1 items-center justify-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Chọn một đoạn chat bên trái để xem lịch sử tin nhắn
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
