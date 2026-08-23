'use client';

import {
  BUILTIN_IMAGE_PRESETS,
  type ImageModelConfig,
  type NovaModelRegistry,
  type TextModelConfig,
} from '@/lib/nova-models';

export const TWINKLE_MODEL_ACCOUNT_URL = 'https://big-model.smart-agi.com';
export const TWINKLE_MODEL_REQUEST_BASE_URL = 'https://st.smart-agi.com';
export const TWINKLE_MODEL_KEY_NAMES = {
  text: '【文本】GPT Pro20 默认分组',
  gptImage2: '【图片】GPT Image2 默认分组',
  bananaPro: '【图片】Gemini Banana 默认分组',
} as const;

const SESSION_STORAGE_KEY = 'twinkle-model-session';
const GPT_IMAGE_MODEL_ID = 'default-gpt-image-2';
const BANANA_PRO_MODEL_ID = 'default-banana-pro';
const GPT_TEXT_MODEL_ID = 'default-gpt-5-5';

export interface TwinkleModelUser {
  id: number;
  email: string;
  username?: string;
}

export interface TwinkleModelSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: TwinkleModelUser;
}

interface TwinkleAuthResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: TwinkleModelUser;
  requires_2fa?: boolean;
  temp_token?: string;
  user_email_masked?: string;
}

export interface TwinkleModelLogin2FAChallenge {
  requires2FA: true;
  tempToken: string;
  userEmailMasked: string;
}

export interface TwinkleModelDefaultKeys {
  text: string;
  gptImage2: string;
  bananaPro: string;
}

interface TwinkleModelKeysResponse {
  keys?: Partial<TwinkleModelDefaultKeys>;
  missingNames?: string[];
}

interface TwinkleModelRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface TwinkleFetchKeysResult {
  session: TwinkleModelSession;
  keys: TwinkleModelDefaultKeys;
}

class TwinkleModelRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'TwinkleModelRequestError';
    this.status = status;
    this.code = code;
  }
}

async function requestTwinkleProxy<T>(pathname: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/nova/twinkle-model/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    // Use the status fallback below when the response is not JSON.
  }
  if (!response.ok) {
    throw new TwinkleModelRequestError(
      String(payload.error || payload.message || `Twinkle Model 请求失败 (${response.status})`),
      response.status,
      typeof payload.code === 'string' ? payload.code : undefined,
    );
  }
  return payload as T;
}

function createSession(auth: TwinkleAuthResponse): TwinkleModelSession {
  if (!auth.access_token || !auth.user) {
    throw new Error('Twinkle Model 登录响应不完整');
  }
  return {
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token || '',
    expiresAt: Date.now() + Math.max(60, Number(auth.expires_in) || 3600) * 1000,
    user: auth.user,
  };
}

export async function loginTwinkleModel(
  email: string,
  password: string,
): Promise<TwinkleModelSession | TwinkleModelLogin2FAChallenge> {
  const auth = await requestTwinkleProxy<TwinkleAuthResponse>('login', { email, password });
  if (auth.requires_2fa) {
    if (!auth.temp_token) throw new Error('Twinkle Model 未返回二次验证会话');
    return {
      requires2FA: true,
      tempToken: auth.temp_token,
      userEmailMasked: auth.user_email_masked || email,
    };
  }
  return createSession(auth);
}

export async function completeTwinkleModelLogin2FA(
  tempToken: string,
  totpCode: string,
): Promise<TwinkleModelSession> {
  const auth = await requestTwinkleProxy<TwinkleAuthResponse>('login/2fa', { tempToken, totpCode });
  return createSession(auth);
}

export function isTwinkleModel2FAChallenge(
  result: TwinkleModelSession | TwinkleModelLogin2FAChallenge,
): result is TwinkleModelLogin2FAChallenge {
  return 'requires2FA' in result;
}

export function loadTwinkleModelSession(): TwinkleModelSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TwinkleModelSession>;
    if (!parsed.accessToken || !parsed.user?.email || !Number.isFinite(parsed.expiresAt)) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken || '',
      expiresAt: Number(parsed.expiresAt),
      user: parsed.user as TwinkleModelUser,
    };
  } catch {
    return null;
  }
}

