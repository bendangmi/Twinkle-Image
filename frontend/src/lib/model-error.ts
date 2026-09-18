const MAX_ERROR_MESSAGE_LENGTH = 2_000;

function truncateErrorMessage(message: string): string {
  const normalized = message.trim();
  return normalized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : normalized;
}

function appendErrorMetadata(message: string, payload: Record<string, unknown>): string {
  const metadata: string[] = [];
  for (const [key, value] of [
    ['code', payload.code],
    ['type', payload.type],
    ['status', payload.status],
    ['request_id', payload.request_id ?? payload.requestId],
  ] as Array<[string, unknown]>) {
    const hasValue = (typeof value === 'string' && value.trim().length > 0)
      || typeof value === 'number';
    if (hasValue && !message.includes(String(value))) {
      metadata.push(`${key}: ${String(value).trim()}`);
    }
  }

  return metadata.length > 0 ? `${message} (${metadata.join(', ')})` : message;
}

export function extractUpstreamErrorMessage(
  payload: unknown,
  depth = 0,
  seen: Set<object> = new Set(),
): string {
  if (typeof payload === 'string') return truncateErrorMessage(payload);
  if (!payload || typeof payload !== 'object' || depth > 6 || seen.has(payload)) return '';

  seen.add(payload);
  if (Array.isArray(payload)) {
    const messages = payload
      .map(item => extractUpstreamErrorMessage(item, depth + 1, seen))
      .filter(Boolean);
    return truncateErrorMessage(Array.from(new Set(messages)).join('; '));
  }

  const record = payload as Record<string, unknown>;
  for (const key of ['message', 'detail', 'error_description', 'reason', 'title']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return truncateErrorMessage(appendErrorMetadata(value.trim(), record));
    }
  }

  for (const key of ['error', 'errors', 'details', 'cause', 'response']) {
    const nested = extractUpstreamErrorMessage(record[key], depth + 1, seen);
    if (nested) return truncateErrorMessage(appendErrorMetadata(nested, record));
  }

  for (const key of ['code', 'status']) {
    const value = record[key];
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number') {
      return `${key}: ${String(value).trim()}`;
    }
  }

  return '';
}

export async function readModelHttpError(response: Response): Promise<Error> {
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    // Keep the HTTP status fallback below.
  }

  let payload: unknown = null;
  if (detail) {
    try {
      payload = JSON.parse(detail);
    } catch {
      payload = detail;
    }
  }

  const upstreamMessage = extractUpstreamErrorMessage(payload);
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  return new Error(upstreamMessage ? `${status}: ${upstreamMessage}` : `模型请求失败 (${status})`);
}
