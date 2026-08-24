import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsModal } from '../SettingsModal';
import { applyTwinkleModelKeys } from '@/lib/twinkle-model';
import { loadRegistry, saveRegistry } from '@/lib/nova-models';

describe('SettingsModal', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(screen.getByText('模型级独立配置')).toBeInTheDocument();
  });

  it('opens after Twinkle configures the shared system key', async () => {
    saveRegistry(applyTwinkleModelKeys(loadRegistry(), 'system-key'));
    const result = render(<SettingsModal isOpen={false} onClose={() => undefined} />);

    await act(async () => {
      result.rerender(<SettingsModal isOpen onClose={() => undefined} />);
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('system-key')).toHaveLength(2);
  });
});