export function saveTwinkleModelSession(session: TwinkleModelSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearTwinkleModelSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function refreshSession(session: TwinkleModelSession): Promise<TwinkleModelSession> {
  if (!session.refreshToken) throw new Error('Twinkle Model 登录已失效，请重新登录');
  const tokens = await requestTwinkleProxy<TwinkleModelRefreshResponse>('refresh', {
    refreshToken: session.refreshToken,
  });
  const next = {
    ...session,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || session.refreshToken,
    expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000,
  };
  saveTwinkleModelSession(next);
  return next;
}

function assertCompleteKeys(response: TwinkleModelKeysResponse): TwinkleModelDefaultKeys {
  const missingNames = Array.isArray(response.missingNames) ? response.missingNames : [];
  const keys = response.keys || {};
  if (missingNames.length > 0 || !keys.text || !keys.gptImage2 || !keys.bananaPro) {
    const names = missingNames.length > 0
      ? missingNames
      : Object.entries(TWINKLE_MODEL_KEY_NAMES)
          .filter(([slot]) => !keys[slot as keyof TwinkleModelDefaultKeys])
          .map(([, name]) => name);
    throw new Error(`账户中缺少默认 API 密钥：${names.join('、')}`);
  }
  return keys as TwinkleModelDefaultKeys;
}

export async function fetchTwinkleModelDefaultKeys(
  currentSession: TwinkleModelSession,
): Promise<TwinkleFetchKeysResult> {
  let session = currentSession;
  if (session.expiresAt <= Date.now() + 30_000 && session.refreshToken) {
    session = await refreshSession(session);
  }

  try {
    const response = await requestTwinkleProxy<TwinkleModelKeysResponse>('keys', {
      accessToken: session.accessToken,
    });
    return { session, keys: assertCompleteKeys(response) };
  } catch (error) {
    if (!(error instanceof TwinkleModelRequestError) || error.status !== 401 || !session.refreshToken) throw error;
    session = await refreshSession(session);
    const response = await requestTwinkleProxy<TwinkleModelKeysResponse>('keys', {
      accessToken: session.accessToken,
    });
    return { session, keys: assertCompleteKeys(response) };
  }
}

export async function logoutTwinkleModel(session: TwinkleModelSession | null): Promise<void> {
  clearTwinkleModelSession();
  if (!session?.refreshToken) return;
  try {
    await requestTwinkleProxy<{ ok: boolean }>('logout', { refreshToken: session.refreshToken });
  } catch {
    // The local session is already cleared; an expired remote session needs no further action.
  }
}

function upsertImageModel(
  models: ImageModelConfig[],
  stableId: string,
  presetId: 'gpt-image-2' | 'gemini-3-pro-image-preview',
  apiKey: string,
): { model: ImageModelConfig; remaining: ImageModelConfig[] } {
  const preset = BUILTIN_IMAGE_PRESETS[presetId];
  const existingIndex = models.findIndex(model => model.id === stableId || model.builtinPreset === presetId);
  const existing = existingIndex >= 0 ? models[existingIndex] : null;
  const model: ImageModelConfig = {
    id: existing?.id || stableId,
    protocol: preset.protocol,
    name: preset.name,
    modelId: preset.modelId,
    apiKey,
    baseUrl: TWINKLE_MODEL_REQUEST_BASE_URL,
    builtinPreset: preset.id,
    maxRefImages: preset.maxRefImages,
    maxOutputSize: '4K',
    supportsAdvancedParams: presetId === 'gpt-image-2',
  };
  return {
    model,
    remaining: models.filter((_, index) => index !== existingIndex),
  };
}

function upsertTextModel(models: TextModelConfig[], apiKey: string): { model: TextModelConfig; remaining: TextModelConfig[] } {
  const existingIndex = models.findIndex(model => model.id === GPT_TEXT_MODEL_ID || (
    model.protocol === 'openai-responses' && model.modelId === 'gpt-5.5'
  ));
  const existing = existingIndex >= 0 ? models[existingIndex] : null;
  return {
    model: {
      id: existing?.id || GPT_TEXT_MODEL_ID,
      protocol: 'openai-responses',
      name: 'gpt-5.5',
      modelId: 'gpt-5.5',
      apiKey,
      baseUrl: TWINKLE_MODEL_REQUEST_BASE_URL,
      note: 'OpenAI Response',
    },
    remaining: models.filter((_, index) => index !== existingIndex),
  };
}

export function applyTwinkleModelKeys(
  registry: NovaModelRegistry,
  keys: TwinkleModelDefaultKeys,
): NovaModelRegistry {
  const gptImage = upsertImageModel(registry.imageModels, GPT_IMAGE_MODEL_ID, 'gpt-image-2', keys.gptImage2);
  const banana = upsertImageModel(gptImage.remaining, BANANA_PRO_MODEL_ID, 'gemini-3-pro-image-preview', keys.bananaPro);
  const text = upsertTextModel(registry.textModels, keys.text);

  return {
    ...registry,
    imageModels: [gptImage.model, banana.model, ...banana.remaining],
    textModels: [text.model, ...text.remaining],
    defaults: {
      textToImage: gptImage.model.id,
      imageToImage: gptImage.model.id,
      reversePrompt: text.model.id,
      agent: text.model.id,
      promptOptimize: text.model.id,
      imageDescribe: text.model.id,
      sliceDecomposition: text.model.id,
      sliceReconstruct: text.model.id,
      sliceImageEdit: gptImage.model.id,
    },
  };
}
