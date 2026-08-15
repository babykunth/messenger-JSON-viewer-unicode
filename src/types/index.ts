export enum MessageType {
  Generic = 'Generic',
  Share = 'Share',
}

export interface Photo {
  uri: string;
  creation_timestamp?: number;
}

export interface Sticker {
  uri: string;
}

export interface Share {
  link?: string;
  share_text?: string;
}

export interface Reaction {
  reaction: string;
  actor: string;
}

export interface Message {
  sender_name: string;
  timestamp_ms: number;
  content?: string;
  type?: MessageType | string;
  photos?: Photo[];
  sticker?: Sticker;
  share?: Share;
  reactions?: Reaction[];
  is_geoblocked_for_viewer?: boolean;
  is_unsent_image_by_messenger_kid_parent?: boolean;
}

export interface Chatroom {
  id: string;
  name: string;
  messages: Message[];
}
