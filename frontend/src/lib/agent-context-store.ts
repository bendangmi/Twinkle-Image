// Agent 模式自建上下文系统的 IndexedDB 持久化层
// 数据库: nova-agent-db (v1)
//   store: messages (keyPath 'id')        —— 对话消息，靠 createdAt 排序
//   store: images   (keyPath 'imgId')     —— 图片登记表（仅描述 + 缩略图 + 字节引用）
//   store: meta      (keyPath 'key')       —— 会话元信息（模型选择等）
// 图片真实字节不在这里，存于 nova-image-db 的 blobs store（复用 image-downloader）。

import { storeImageBlob, getStoredBlob, deleteStoredBlobs } from '@/lib/image-downloader';
import type { AgentMessage, AgentImageRecord, AgentProposal } from '@/lib/agent-chat-config';
import type { GptImageBackground, GptImageQuality, GptImageStyle } from '@/lib/model-capabilities';

const DB_NAME = 'nova-agent-db';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const IMAGES_STORE = 'images';
const META_STORE = 'meta';

// 单例缓存数据库连接（参考 image-db.ts 的模式），避免每次读写 open 后泄漏连接。
let agentDbPromise: Promise<IDBDatabase | null> | null = null;

function openAgentDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (agentDbPromise) return agentDbPromise;

  agentDbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => { agentDbPromise = null; resolve(null); };
    req.onsuccess = () => {
      const db = req.result;
      // 另一个 tab 或备份导入触发版本变更时主动关闭并失效缓存，下次调用会重新打开。
      db.onversionchange = () => {
        try { db.close(); } catch { /* ignore */ }
        agentDbPromise = null;
      };
      db.onclose = () => { agentDbPromise = null; };
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'imgId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });
  return agentDbPromise;
}

function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => resolve([]);
  });
}

// ===== 加载完整会话 =====

export interface AgentSessionSnapshot {
  messages: AgentMessage[];
  images: AgentImageRecord[];
  imageModel: string | null;
}

export async function loadAgentSession(): Promise<AgentSessionSnapshot> {
  const db = await openAgentDB();
  if (!db) return { messages: [], images: [], imageModel: null };

  const [messages, images, meta] = await Promise.all([
    getAll<AgentMessage>(db, MESSAGES_STORE),
    getAll<AgentImageRecord>(db, IMAGES_STORE),
    getAll<{ key: string; value: string }>(db, META_STORE),
  ]);

  messages.sort((a, b) => a.createdAt - b.createdAt);
  images.sort((a, b) => a.createdAt - b.createdAt);
  const imageModel = meta.find(item => item.key === 'imageModel')?.value ?? null;

  return { messages, images, imageModel };
}

// ===== 消息读写 =====

export async function putMessage(message: AgentMessage): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    tx.objectStore(MESSAGES_STORE).put(message);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== 图片登记表读写 =====

export async function putImageRecord(record: AgentImageRecord): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(IMAGES_STORE, 'readwrite');
    tx.objectStore(IMAGES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== 元信息 =====

export async function saveImageModel(model: string): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: 'imageModel', value: model });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== 撤回消息 =====

