/* eslint-disable @next/next/no-img-element */
import cx from 'clsx';
import { Popover } from 'react-tiny-popover';
import { SRLWrapper } from 'simple-react-lightbox';
import useSWR from 'swr';

import useToggle from '@/lib/hooks/useToggle';
import { getFileHandleRecursively } from '@/lib/utils/file';
import { useGroupedActorsByReaction } from '@/lib/utils/message';

import FsImage from './FsImage';
import { Message } from '../types';

function decodeText(str?: string): string {
  if (!str) return '';
  try {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return str;
  }
}

function ReactionButton({
  reaction,
  actors,
}: {
  reaction: string;
  actors: string[];
}) {
  const [isPopoverOpen, setPopoverOpen, togglePopover] = useToggle(false);

  return (
    <Popover
      isOpen={isPopoverOpen}
      positions={['top']}
      padding={10}
      content={() => (
        <div className='rounded bg-gray-600 py-0.5 px-1 text-white'>
          {actors.map((actor) => decodeText(actor)).join(', ')}
        </div>
      )}
      onClickOutside={() => setPopoverOpen(false)}
    >
      <span onClick={togglePopover}>{decodeText(reaction)}</span>
    </Popover>
  );
}

function BaseMessage({
  children,
  isFirst,
  isLast,
  isMe,
  className,
  message,
  transparentBG,
}: {
  message: Message;
  children?: React.ReactNode;
  isFirst: boolean;
  isLast: boolean;
  isMe: boolean;
  className?: string;
  transparentBG?: boolean;
}) {
  const [isPopoverOpen, setPopoverOpen, togglePopover] = useToggle(false);
  const groupedActions = useGroupedActorsByReaction(message);

  return (
    <div
      className={cx('flex', {
        'justify-end': isMe,
      })}
    >
      <Popover
        isOpen={isPopoverOpen}
        positions={['left']}
        padding={10}
        content={() => (
          <div className='rounded bg-gray-600 py-0.5 px-1 text-white'>
            {new Date(message.timestamp_ms).toLocaleString()}
          </div>
        )}
        onClickOutside={() => setPopoverOpen(false)}
      >
        <div
          className={cx(
            'relative whitespace-pre-wrap rounded-2xl px-4 py-2',
            {
              'rounded-r-md text-white ': isMe,
              'bg-blue-400 dark:bg-blue-700': isMe && !transparentBG,
              'rounded-l-md dark:bg-slate-800': !isMe,
              'bg-gray-200': !isMe && !transparentBG,
              'rounded-tl-2xl': isFirst && !isMe,
              'rounded-bl-2xl': isLast && !isMe,
              'rounded-tr-2xl': isFirst && isMe,
              'rounded-br-2xl': isLast && isMe,
              'bg-transparent dark:bg-transparent': transparentBG,
            },
            className
          )}
          onClick={() => {
            togglePopover();
          }}
        >
          {children}

          {groupedActions && (
            <div className='absolute right-2 -bottom-5 select-none rounded-2xl bg-white px-2 py-0.5 shadow dark:bg-slate-800'>
              {Object.entries(groupedActions).map(([reaction, actors]) => (
                <ReactionButton
                  key={reaction}
                  reaction={reaction}
                  actors={actors}
                />
              ))}
            </div>
          )}
        </div>
      </Popover>
    </div>
  );
}

export default function MessageComponent({
  message,
  isFirst,
  isLast,
  isMe,
  rootDir,
}: {
  message: Message;
  isFirst: boolean;
  isLast: boolean;
  isMe: boolean;
  rootDir: FileSystemDirectoryHandle;
}) {
  const content = decodeText(message.content);
  const rawMsg = message as any;

  const { data: imageURIs } = useSWR(
    () =>
      rawMsg.photos
        ? `/message/photo/${message.timestamp_ms}`
        : null,
    async () => {
      if (!rawMsg.photos) {
        return [];
      }

      const images = await Promise.all(
        rawMsg.photos.map(async (photo: any) => {
          const uri = photo.uri.replace(/^messages\//, '');
          const fileHandle = await getFileHandleRecursively(rootDir, uri);
          if (!fileHandle) {
            return null;
          }
          const file = await fileHandle.getFile();
          return URL.createObjectURL(file);
        })
      );

      return images.filter(Boolean) as string[];
    }
  );

  const renderDefault = () => (
    <BaseMessage
      isFirst={isFirst}
      isLast={isLast}
      isMe={isMe}
      message={message}
    >
      {content}
    </BaseMessage>
  );

  if (rawMsg.photos) {
    return (
      <SRLWrapper>
        <BaseMessage
          isFirst={isFirst}
          isLast={isLast}
          isMe={isMe}
          message={message}
        >
          {imageURIs
            ? imageURIs.map((uri) => (
                <a href={uri} key={uri}>
                  <img src={uri} alt={uri} />
                </a>
              ))
            : content}
        </BaseMessage>
      </SRLWrapper>
    );
  }

  if (rawMsg.sticker) {
    return (
      <BaseMessage
        isFirst={isFirst}
        isLast={isLast}
        isMe={isMe}
        message={message}
        transparentBG
      >
        <FsImage
          root={rootDir}
          path={rawMsg.sticker.uri.replace(/^messages\//, '')}
        />
      </BaseMessage>
    );
  }

  if (rawMsg.share?.link) {
    return (
      <BaseMessage
        isFirst={isFirst}
        isLast={isLast}
        isMe={isMe}
        message={message}
      >
        <a
          href={rawMsg.share.link}
          target='_blank'
          rel='noreferrer'
          className='underline'
        >
          {content || decodeText(rawMsg.share.share_text)}
        </a>
      </BaseMessage>
    );
  }

  return renderDefault();
}
