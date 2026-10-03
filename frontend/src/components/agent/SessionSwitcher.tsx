'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { deleteAgentSessionDatabase } from '@/lib/agent-context-store';
import {
  createAgentSession,
  deleteAgentSession,
  listAgentSessions,
  renameAgentSession,
  type AgentSession,
} from '@/lib/agent-sessions';
import { cn } from '@/lib/utils';

export interface SessionSwitcherProps {
  activeSessionId: string;
  onSessionChange: (sessionId: string) => void | Promise<void>;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

type NameDialogState = { mode: 'create' } | { mode: 'rename'; session: AgentSession } | null;

export function SessionSwitcher({ activeSessionId, onSessionChange, mobileOpen, onMobileOpenChange }: SessionSwitcherProps) {
  const [sessions, setSessions] = useState<AgentSession[]>(() => listAgentSessions());
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentSession | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const isMobileOpen = mobileOpen !== undefined ? mobileOpen : internalMobileOpen;
  const setMobileOpenState = (open: boolean) => {
    if (onMobileOpenChange) onMobileOpenChange(open);
    else setInternalMobileOpen(open);
  };

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => {
      if (media.matches) {
        if (onMobileOpenChange) onMobileOpenChange(false);
        else setInternalMobileOpen(false);
      }
    };
    closeOnDesktop();
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, [onMobileOpenChange]);

  const refreshSessions = () => setSessions(listAgentSessions());

  const handleSessionChange = async (sessionId: string) => {
    if (busy || sessionId === activeSessionId) return;

    setBusy(true);
    try {
      await onSessionChange(sessionId);
    } finally {
      setBusy(false);
    }
  };

  const openCreateDialog = () => {
    setNameDraft('');
    setNameDialog({ mode: 'create' });
  };

  const openRenameDialog = (session: AgentSession) => {
    setNameDraft(session.name);
    setNameDialog({ mode: 'rename', session });
  };

