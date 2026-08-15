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
import { Chatroom, Message } from '@/types';

// Hàm xử lý lấy FileHandle thông minh, tự cắt prefix trùng lặp
async function getFileHandleFromUri(
  rootDir: FileSystemDirectoryHandle,
  uri: string
): Promise<FileSystemFileHandle | null> {
  try {
    // Tách các thành phần trong đường dẫn
    let parts = uri.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return null;

    // Chuẩn hóa: Nếu rootDir đã là 'messages' hoặc 'inbox', cắt bỏ các phần tiền tố tương ứng
    const rootName = rootDir.name.toLowerCase();
    const firstMatchingIdx = parts.findIndex((p) => p.toLowerCase() === rootName);
    if (firstMatchingIdx !== -1) {
      parts = parts.slice(firstMatchingIdx + 1);
    } else {
      // Loại bỏ prefix thừa nếu rootDir nằm sâu bên trong
      if (parts[0] === 'your_facebook_activity') parts.shift();
      if (parts[0] === 'messages' && rootName !== 'your_facebook_activity') parts.shift();
    }

    let currentDir = rootDir;
    for (const part of parts) {
      try {
        currentDir = await currentDir.getDirectoryHandle(part);
      } catch {
        break; // Nếu không vào được thư mục con, chuyển qua dùng phương án dự phòng
      }
    }

    return await currentDir.getFileHandle(fileName);
  } catch {
    // Phương án dự phòng: Tìm trực tiếp theo tên file ở thư mục hiện tại
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

// Component hiển thị hình ảnh từ FileSystemDirectoryHandle
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

        if (!fileHandle) {
          throw new Error('File not found');
        }

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
      <span className='text-xs text-blue-400 underline block mt-1 break-all'>
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
    <img
      src={imgUrl}
      alt={alt}
      className='max-w-xs max-h-80 rounded-lg object-cover border border-gray-700 mt-1 shadow-md'
    />
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

  return (
    <div className={`flex h-screen w-screen overflow-hidden ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>
      <Head>
        <title>Messenger Archive Viewer</title>
      </Head>

      {/* Sidebar */}
      <aside className='flex w-80 flex-col border-r border-gray-700 bg-gray-800/50'>
        <div className='flex items-center justify-between p-4 border-b border-gray-700'>
          <h1 className='text-lg font-bold truncate'>
            {directory ? `${directory.name}'s history` : 'Messenger Viewer'}
          </h1>
          <div className='flex gap-2'>
            <button
              onClick={handleOpenFolder}
              className='p-1.5 hover:bg-gray-700 rounded-lg transition-colors'
              title='Chọn thư mục'
            >
              📁
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className='p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-sm'
              title='Đổi giao diện'
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div className='p-3'>
          <input
            type='text'
            placeholder='Tìm kiếm người dùng...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full px-3 py-2 text-sm bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400'
          />
        </div>

        <div className='flex-1 overflow-y-auto px-2 space-y-1'>
          {!directory && (
            <div className='p-4 text-center text-sm text-gray-400'>
              Vui lòng nhấn vào biểu tượng thư mục 📁 để tải dữ liệu Messenger.
            </div>
          )}

          {isLoadingChats && (
            <div className='p-4 text-center text-sm text-gray-400 animate-pulse'>
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
                className={`cursor-pointer rounded-lg p-3 transition-colors ${
                  isSelected ? 'bg-gray-700 font-medium' : 'hover:bg-gray-800/80'
                }`}
              >
                <p className='font-semibold truncate text-sm'>{chat.title || chat.name}</p>
                <p className='text-xs text-gray-400 truncate mt-0.5'>{chat.dirName}</p>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className='flex flex-1 flex-col overflow-hidden'>
        {currentMessage ? (
          <div className='flex h-full w-full'>
            <div className='flex flex-1 flex-col overflow-hidden border-r border-gray-700'>
              <div className='flex items-center justify-between border-b border-gray-700 p-4'>
                <div>
                  <h2 className='text-xl font-bold'>{currentMessage.title || currentMessage.name}</h2>
                  <p className='text-xs text-gray-400'>{currentMessage.messages.length} messages</p>
                </div>
              </div>

              {/* Message List */}
              <div className='flex-1 overflow-y-auto p-4 space-y-3'>
                {currentMessage.messages.map((msg: Message, idx: number) => {
                  const sender = decodeString(msg.sender_name);
                  const isMe = myName ? sender === myName : false;

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <span className='text-xs text-gray-400 mb-1'>{sender}</span>
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-800 text-gray-100 rounded-bl-none border border-gray-700'
                        }`}
                      >
                        {msg.content && <p className='whitespace-pre-wrap break-words'>{decodeString(msg.content)}</p>}
                        
                        {/* Render hình ảnh trực tiếp */}
                        {msg.photos && msg.photos.length > 0 && (
                          <div className='mt-2 flex flex-col gap-2'>
                            {msg.photos.map((p, pIdx) => (
                              <FsImage
                                key={pIdx}
                                rootDir={directory}
                                uri={p.uri}
                                alt={`photo-${pIdx}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <span className='text-[10px] text-gray-500 mt-1'>
                        {new Date(msg.timestamp_ms).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Info Panel */}
            <div className='w-80 overflow-y-auto p-4 space-y-4 border-l border-gray-700 bg-gray-800/30'>
              <div className='border border-gray-700 rounded-lg overflow-hidden'>
                <button
                  onClick={() => setIsMembersOpen(!isMembersOpen)}
                  className='w-full px-4 py-3 bg-gray-800 flex justify-between items-center text-sm font-semibold'
                >
                  <span>Thành viên</span>
                  <span>{isMembersOpen ? '▲' : '▼'}</span>
                </button>
                {isMembersOpen && (
                  <div className='p-4 space-y-2 text-sm bg-gray-900/50'>
                    {currentMessage.participants?.map((part) => (
                      <div key={part.name} className='flex items-center gap-2'>
                        <div
                          className='h-3 w-3 rounded-full'
                          style={{
                            backgroundColor: randomColor({
                              seed: part.name,
                              luminosity: theme,
                            }),
                          }}
                        />
                        <span className='truncate'>{part.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {chatStatistic && (
                <div className='border border-gray-700 rounded-lg overflow-hidden'>
                  <button
                    onClick={() => setIsStatsOpen(!isStatsOpen)}
                    className='w-full px-4 py-3 bg-gray-800 flex justify-between items-center text-sm font-semibold'
                  >
                    <span>Thống kê</span>
                    <span>{isStatsOpen ? '▲' : '▼'}</span>
                  </button>
                  {isStatsOpen && (
                    <div className='p-4 space-y-2 text-sm bg-gray-900/50'>
                      <div className='flex justify-between'>
                        <span className='text-gray-400'>Tổng số tin nhắn:</span>
                        <span>{chatStatistic.messageCount}</span>
                      </div>
                      {chatStatistic.createdAt > 0 && (
                        <div className='flex justify-between'>
                          <span className='text-gray-400'>Ngày bắt đầu:</span>
                          <span>{new Date(chatStatistic.createdAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className='mt-2 font-semibold text-gray-300 border-t border-gray-700 pt-2'>Top gửi tin:</div>
                      {Object.entries(chatStatistic.countInfo || {})
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, count]) => (
                          <div key={name} className='flex justify-between text-xs'>
                            <span className='truncate w-32'>{name}</span>
                            <span className='text-gray-400'>{count}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className='flex h-full items-center justify-center text-gray-500'>
            Please select chat to view
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
