import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { applyTwinkleModelKeys, fetchTwinkleModelDefaultKeys, loginTwinkleModel } from '@/lib/twinkle-model';
import { loadRegistry, saveRegistry } from '@/lib/nova-models';

vi.mock('@/lib/twinkle-model', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/twinkle-model')>(),
  loginTwinkleModel: vi.fn(),
  fetchTwinkleModelDefaultKeys: vi.fn(),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opens without entering a render loop', async () => {
    const result = render(
      <StrictMode>
        <SettingsModal isOpen={false} onClose={() => undefined} />
      </StrictMode>,
    );

    await act(async () => {
      result.rerender(
        <StrictMode>
          <SettingsModal isOpen onClose={() => undefined} />
        </StrictMode>,
      );
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('供应商与模型')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增图片模型' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增文本模型' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增供应商' })).toBeInTheDocument();
  });

  it('opens after Twinkle configures the shared system key', async () => {
    saveRegistry(applyTwinkleModelKeys(loadRegistry(), 'system-key'));
    const result = render(<SettingsModal isOpen={false} onClose={() => undefined} />);

    await act(async () => {
      result.rerender(<SettingsModal isOpen onClose={() => undefined} />);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('system-key')).toHaveLength(1);
    expect(screen.getByRole('region', { name: '模型 gemini-3-pro-image-preview' })).toBeInTheDocument();
  });

  it('updates all provider models from one key and persists with one save action', async () => {
    saveRegistry(applyTwinkleModelKeys(loadRegistry(), 'system-key'));
    render(<SettingsModal isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'updated-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    const restored = loadRegistry();
    expect(restored.imageModels.every(model => model.apiKey === 'updated-key')).toBe(true);
    expect(restored.textModels.every(model => model.apiKey === 'updated-key')).toBe(true);
    expect(screen.getByText('供应商配置已保存')).toBeInTheDocument();
  });

  it('preserves selected image defaults when opening and saving', () => {
    const configured = applyTwinkleModelKeys(loadRegistry(), 'system-key');
    configured.defaults.textToImage = configured.imageModels[1].id;
    configured.defaults.imageToImage = configured.imageModels[1].id;
    saveRegistry(configured);
    render(<SettingsModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    expect(loadRegistry().defaults.textToImage).toBe(configured.imageModels[1].id);
    expect(loadRegistry().defaults.imageToImage).toBe(configured.imageModels[1].id);
  });

  it('automatically configures one provider and three models after login', async () => {
    const session = {
      accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: Date.now() + 3600000,
      user: { id: 1, email: 'user@example.com', username: 'User' },
    };
    vi.mocked(loginTwinkleModel).mockResolvedValue(session);
    vi.mocked(fetchTwinkleModelDefaultKeys).mockResolvedValue({ session, key: 'login-key' });
    render(<SettingsModal isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: '登录并配置' }));
    await waitFor(() => expect(screen.getByLabelText('API Key')).toHaveValue('login-key'));
    expect(loginTwinkleModel).toHaveBeenCalledWith('user@example.com', 'password');
    expect(loadRegistry().providers).toHaveLength(1);
    expect(loadRegistry().providers?.[0].name).toBe('Twinkle Model');
    expect(loadRegistry().imageModels).toHaveLength(2);
    expect(loadRegistry().textModels).toHaveLength(1);
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument();
  });
});
