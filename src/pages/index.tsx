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

// Từ điển đa ngôn ngữ (Tiếng Việt & Tiếng Anh)
const translations = {
  vi: {
    chatsTitle: 'Đoạn chat',
    searchPlaceholder: 'Tìm kiếm trên Messenger',
    loadFolderPrompt: 'Nhấn vào biểu tượng thư mục 📁 ở góc trên để tải thư mục chứa tin nhắn Messenger của bạn.',
    archiveLabel: 'Lưu trữ tin nhắn',
    chatInfoTitle: 'Thông tin đoạn chat',
    mediaTab: 'Phương tiện',
    filesTab: 'File',
    linksTab: 'Liên kết',
    membersTab: 'Thành viên',
    mediaHeader: 'Ảnh & Video',
    noMedia: 'Không có tệp phương tiện nào',
    noFiles: 'Không có file tài liệu nào',
    noLinks: 'Không có liên kết nào',
    noMembers: 'Không có dữ liệu thành viên',
    memberStatsTitle: 'Thành viên & Thống kê đóng góp',
    msgCount: 'Tin nhắn',
    photoCount: 'Ảnh',
    videoCount: 'Video',
    linkCount: 'Link',
    selectChatPrompt: 'Chọn một đoạn chat bên trái để xem lịch sử tin nhắn',
    inputPlaceholder: 'Aa (Chế độ xem lịch sử lưu trữ)',
    unknownUser: 'Người dùng ẩn danh',
    attachedFile: 'Tệp đính kèm',
  },
  en: {
    chatsTitle: 'Chats',
    searchPlaceholder: 'Search Messenger',
    loadFolderPrompt: 'Click the folder icon 📁 above to load your Messenger message folder.',
    archiveLabel: 'Archived messages',
    chatInfoTitle: 'Chat info',
    mediaTab: 'Media',
    filesTab: 'Files',
    linksTab: 'Links',
    membersTab: 'Members',
    mediaHeader: 'Photos & Videos',
    noMedia: 'No media files found',
    noFiles: 'No document files found',
    noLinks: 'No links found',
    noMembers: 'No member data found',
    memberStatsTitle: 'Members & Contribution Stats',
    msgCount: 'Messages',
    photoCount: 'Photos',
    videoCount: 'Videos',
    linkCount: 'Links',
    selectChatPrompt: 'Select a chat on the left to view message history',
    inputPlaceholder: 'Aa (Archive viewing mode)',
    unknownUser: 'Unknown user',
    attachedFile: 'Attached file',
  },
};

// Hàm định dạng timestamp_ms thông minh: hiển thị giờ phút nếu trong ngày, hiển thị cả ngày tháng nếu khác ngày
function formatMessageTime(timestampMs: number): string {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  const now = new Date();
  
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } else {
    return date.toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}

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

