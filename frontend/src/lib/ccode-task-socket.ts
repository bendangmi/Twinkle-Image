import { getNovaTask, getNovaQueueStatus, type NovaTaskResponse, type NovaQueueStatus } from '@/lib/ccode-task-client';

type TaskUpdateHandler = (task: NovaTaskResponse) => void;
type QueueUpdateHandler = (stats: NovaQueueStatus) => void;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const SOCKET_FAILURE_THRESHOLD = 5;
const HTTP_FALLBACK_INTERVAL_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 25000;
const HEARTBEAT_TIMEOUT_MS = 10000;

interface ServerTaskMessage {
  type: 'task';
  task: NovaTaskResponse;
}

interface ServerQueueMessage {
  type: 'queueStatus';
  stats: NovaQueueStatus;
}

interface ServerPongMessage {
  type: 'pong';
}

interface ServerErrorMessage {
  type: 'error';
  code?: string;
  message?: string;
}

type ServerMessage = ServerTaskMessage | ServerQueueMessage | ServerPongMessage | ServerErrorMessage;

function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}

function buildSocketUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const configuredBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    const url = new URL(
      '/api/nova/ws',
      configuredBackendUrl ? `${configuredBackendUrl.replace(/\/+$/, '')}/` : window.location.href,
    );
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return null;
  }
}

class NovaTaskSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private consecutiveFailures = 0;
  private taskHandlers = new Map<string, Set<TaskUpdateHandler>>();
  private queueHandlers = new Set<QueueUpdateHandler>();
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackInFlight = false;
  private fallbackActive = false;
  private explicitlyDisabled = false;
  private listenersBound = false;

  /** 在浏览器端确保连接已开始（idempotent） */
  ensureConnected(): void {
    if (this.explicitlyDisabled) return;
    if (typeof window === 'undefined') return;
    this.bindGlobalListeners();
    if (this.fallbackActive) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.connect();
  }

  subscribeTask(taskId: string, handler: TaskUpdateHandler): () => void {
    let set = this.taskHandlers.get(taskId);
    if (!set) {
      set = new Set();
      this.taskHandlers.set(taskId, set);
    }
    set.add(handler);
    this.ensureConnected();
    if (this.fallbackActive) {
      // socket 不可用时，立即拉一次以便回填初始状态
      this.fetchTaskOnce(taskId);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribeTasks', taskIds: [taskId] });
    }
    return () => this.unsubscribeTask(taskId, handler);
  }

  subscribeQueue(handler: QueueUpdateHandler): () => void {
    this.queueHandlers.add(handler);
    this.ensureConnected();
    if (this.fallbackActive) {
      this.fetchQueueOnce();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribeQueue' });
    }
    return () => {
      this.queueHandlers.delete(handler);
      if (this.queueHandlers.size === 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'unsubscribeQueue' });
      }
    };
  }

  /** 测试用：禁用网络层 */
  disable(): void {
    this.explicitlyDisabled = true;
    this.cleanupConnection();
    this.stopFallback();
  }

  private unsubscribeTask(taskId: string, handler: TaskUpdateHandler): void {
    const set = this.taskHandlers.get(taskId);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.taskHandlers.delete(taskId);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'unsubscribeTasks', taskIds: [taskId] });
      }
    }
  }

  private bindGlobalListeners(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('pageshow', this.handlePageShow);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private hasLiveSocket(): boolean {
    return !!this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING);
  }

  private handleOnline = () => {
    // 已有可用连接时无需重连（避免泄漏旧连接）。
    if (!this.fallbackActive && this.hasLiveSocket()) return;
    this.consecutiveFailures = 0;
    if (this.fallbackActive) {
      this.stopFallback();
    }
    this.scheduleReconnect(0);
  };

  private handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    if (!this.fallbackActive && this.hasLiveSocket()) return;
    this.consecutiveFailures = 0;
    if (this.fallbackActive) this.stopFallback();
    this.scheduleReconnect(0);
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    if (this.taskHandlers.size === 0) return;
    // 页面回到前台：仅当连接既非 OPEN 也非 CONNECTING 时才重连。
    if (!this.hasLiveSocket()) {
      this.consecutiveFailures = 0;
      if (this.fallbackActive) this.stopFallback();
      this.scheduleReconnect(0);
    }
  };

  private connect(): void {
    // 幂等：已有 OPEN/CONNECTING 连接时不再新建，避免重连路径（online/pageshow/
    // visibilitychange）在旧连接未关闭时泄漏出第二条连接。
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (!isWebSocketSupported()) {
      this.activateFallback();
      return;
    }
    const url = buildSocketUrl();
    if (!url) {
      this.activateFallback();
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.handleConnectFailure();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.consecutiveFailures = 0;
      this.startHeartbeat();
      // 重新订阅
      const taskIds = Array.from(this.taskHandlers.keys());
      if (taskIds.length > 0) {
        this.send({ type: 'subscribeTasks', taskIds });
      }
      if (this.queueHandlers.size > 0) {
        this.send({ type: 'subscribeQueue' });
      }
    });

    ws.addEventListener('message', event => {
      let data: unknown;
      try {
        data = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }
      this.handleServerMessage(data as ServerMessage);
    });

    ws.addEventListener('close', () => {
      this.stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      this.handleConnectFailure();
    });

    ws.addEventListener('error', () => {
      // close 事件随后会触发，统一在那里处理
    });
  }

  private handleConnectFailure(): void {
    if (this.explicitlyDisabled) return;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= SOCKET_FAILURE_THRESHOLD) {
      this.activateFallback();
      return;
    }
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_DELAY_MS,
    );
    const jitter = Math.random() * 0.3 * delay;
    this.reconnectAttempt += 1;
    this.scheduleReconnect(delay + jitter);
  }

  private scheduleReconnect(delay: number): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.explicitlyDisabled) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanupConnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.send({ type: 'ping' });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        if (this.ws) {
          try { this.ws.close(); } catch { /* ignore */ }
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch {
      // send failure — connection will be cleaned up on close event
    }
  }

  private handleServerMessage(message: ServerMessage | null): void {
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'pong') {
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      return;
    }
    if (message.type === 'task') {
      const task = message.task;
      if (!task || typeof task.id !== 'string') return;
      const handlers = this.taskHandlers.get(task.id);
      if (!handlers) return;
      for (const handler of handlers) {
        try { handler(task); } catch { /* ignore handler error */ }
      }
      return;
    }
    if (message.type === 'queueStatus') {
      const stats = message.stats;
      if (!stats) return;
      for (const handler of this.queueHandlers) {
        try { handler(stats); } catch { /* ignore handler error */ }
      }
      return;
    }
    if (message.type === 'error') {
      // server error message received
    }
  }

  // ===== HTTP 兜底 =====
  private activateFallback(): void {
    if (this.fallbackActive) return;
    this.fallbackActive = true;
    this.cleanupConnection();
    this.runFallbackTick();
    this.fallbackTimer = setInterval(() => this.runFallbackTick(), HTTP_FALLBACK_INTERVAL_MS);
    // 兜底期间也允许通过 online/pageshow 重新尝试 socket
  }

  private stopFallback(): void {
    if (!this.fallbackActive) return;
    this.fallbackActive = false;
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private runFallbackTick(): void {
    if (this.fallbackInFlight) return;
    this.fallbackInFlight = true;
    const taskIds = Array.from(this.taskHandlers.keys());
    const promises: Promise<unknown>[] = [];
    for (const id of taskIds) promises.push(this.fetchTaskOnce(id));
    if (this.queueHandlers.size > 0) promises.push(this.fetchQueueOnce());
    Promise.allSettled(promises).finally(() => {
      this.fallbackInFlight = false;
    });
  }

  private async fetchTaskOnce(taskId: string): Promise<void> {
    try {
      const task = await getNovaTask(taskId);
      const handlers = this.taskHandlers.get(taskId);
      if (!handlers) return;
      for (const handler of handlers) {
        try { handler(task); } catch { /* ignore handler error */ }
      }
    } catch {
      // fallback fetch failure — will retry on next tick
    }
  }

  private async fetchQueueOnce(): Promise<void> {
    try {
      const stats = await getNovaQueueStatus();
      for (const handler of this.queueHandlers) {
        try { handler(stats); } catch { /* ignore handler error */ }
      }
    } catch {
      // fallback fetch failure — will retry on next tick
    }
  }
}

export const novaTaskSocket = new NovaTaskSocket();
/** @deprecated Use novaTaskSocket */
export const ccodeTaskSocket = novaTaskSocket;
export type { TaskUpdateHandler, QueueUpdateHandler };