export async function deleteMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(MESSAGES_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** 从 nova-agent-db 中删除图片登记记录 */
export async function deleteImageRecords(imgIds: string[]): Promise<void> {
  if (imgIds.length === 0) return;
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(IMAGES_STORE, 'readwrite');
    const store = tx.objectStore(IMAGES_STORE);
    for (const id of imgIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** 从 nova-image-db 中删除 agent 图片的 blob 字节 */
export async function deleteAgentImageBytes(imgId: string): Promise<void> {
  await deleteStoredBlobs(imgId, 1);
}

// ===== 清空会话（清空重开） =====

export async function clearAgentSession(): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction([MESSAGES_STORE, IMAGES_STORE, META_STORE], 'readwrite');
    tx.objectStore(MESSAGES_STORE).clear();
    tx.objectStore(IMAGES_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== Pending Proposal 持久化（刷新恢复「等待你确认」状态）=====
// 将待确认的提案、分析文本、推理文本和 reedit 标志存入 meta store，
// 页面刷新后自动恢复 proposal 阶段，避免丢失。

export interface PendingProposalData {
  proposal: AgentProposal;
  pendingAnalysis: string;
  pendingReasoning: string;
  isReedit: boolean;
}

const PENDING_PROPOSAL_KEY = 'pendingProposal';

export async function savePendingProposal(data: PendingProposalData): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: PENDING_PROPOSAL_KEY, value: JSON.stringify(data) });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function loadPendingProposal(): Promise<PendingProposalData | null> {
  const db = await openAgentDB();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(PENDING_PROPOSAL_KEY);
    req.onsuccess = () => {
      const entry = req.result as { key: string; value: string } | undefined;
      if (!entry?.value) { resolve(null); return; }
      try {
        resolve(JSON.parse(entry.value) as PendingProposalData);
      } catch {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

export async function clearPendingProposal(): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(PENDING_PROPOSAL_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== Pending Generation 持久化（刷新恢复「正在生图」状态）=====
// 将 taskId、proposal、分析文本等存入 meta store，
// 页面刷新后自动恢复轮询，避免生成中的图片丢失。

export interface PendingGenerationData {
  taskId: string;
  proposal: AgentProposal;
  pendingAnalysis: string;
  pendingReasoning: string;
  selectedImageIds: string[];
  model: string;
  outputSize: string;
  customSize?: string;
  aspectRatio: string;
  temperature: number;
  gptImageQuality?: GptImageQuality;
  gptImageStyle?: GptImageStyle;
  gptImageBackground?: GptImageBackground;
  parallelCount: number;
  startedAt: number;
}

const PENDING_GENERATION_KEY = 'pendingGeneration';

export async function savePendingGeneration(data: PendingGenerationData): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key: PENDING_GENERATION_KEY, value: JSON.stringify(data) });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function loadPendingGeneration(): Promise<PendingGenerationData | null> {
  const db = await openAgentDB();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get(PENDING_GENERATION_KEY);
    req.onsuccess = () => {
      const entry = req.result as { key: string; value: string } | undefined;
      if (!entry?.value) { resolve(null); return; }
      try {
        resolve(JSON.parse(entry.value) as PendingGenerationData);
      } catch {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

export async function clearPendingGeneration(): Promise<void> {
  const db = await openAgentDB();
  if (!db) return;

  return new Promise((resolve) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(PENDING_GENERATION_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ===== 图片字节存取（复用 nova-image-db 的 blobs store）=====
// 约定：每张 agent 图片用 imgId 作为 jobId 命名空间，imageIndex 固定 0。

export async function storeAgentImageBytes(imgId: string, blob: Blob): Promise<void> {
  await storeImageBlob(imgId, 0, blob);
}

/** 查询 nova-upload-cache 中缓存的图片记录 */
interface UploadCacheRecord {
  key: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  originalSize: number;
  processedSize: number;
  width: number;
  height: number;
  createdAt: number;
}

function openUploadCacheDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open('nova-upload-cache', 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
  });
}

function getFromUploadCache(db: IDBDatabase, key: string): Promise<UploadCacheRecord | null> {
  return new Promise((resolve) => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(key);
    req.onsuccess = () => resolve((req.result as UploadCacheRecord) || null);
    req.onerror = () => resolve(null);
  });
}

/** 从 nova-agent-db 的 images store 中查询单条图片登记记录 */
export async function getAgentImageRecord(imgId: string): Promise<AgentImageRecord | null> {
  const db = await openAgentDB();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(IMAGES_STORE, 'readonly');
    const req = tx.objectStore(IMAGES_STORE).get(imgId);
    req.onsuccess = () => resolve((req.result as AgentImageRecord) || null);
    req.onerror = () => resolve(null);
  });
}

export async function getAgentImageBytes(imgId: string): Promise<Blob | null> {
  // 1) 先查 nova-upload-cache（上传图片已压缩缓存于此，与其余模式共享）
  const record = await getAgentImageRecord(imgId);
  if (record?.contentHash) {
    try {
      const cacheDb = await openUploadCacheDB();
      if (cacheDb) {
        const cached = await getFromUploadCache(cacheDb, record.contentHash);
        cacheDb.close();
        if (cached?.dataUrl) {
          const base64 = cached.dataUrl.includes(',') ? cached.dataUrl.split(',')[1] : cached.dataUrl;
          if (base64) {
            const mime = cached.mimeType || 'image/png';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime });
          }
        }
      }
    } catch {
      // 读取上传缓存失败时静默降级到 nova-image-db
    }
  }
  // 2) 降级到 nova-image-db（生成图片走此路径）
  return getStoredBlob(imgId, 0);
}

/** 把图片字节转成可直接喂给生图后端的 base64（不含 data: 前缀） */
export async function getAgentImageBase64(imgId: string): Promise<{ data: string; mimeType: string } | null> {
  const blob = await getAgentImageBytes(imgId);
  if (!blob) return null;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return { data: base64, mimeType: blob.type || 'image/png' };
}
