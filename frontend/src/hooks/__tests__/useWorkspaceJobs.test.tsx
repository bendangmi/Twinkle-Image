import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceJobs } from '../useWorkspaceJobs';
import { hasAnyApiKey } from '@/lib/settings-storage';
import { loadJobs, openDB, saveJobs, type StoredJob } from '@/lib/job-store';

vi.mock('@/lib/settings-storage', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/settings-storage')>(),
  hasAnyApiKey: vi.fn(),
}));

vi.mock('@/lib/job-store', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/job-store')>(),
  loadJobs: vi.fn(),
  saveJobs: vi.fn(),
  openDB: vi.fn(),
}));

function WorkspaceSnapshot() {
  const workspace = useWorkspaceJobs();
  return <div>{workspace.hasApiKey ? 'configured' : 'unconfigured'}:{workspace.jobs.length}</div>;
}

describe('useWorkspaceJobs hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasAnyApiKey).mockReturnValue(true);
    vi.mocked(loadJobs).mockReturnValue([
      { id: 'saved-job', model: 'saved-model', status: 'processing' } as StoredJob,
    ]);
    vi.mocked(openDB).mockResolvedValue(null);
  });

  it('renders a stable server snapshot without reading browser settings or history', () => {
    expect(renderToString(<WorkspaceSnapshot />)).toContain('unconfigured');
    expect(hasAnyApiKey).not.toHaveBeenCalled();
    expect(loadJobs).not.toHaveBeenCalled();
  });

  it('hydrates configured browsers without mismatches and restores interrupted history', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<WorkspaceSnapshot />);
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: Root | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, <WorkspaceSnapshot />, { onRecoverableError });
      });
      await waitFor(() => expect(container.textContent).toBe('configured:1'));
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(saveJobs).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'saved-job', status: 'failed', terminal: true }),
      ]);

      vi.mocked(hasAnyApiKey).mockReturnValue(false);
      await act(async () => {
        window.dispatchEvent(new Event('nova-model-registry-updated'));
      });
      expect(container.textContent).toBe('unconfigured:1');
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it('restores history once under StrictMode and keeps active server tasks intact', async () => {
    vi.mocked(loadJobs).mockReturnValue([
      { id: 'server-job', model: 'saved-model', status: 'processing', serverTaskId: 'task-id' } as StoredJob,
    ]);
    const { result } = renderHook(() => useWorkspaceJobs(), { wrapper: StrictMode });

    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
    expect(result.current.jobs[0].status).toBe('processing');
    expect(result.current.hasJob('server-job')).toBe(true);
    expect(loadJobs).toHaveBeenCalledTimes(1);
    expect(saveJobs).toHaveBeenCalledTimes(1);
  });
});
