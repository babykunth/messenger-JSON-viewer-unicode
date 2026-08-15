import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import randomColor from 'randomcolor';

import { findInboxFolder } from '@/lib/utils/file';
import {
  decodeString,
  getMyselfName,
  loadChats,
  useChatStatistics,
  useCurrentMessage,
} from '@/lib/utils/message';
import { Chatroom } from '@/types';

// Hàm quét đệ quy tìm file (ảnh hoặc video) trong thư mục được chọn
async function getFileHandleFromUri(
  rootDir: FileSystemDirectoryHandle,
  uri: string
): Promise<FileSystemFileHandle | null> {
  try {
    const fileName = uri.split('/').pop();
    if (!fileName) return null;

    async function findFileRecursively(
      dirHandle: FileSystemDirectoryHandle
    ): Promise<FileSystemFileHandle | null> {
      for await (const entry of (dirHandle as any).values()) {
        if (entry.kind === 'file' && entry.name === fileName) {
          return entry as FileSystemFileHandle;
        }
        if (entry.kind === 'directory') {
          const found = await findFileRecursively(entry as FileSystemDirectoryHandle);
          if (found) return found;
        }
      }
      return null;
    }

    return await findFileRecursively(rootDir);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Lỗi khi quét file:', err);
    return null;
  }
}

// Component hiển thị hình ảnh
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
      } catch {
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
      <span className='text-xs text-red-500 dark:text-red-400 block mt-1 break-all font-medium'>
        📷 [Không tìm thấy ảnh: {uri}]
      </span>
    );
  }

  if (!imgUrl) {
    return (
      <span className='text-xs text-gray-400 dark:text-gray-500 italic block mt-1 animate-pulse'>
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
              className='absolute -top-10 right-0 text-white text-2xl font-bold bg-gray-800/80 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center'
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

// Component FsVideo - Phát video trực tiếp
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
        const videoBlob = new Blob([await file.arrayBuffer()], { type: 'video/mp4' });

        if (isMounted) {
          objectUrl = URL.createObjectURL(videoBlob);
          setVideoUrl(objectUrl);
          setError(false);
        }
      } catch {
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
      <div className='mt-1 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 break-all'>
        🎥 Không tìm thấy file video: <br />
        <span className='font-mono opacity-80'>{uri}</span>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <span className='text-xs text-gray-400 dark:text-gray-500 italic block mt-1 animate-pulse'>
        🎥 Đang tải video...
      </span>
    );
  }

  return (
    <div className='mt-2 overflow-hidden rounded-xl border border-gray-300 dark:border-gray-700 shadow-md max-w-xs bg-black'>
      <video
        src={videoUrl}
        controls
        preload='metadata'
        className='w-full max-h-80 object-contain'
      />
    </div>
  );
};