  const handleNameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name || !nameDialog || busy) return;

    setBusy(true);
    try {
      if (nameDialog.mode === 'create') {
        const session = createAgentSession(name);
        refreshSessions();
        setNameDialog(null);
        setMobileOpenState(false);
        await onSessionChange(session.id);
      } else {
        renameAgentSession(nameDialog.session.id, name);
        refreshSessions();
        setNameDialog(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target || target.id === 'default' || busy) return;

    setDeleteError(null);
    setBusy(true);
    let switchedToDefault = false;
    try {
      if (target.id === activeSessionId) {
        await onSessionChange('default');
        switchedToDefault = true;
      }
      await deleteAgentSessionDatabase(target.id);
      deleteAgentSession(target.id);
      refreshSessions();
      setDeleteTarget(null);
      setMobileOpenState(false);
    } catch {
      if (switchedToDefault) {
        try { await onSessionChange(target.id); } catch { /* keep the deletion error visible */ }
      }
      setDeleteError('删除会话失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const renderSessionItems = (isMobile: boolean = false) => (
    sessions.map(session => {
      const isActive = session.id === activeSessionId;
      return (
        <div
          key={session.id}
          className={cn(
            'group flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 transition-all text-sm',
            isActive
              ? 'bg-primary/10 text-primary font-medium border border-primary/20 shadow-xs dark:bg-primary/15'
              : 'border border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
          )}
        >
          <button
            type="button"
            aria-current={isActive ? 'true' : undefined}
            disabled={busy || isActive}
            onClick={() => {
              void handleSessionChange(session.id);
              if (isMobile) setMobileOpenState(false);
            }}
            className={cn(
              'min-w-0 flex-1 truncate text-left transition-colors',
              isActive ? 'text-primary font-medium' : 'text-foreground/80 hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {isActive && (
                <span className="size-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
              )}
              <span className="truncate">{session.name}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label={`重命名会话 ${session.name}`}
            title="重命名"
            disabled={busy}
            onClick={() => openRenameDialog(session)}
            className={cn(
              'shrink-0 rounded-md p-1 transition-colors disabled:opacity-40',
              isActive
                ? 'text-primary/70 hover:bg-primary/15 hover:text-primary'
                : 'text-muted-foreground/60 hover:bg-background hover:text-foreground opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100',
            )}
          >
            <Pencil className="size-3.5" />
          </button>
          {session.id !== 'default' && (
            <button
              type="button"
              aria-label={`删除会话 ${session.name}`}
              title="删除"
              disabled={busy}
              onClick={() => {
                setDeleteError(null);
                setDeleteTarget(session);
              }}
              className={cn(
                'shrink-0 rounded-md p-1 transition-colors disabled:opacity-40',
                isActive
                  ? 'text-primary/70 hover:bg-destructive/10 hover:text-destructive'
                  : 'text-muted-foreground/60 hover:bg-background hover:text-destructive opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100',
              )}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      );
    })
  );

  return (
    <>
      {/* 桌面端正常展示侧边栏 */}
      <aside
        aria-label="Agent 会话"
        className="hidden min-h-0 w-44 shrink-0 flex-col self-stretch rounded-2xl border border-border bg-card/60 md:flex lg:w-52"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">会话</span>
          <span className="text-xs text-muted-foreground">{sessions.length}</span>
        </div>
        <div className="border-b border-border p-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full justify-center gap-2 rounded-xl border-dashed border-primary/35 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-primary font-medium shadow-xs transition-all"
            onClick={openCreateDialog}
            disabled={busy}
          >
            <Plus className="size-4" />
            新建会话
          </Button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {renderSessionItems(false)}
        </div>
      </aside>

      {/* 移动端抽屉侧边栏（由 Agent 顶栏左侧按钮触发打开） */}
      <Dialog open={isMobileOpen} onOpenChange={setMobileOpenState}>
        <DialogContent aria-label="会话侧边栏" showCloseButton={false} className="inset-y-0 left-0 right-auto flex h-dvh max-h-dvh w-72 max-w-[82vw] flex-col gap-0 rounded-none p-3 sm:inset-y-0 sm:left-0 sm:right-auto sm:top-0 sm:h-dvh sm:max-h-dvh sm:w-72 sm:max-w-[82vw] sm:translate-x-0 sm:translate-y-0 sm:rounded-none">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="size-4 text-primary" />
                会话管理
                <span aria-hidden="true" className="text-xs font-normal text-muted-foreground">{sessions.length}</span>
              </DialogTitle>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setMobileOpenState(false)} aria-label="关闭侧边栏">
                <X className="size-4" />
              </Button>
            </div>
            <DialogDescription>选择会话继续创作，记录仅保存在本机。</DialogDescription>
          </DialogHeader>
          <div className="border-b py-3">
            <Button type="button" size="sm" variant="outline" className="w-full gap-2" onClick={openCreateDialog} disabled={busy}>
              <Plus className="size-4" />
              新建会话
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
            {renderSessionItems(true)}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={nameDialog !== null}
        onOpenChange={open => {
          if (!open && !busy) setNameDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={event => void handleNameSubmit(event)}>
            <DialogHeader>
              <DialogTitle>{nameDialog?.mode === 'create' ? '新建会话' : '重命名会话'}</DialogTitle>
              <DialogDescription>
                会话记录分别保存在本机，仅当前会话会载入 Agent。
              </DialogDescription>
            </DialogHeader>
            <label className="mt-4 block space-y-1.5 text-sm">
              <span>会话名称</span>
              <Input
                autoFocus
                aria-label="会话名称"
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
                maxLength={80}
              />
            </label>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setNameDialog(null)} disabled={busy}>
                取消
              </Button>
              <Button type="submit" disabled={!nameDraft.trim() || busy}>
                {nameDialog?.mode === 'create' ? '创建' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!busy && !open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确定删除{deleteTarget?.name}吗？该会话的聊天记录和图片将从本机清除，且无法恢复。
            </DialogDescription>
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={busy}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
