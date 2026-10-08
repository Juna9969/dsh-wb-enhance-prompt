export const HISTORY_MAX_MESSAGES = 8;
export const HISTORY_MAX_CHARS_PER_MESSAGE = 2500;
export const HISTORY_MAX_TOTAL_CHARS = 8000;

function clip(text, max) {
  if (text.length <= max) return { text, truncated: false };
  let end = Math.max(0, max);
  if (end > 0 && (text.charCodeAt(end - 1) & 0xFC00) === 0xD800) end -= 1;
  return { text: text.slice(0, end), truncated: true };
}

function blocksOf(event) {
  if (event?.type === 'user/message') return event.data?.content;
  if (event?.type === 'assistant/message') return event.data?.message?.content;
  return null;
}

export function messageText(event) {
  const blocks = blocksOf(event);
  if (!Array.isArray(blocks)) return '';
  const parts = [];
  for (const block of blocks) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text);
  }
  return parts.join('\n').trim();
}

export function collectRecentHistory(events, {
  maxMessages = HISTORY_MAX_MESSAGES,
  maxCharsPerMessage = HISTORY_MAX_CHARS_PER_MESSAGE,
  maxTotalChars = HISTORY_MAX_TOTAL_CHARS,
} = {}) {
  if (!Array.isArray(events) || maxMessages < 1 || maxCharsPerMessage < 1 || maxTotalChars < 1) return [];
  const selected = [];
  let remaining = maxTotalChars;
  for (let index = events.length - 1; index >= 0 && selected.length < maxMessages && remaining > 0; index--) {
    const event = events[index];
    if (event?.type !== 'user/message' && event?.type !== 'assistant/message') continue;
    if (typeof event.data?.id === 'string' && event.data.id.startsWith('rewind-')) continue;
    const raw = messageText(event);
    if (!raw) continue;
    const first = clip(raw, Math.min(maxCharsPerMessage, remaining));
    if (!first.text) break;
    remaining -= first.text.length;
    selected.push({
      role: event.type === 'user/message' ? 'user' : 'assistant',
      text: first.text,
      truncated: first.truncated || raw.length > first.text.length,
    });
  }
  return selected.reverse();
}