const Home: NextPage = () => {
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [inboxDir, setInboxDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const handleOpenFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (handle) {
        setDirectory(handle);
        const inbox = await findInboxFolder(handle);
        setInboxDir(inbox);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Lỗi khi chọn thư mục:', err);
    }
  };

  const { data: chats, isValidating: isLoadingChats } = useSWR<Chatroom[]>(
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
  const chatStatistic = useChatStatistics(currentMessage);

  const isDark = theme === 'dark';

  return (
    <div className={`flex h-screen w-screen overflow-hidden font-sans ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      <Head>
        <title>Messenger Archive Viewer</title>
      </Head>

      {/* Sidebar */}
      <aside className={`flex w-80 flex-col border-r ${isDark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'}`}>
        <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <h1 className='text-base font-bold truncate'>
            {directory ? `${directory.name}'s history` : 'Messenger Viewer'}
          </h1>
          <div className='flex gap-1.5'>
            <button
              onClick={handleOpenFolder}
              className={`p-2 rounded-lg transition-colors text-base ${isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}`}
              title='Chọn thư mục'
            >
              📁
            </button>
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-lg transition-colors text-base ${isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}`}
              title='Đổi giao diện'
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className='p-3'>
          <input
            type='text'
            placeholder='Tìm kiếm người dùng...'
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
            <div className={`p-4 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Vui lòng nhấn vào biểu tượng thư mục 📁 để tải dữ liệu Messenger.
            </div>
          )}

          {isLoadingChats && (
            <div className={`p-4 text-center text-sm animate-pulse ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Đang tải danh sách cuộc trò chuyện...
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
                <p className='font-semibold truncate text-sm'>{chat.title || chat.name}</p>
                <p className={`text-xs truncate mt-0.5 ${isSelected ? 'text-blue-100' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {chat.dirName}
                </p>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className='flex flex-1 flex-col overflow-hidden'>
        {currentMessage ? (
          <div className='flex h-full w-full'>
            <div className={`flex flex-1 flex-col overflow-hidden border-r ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className={`flex items-center justify-between border-b p-4 shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <div>
                  <h2 className='text-lg font-bold'>{currentMessage.title || currentMessage.name}</h2>
                  <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{currentMessage.messages.length} tin nhắn</p>
                </div>
              </div>

              <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
                {currentMessage.messages.map((msg: any, idx: number) => {
                  const sender = decodeString(msg.sender_name);
                  const isMe = myName ? sender === myName : false;
                  const hasContent = Boolean(msg.content);
                  const hasPhotos = msg.photos && msg.photos.length > 0;
                  const hasSticker = Boolean(msg.sticker);
                  const hasVideos = msg.videos && msg.videos.length > 0;
                  const hasShare = Boolean(msg.share?.link);

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <span className={`text-xs mb-1 font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{sender}</span>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : isDark
                            ? 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                            : 'bg-white text-gray-900 rounded-bl-none border border-gray-200'
                        }`}
                      >
                        {hasContent && (
                          <p className='whitespace-pre-wrap break-words'>
                            {decodeString(msg.content)}
                          </p>
                        )}

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

                        {/* HIỂN THỊ TRÌNH PHÁT VIDEO */}
                        {hasVideos && (
                          <div className='mt-2 flex flex-col gap-2'>
                            {msg.videos.map((v: any, vIdx: number) => (
                              <FsVideo
                                key={vIdx}
                                rootDir={directory}
                                uri={v.uri}
                              />
                            ))}
                          </div>
                        )}

                        {hasSticker && (
                          <div className={`mt-1 italic text-xs flex items-center gap-1 ${isMe ? 'text-yellow-200' : isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                            <span>🎨 [Sticker: {msg.sticker.uri}]</span>
                          </div>
                        )}

                        {hasShare && (
                          <a
                            href={msg.share.link}
                            target='_blank'
                            rel='noreferrer'
                            className={`mt-1 block text-xs underline break-all font-medium ${isMe ? 'text-blue-100' : isDark ? 'text-blue-400' : 'text-blue-600'}`}
                          >
                            🔗 {msg.share.link}
                          </a>
                        )}

                        {!hasContent && !hasPhotos && !hasSticker && !hasVideos && !hasShare && (
                          <span className={`italic text-xs ${isMe ? 'text-blue-100' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            [Tin nhắn hệ thống]
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] mt-1 font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {new Date(msg.timestamp_ms).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Info Panel */}
            <div className={`w-80 overflow-y-auto p-4 space-y-4 border-l ${isDark ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-white'}`}>
              <div className={`border rounded-xl overflow-hidden shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                <button
                  onClick={() => setIsMembersOpen(!isMembersOpen)}
                  className={`w-full px-4 py-3 flex justify-between items-center text-sm font-semibold transition-colors ${
                    isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                  }`}
                >
                  <span>Thành viên</span>
                  <span className='text-xs'>{isMembersOpen ? '▲' : '▼'}</span>
                </button>
                {isMembersOpen && (
                  <div className={`p-4 space-y-2.5 text-sm border-t ${isDark ? 'border-gray-800 bg-gray-900 text-gray-300' : 'border-gray-200 bg-white text-gray-700'}`}>
                    {currentMessage.participants?.map((part: any) => (
                      <div key={part.name} className='flex items-center gap-2.5'>
                        <div
                          className='h-3 w-3 rounded-full flex-shrink-0'
                          style={{
                            backgroundColor: randomColor({
                              seed: part.name,
                              luminosity: theme,
                            }),
                          }}
                        />
                        <span className='truncate font-medium'>{part.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {chatStatistic && (
                <div className={`border rounded-xl overflow-hidden shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                  <button
                    onClick={() => setIsStatsOpen(!isStatsOpen)}
                    className={`w-full px-4 py-3 flex justify-between items-center text-sm font-semibold transition-colors ${
                      isDark ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    <span>Thống kê</span>
                    <span className='text-xs'>{isStatsOpen ? '▲' : '▼'}</span>
                  </button>
                  {isStatsOpen && (
                    <div className={`p-4 space-y-2.5 text-sm border-t ${isDark ? 'border-gray-800 bg-gray-900 text-gray-300' : 'border-gray-200 bg-white text-gray-700'}`}>
                      <div className='flex justify-between items-center'>
                        <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Tổng số tin nhắn:</span>
                        <span className='font-semibold'>{chatStatistic.messageCount}</span>
                      </div>
                      {chatStatistic.createdAt > 0 && (
                        <div className='flex justify-between items-center'>
                          <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Ngày bắt đầu:</span>
                          <span className='font-semibold'>{new Date(chatStatistic.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className={`mt-3 font-semibold border-t pt-2.5 ${isDark ? 'text-gray-200 border-gray-800' : 'text-gray-900 border-gray-200'}`}>
                        Top gửi tin:
                      </div>
                      {Object.entries(chatStatistic.countInfo || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([name, count]) => (
                          <div key={name} className='flex justify-between items-center text-xs'>
                            <span className='truncate w-32 font-medium'>{name}</span>
                            <span className={`font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{count as number}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={`flex h-full items-center justify-center text-sm font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Please select chat to view
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