// Hàm phụ trợ tạo màu sắc nhất quán cho tên người dùng
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
  className = 'max-w-xs max-h-80 rounded-2xl object-cover mt-1 shadow-sm cursor-pointer hover:opacity-95 transition-opacity',
}: {
  rootDir: FileSystemDirectoryHandle | null;
  uri: string;
  alt: string;
  className?: string;
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
        📷 Đang tải...
      </span>
    );
  }
  return (
    <>
      <img
        src={imgUrl}
        alt={alt}
        onClick={() => setIsOpen(true)}
        className={className}
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

interface MemberStat {
  name: string;
  messages: number;
  photos: number;
  videos: number;
  links: number;
}

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
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [mediaTab, setMediaTab] = useState<'media' | 'files' | 'links' | 'members'>('media');

  const t = translations[lang];

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

  const chatDataAnalysis = useMemo(() => {
    if (!currentMessage?.messages) {
      return { photos: [] as string[], videos: [] as string[], files: [] as any[], links: [] as any[], members: [] as MemberStat[] };
    }
    const photos: string[] = [];
    const videos: string[] = [];
    const files: any[] = [];
    const links: any[] = [];
    const membersMap: Record<string, MemberStat> = {};

    currentMessage.messages.forEach((msg: any) => {
      const sender = decodeString(msg.sender_name || t.unknownUser);
      if (!membersMap[sender]) {
        membersMap[sender] = { name: sender, messages: 0, photos: 0, videos: 0, links: 0 };
      }
      membersMap[sender].messages += 1;

      if (msg.photos) {
        msg.photos.forEach((p: any) => {
          photos.push(p.uri);
          membersMap[sender].photos += 1;
        });
      }
      let hasMsgVideo = false;
      if (msg.videos) {
        msg.videos.forEach((v: any) => {
          videos.push(typeof v === 'string' ? v : v.uri);
          hasMsgVideo = true;
        });
      }
      
      if (msg.files) {
        msg.files.forEach((f: any) => files.push(f));
      }

      let hasMsgLink = false;
      if (msg.share?.link) {
        links.push({ title: decodeString(msg.share.share_text || msg.share.link), url: msg.share.link });
        hasMsgLink = true;
      }
      if (msg.content) {
        const decoded = decodeString(msg.content);
        const videoMatch = decoded.match(/\[Video:\s*([^\]]+)\]/);
        if (videoMatch) {
          videos.push(videoMatch[1].trim());
          hasMsgVideo = true;
        }
        const urlMatches = decoded.match(/https?:\/\/[^\s]+/g);
        if (urlMatches) {
          urlMatches.forEach((url: string) => {
            if (!links.some((l) => l.url === url)) {
              links.push({ title: url, url });
            }
            hasMsgLink = true;
          });
        }
      }

      if (hasMsgVideo) membersMap[sender].videos += 1;
      if (hasMsgLink) membersMap[sender].links += 1;
    });

    const members: MemberStat[] = Object.values(membersMap).sort((a, b) => b.messages - a.messages);

    return { photos, videos, files, links, members };
  }, [currentMessage, t.unknownUser]);

  return (
    <div
      className={`flex h-screen w-screen overflow-hidden font-sans ${
        isDark ? 'bg-[#242526] text-[#e4e6eb]' : 'bg-white text-black'
      }`}
    >
      <Head>
        <title>Messenger Archive Viewer</title>
      </Head>
      
      {/* 1. Sidebar trái: Danh sách đoạn chat */}
      <aside
        className={`flex w-[360px] flex-col border-r ${
          isDark ? 'border-[#393a3b] bg-[#242526]' : 'border-gray-200 bg-white'
        }`}
      >
        <div className='px-4 pt-3 pb-1 flex items-center justify-start'>
          <button
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 shadow-2xs ${
              isDark
                ? 'border-[#3a3b3c] bg-[#3a3b3c] text-gray-200 hover:bg-[#4e4f50]'
                : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title='Chuyển đổi ngôn ngữ / Change Language'
          >
            <span>🌐</span>
            <span>{lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}</span>
          </button>
        </div>

        <div className='flex items-center justify-between px-4 pt-1 pb-2'>
          <h1 className='text-2xl font-bold tracking-tight'>{t.chatsTitle}</h1>
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
              placeholder={t.searchPlaceholder}
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
              {t.loadFolderPrompt}
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

      {/* 2. Khung chat chính giữa */}
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
                      {t.archiveLabel}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowRightSidebar(!showRightSidebar)}
                  className={`p-2 rounded-full transition-colors text-lg ${
                    isDark ? 'hover:bg-[#3a3b3c] text-gray-300' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                  title={t.chatInfoTitle}
                >
                  ℹ️
                </button>
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
                  const msgTime = formatMessageTime(msg.timestamp_ms);
                  
                  const videoMatch = decodedContent.match(/\[Video:\s*([^\]]+)\]/);
                  const embeddedVideoUri = videoMatch ? videoMatch[1].trim() : null;

                  const hasContent = Boolean(msg.content) && !embeddedVideoUri;
                  const hasPhotos = msg.photos && msg.photos.length > 0;
                  const hasSticker = Boolean(msg.sticker);
                  const hasVideos = (msg.videos && msg.videos.length > 0) || embeddedVideoUri;
                  const hasShare = Boolean(msg.share?.link);

                  const prevMsg = idx > 0 ? arr[idx - 1] : null;
                  const prevSender = prevMsg ? decodeString(prevMsg.sender_name) : null;
                  const showSenderHeader = !isMe && sender !== prevSender;

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col group ${
                        isMe ? 'items-end' : 'items-start'
                      } ${showSenderHeader ? 'mt-3' : 'mt-0.5'}`}
                    >
                      {showSenderHeader && (
                        <span className={`text-[12px] mb-1 ml-1 font-bold tracking-wide ${getUserColor(sender, isDark)}`}>
                          {sender}
                        </span>
                      )}

                      <div className={`flex items-end gap-1.5 max-w-[65%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-xs ${
                            isMe
                              ? 'bg-[#0084ff] text-white rounded-tr-xs rounded-br-xs'
                              : isDark
                              ? 'bg-[#3e4042] text-[#e4e6eb] rounded-tl-xs rounded-bl-xs'
                              : 'bg-[#f0f2f5] text-black rounded-tl-xs rounded-bl-xs'
                          }`}
                        >
                          {hasContent && (
                            <p className='whitespace-pre-wrap break-words'>
                              {decodedContent}
                            </p>
                          )}

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

                          {hasSticker && (
                            <div className='italic text-xs py-1'>
                              <span>🎨 [Sticker]</span>
                            </div>
                          )}

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

                        {/* Thời gian chi tiết hiển thị khi hover hoặc bấm */}
                        {msgTime && (
                          <span className={`text-[10px] select-none opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {msgTime}
                          </span>
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
                    placeholder={t.inputPlaceholder}
                    className={`w-full bg-transparent text-sm outline-none cursor-not-allowed ${isDark ? 'text-gray-400 placeholder-gray-500' : 'text-gray-500 placeholder-gray-400'}`}
                  />
                </div>
              </div>

            </div>

            {/* 3. Cột Sidebar Phải */}
            {showRightSidebar && (
              <aside
                className={`w-[320px] flex flex-col border-l overflow-hidden ${
                  isDark ? 'border-[#393a3b] bg-[#242526]' : 'border-gray-200 bg-white'
                }`}
              >
                <div className='flex flex-col items-center py-6 px-4 border-b border-gray-700/20'>
                  <div className='w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-md mb-3'>
                    {(currentMessage.title || currentMessage.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <h3 className='font-bold text-base text-center truncate w-full'>
                    {currentMessage.title || currentMessage.name}
                  </h3>
                  <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {chatDataAnalysis.members.length} {lang === 'vi' ? 'thành viên' : 'members'}
                  </p>
                </div>

                <div className={`flex border-b text-xs font-semibold overflow-x-auto ${isDark ? 'border-[#393a3b]' : 'border-gray-200'}`}>
                  <button
                    onClick={() => setMediaTab('media')}
                    className={`flex-1 py-3 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${
                      mediaTab === 'media'
                        ? 'border-blue-500 text-blue-500'
                        : isDark ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.mediaTab}
                  </button>
                  <button
                    onClick={() => setMediaTab('files')}
                    className={`flex-1 py-3 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${
                      mediaTab === 'files'
                        ? 'border-blue-500 text-blue-500'
                        : isDark ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.filesTab} ({chatDataAnalysis.files.length})
                  </button>
                  <button
                    onClick={() => setMediaTab('links')}
                    className={`flex-1 py-3 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${
                      mediaTab === 'links'
                        ? 'border-blue-500 text-blue-500'
                        : isDark ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.linksTab}
                  </button>
                  <button
                    onClick={() => setMediaTab('members')}
                    className={`flex-1 py-3 px-2 text-center border-b-2 whitespace-nowrap transition-colors ${
                      mediaTab === 'members'
                        ? 'border-blue-500 text-blue-500'
                        : isDark ? 'border-transparent text-gray-400 hover:text-gray-200' : 'border-transparent text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t.membersTab} ({chatDataAnalysis.members.length})
                  </button>
                </div>

                <div className='flex-1 overflow-y-auto p-3'>
                  {mediaTab === 'media' && (
                    <div className='space-y-4'>
                      <div>
                        <h4 className={`text-xs font-bold mb-2 uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {t.mediaHeader} ({chatDataAnalysis.photos.length + chatDataAnalysis.videos.length})
                        </h4>
                        
                        <div className='grid grid-cols-3 gap-1.5'>
                          {chatDataAnalysis.photos.map((uri: string, pIdx: number) => (
                            <div key={`p-${pIdx}`} className='aspect-square rounded-lg overflow-hidden bg-gray-800'>
                              <FsImage
                                rootDir={directory}
                                uri={uri}
                                alt={`media-${pIdx}`}
                                className='w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity'
                              />
                            </div>
                          ))}
                        </div>

                        {chatDataAnalysis.videos.length > 0 && (
                          <div className='mt-3 space-y-2'>
                            {chatDataAnalysis.videos.map((vUri: string, vIdx: number) => (
                              <FsVideo key={`v-${vIdx}`} rootDir={directory} uri={vUri} />
                            ))}
                          </div>
                        )}

                        {chatDataAnalysis.photos.length === 0 && chatDataAnalysis.videos.length === 0 && (
                          <p className={`text-xs text-center py-6 italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {t.noMedia}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {mediaTab === 'files' && (
                    <div className='space-y-2'>
                      {chatDataAnalysis.files.map((file: any, fIdx: number) => (
                        <div key={fIdx} className={`p-2.5 rounded-xl flex items-center gap-2.5 ${isDark ? 'bg-[#3a3b3c]' : 'bg-gray-100'}`}>
                          <span className='text-lg'>📄</span>
                          <div className='min-w-0 flex-1'>
                            <p className='text-xs font-semibold truncate'>{file.title || file.uri || t.attachedFile}</p>
                          </div>
                        </div>
                      ))}
                      {chatDataAnalysis.files.length === 0 && (
                        <p className={`text-xs text-center py-6 italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t.noFiles}
                        </p>
                      )}
                    </div>
                  )}

                  {mediaTab === 'links' && (
                    <div className='space-y-2'>
                      {chatDataAnalysis.links.map((linkObj: any, lIdx: number) => (
                        <a
                          key={lIdx}
                          href={linkObj.url}
                          target='_blank'
                          rel='noreferrer'
                          className={`block p-2.5 rounded-xl transition-colors ${
                            isDark ? 'bg-[#3a3b3c] hover:bg-[#4e4f50]' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                        >
                          <p className='text-xs font-semibold text-blue-400 truncate'>{linkObj.title}</p>
                          <p className={`text-[10px] truncate mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{linkObj.url}</p>
                        </a>
                      ))}
                      {chatDataAnalysis.links.length === 0 && (
                        <p className={`text-xs text-center py-6 italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t.noLinks}
                        </p>
                      )}
                    </div>
                  )}

                  {mediaTab === 'members' && (
                    <div className='space-y-3'>
                      <h4 className={`text-xs font-bold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t.memberStatsTitle}
                      </h4>
                      {chatDataAnalysis.members.map((member: any, mIdx: number) => (
                        <div
                          key={mIdx}
                          className={`p-3 rounded-xl flex flex-col gap-1.5 ${
                            isDark ? 'bg-[#3a3b3c]' : 'bg-gray-100'
                          }`}
                        >
                          <div className='flex items-center gap-2'>
                            <div className='w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shrink-0'>
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <span className={`text-xs font-bold truncate flex-1 ${getUserColor(member.name, isDark)}`}>
                              {member.name}
                            </span>
                          </div>
                          
                          <div className={`grid grid-cols-4 gap-1 pt-1 border-t text-center text-[10px] ${isDark ? 'border-gray-600 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                            <div className='bg-black/10 dark:bg-white/5 rounded p-1'>
                              <p className='font-bold'>{member.messages}</p>
                              <p className='text-[9px] opacity-75'>{t.msgCount}</p>
                            </div>
                            <div className='bg-black/10 dark:bg-white/5 rounded p-1'>
                              <p className='font-bold'>{member.photos}</p>
                              <p className='text-[9px] opacity-75'>{t.photoCount}</p>
                            </div>
                            <div className='bg-black/10 dark:bg-white/5 rounded p-1'>
                              <p className='font-bold'>{member.videos}</p>
                              <p className='text-[9px] opacity-75'>{t.videoCount}</p>
                            </div>
                            <div className='bg-black/10 dark:bg-white/5 rounded p-1'>
                              <p className='font-bold'>{member.links}</p>
                              <p className='text-[9px] opacity-75'>{t.linkCount}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      {chatDataAnalysis.members.length === 0 && (
                        <p className={`text-xs text-center py-6 italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t.noMembers}
                        </p>
                      )}
                    </div>
                  )}
                </div>

              </aside>
            )}

          </div>
        ) : (
          <div className={`flex flex-1 items-center justify-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {t.selectChatPrompt}
          </div>
        )}
      </main>
    </div>
  );
};

export default Home;
