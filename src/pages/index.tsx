import type { NextPage } from 'next';
import Head from 'next/head';
import { useMemo, useState } from 'react';
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
      // @ts-expect-error - File System Access API
      const handle = await window.showDirectoryPicker();
      if (handle) {
        setDirectory(handle);
        const inbox = await findInboxFolder(handle);
        setInboxDir(inbox);
      }
    } catch (err) {
      // ESLint ignore cho console error
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

      {/* Cột bên trái: Sidebar */}
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

        {/* Thanh tìm kiếm */}
        <div className='p-3'>
          <input
            type='text'
            placeholder='Tìm kiếm người dùng...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full px-3 py-2 text-sm bg-gray-700 text-white rounded-lg outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400'
          />
        </div>

        {/* Danh sách cuộc trò chuyện */}
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

      {/* Cột bên phải: Màn hình tin nhắn */}
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

              {/* Khung tin nhắn */}
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
                        {msg.photos && (
                          <div className='mt-2 flex flex-wrap gap-1'>
                            {msg.photos.map((p, pIdx) => (
                              <span key={pIdx} className='text-xs text-blue-400 underline block'>
                                📷 [Photo: {p.uri}]
                              </span>
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

            {/* Panel thông tin bên phải */}
            <div className='w-80 overflow-y-auto p-4 space-y-4 border-l border-gray-700 bg-gray-800/30'>
              {/* Collapsible Thành viên */}
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

              {/* Collapsible Thống kê */}
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
