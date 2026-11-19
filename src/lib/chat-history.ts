import { products } from './catalog';
import type { PreviewMessage } from './chat-preview';

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: PreviewMessage[];
}

export const CHAT_HISTORY_KEY = 'poostikal.chat.v1';
export const MAX_CHAT_MESSAGES = 60;

const MAX_CONVERSATIONS = 12;
const knownProductIds = new Set(products.map((product) => product.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function parseMessage(value: unknown): PreviewMessage | null {
  if (!isRecord(value) || !isText(value.id, 100)) return null;
  if (value.role !== 'user' && value.role !== 'assistant') return null;
  if (!isText(value.content, value.role === 'user' ? 2000 : 6000)) return null;

  let productIds: string[] | undefined;
  if (value.productIds !== undefined) {
    if (!Array.isArray(value.productIds) || value.productIds.length > 3) return null;
    const ids = value.productIds;
    if (!ids.every((id): id is string => typeof id === 'string' && knownProductIds.has(id))) return null;
    if (new Set(ids).size !== ids.length) return null;
    productIds = [...ids];
  }

  return {
    id: value.id,
    role: value.role,
    content: value.content,
    ...(productIds !== undefined ? { productIds } : {}),
  };
}

/** Return null for malformed data; valid, empty draft conversations are omitted. */
function normalizeConversations(value: unknown): ChatConversation[] | null {
  if (!Array.isArray(value)) return null;

  const conversationIds = new Set<string>();
  const conversations: ChatConversation[] = [];

  for (const item of value) {
    if (!isRecord(item) || !isText(item.id, 100) || !isText(item.title, 100)) return null;
    if (conversationIds.has(item.id)) return null;
    conversationIds.add(item.id);
    if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) return null;
    if (!Array.isArray(item.messages)) return null;

    const messageIds = new Set<string>();
    const parsedMessages: PreviewMessage[] = [];
    for (const candidate of item.messages) {
      const message = parseMessage(candidate);
      if (!message || messageIds.has(message.id)) return null;
      messageIds.add(message.id);
      parsedMessages.push(message);
    }

    const messages = parsedMessages.slice(-MAX_CHAT_MESSAGES);
    if (!messages.some((message) => message.role === 'user')) continue;

    conversations.push({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
      messages,
    });
  }

  return conversations
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

export function readChatHistory(storage: Pick<Storage, 'getItem'>): ChatConversation[] {
  try {
    const raw = storage.getItem(CHAT_HISTORY_KEY);
    if (raw === null) return [];
    const payload: unknown = JSON.parse(raw);
    if (!isRecord(payload) || payload.version !== 1) return [];
    return normalizeConversations(payload.conversations) ?? [];
  } catch {
    return [];
  }
}

/** False leaves the caller free to retain its current in-memory conversation. */
export function writeChatHistory(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  conversations: ChatConversation[],
): boolean {
  try {
    const normalized = normalizeConversations(conversations);
    if (normalized === null) return false;
    if (normalized.length === 0) {
      storage.removeItem(CHAT_HISTORY_KEY);
    } else {
      storage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ version: 1, conversations: normalized }));
    }
    return true;
  } catch {
    return false;
  }
}
