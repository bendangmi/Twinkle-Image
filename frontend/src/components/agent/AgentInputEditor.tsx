'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { isImeComposing } from '@/lib/keyboard';
import type { AgentImageRecord } from '@/lib/agent-chat-config';

export interface AgentInputEditorHandle {
  getText(): string;
  getImageReferences(): string[];
  setText(text: string): void;
  clear(): void;
  focus(): void;
}

interface AgentInputEditorProps {
  images: AgentImageRecord[];
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (text: string, imageRefs: string[]) => void;
  onInputChange?: (hasContent: boolean) => void;
}

export const AgentInputEditor = forwardRef<AgentInputEditorHandle, AgentInputEditorProps>(
  function AgentInputEditor({ images, disabled = false, placeholder = '', onSubmit, onInputChange }, ref) {
    const editorRef = useRef<HTMLDivElement>(null);
    const [showMentionPopup, setShowMentionPopup] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const mentionStartPosRef = useRef<number | null>(null);
    const mentionPopupRef = useRef<HTMLDivElement>(null);

    const filteredImages = mentionSearch
      ? images.filter(img => img.imgId.includes(mentionSearch) || img.description.includes(mentionSearch))
      : images;

    const hasContent = useCallback((): boolean => {
      if (!editorRef.current) return false;
      const text = editorRef.current.innerText ?? '';
      const stripped = text.replace(/\u200B/g, '').trim();
      return stripped.length > 0;
    }, []);

    const notifyInputChange = useCallback(() => {
      onInputChange?.(hasContent());
    }, [hasContent, onInputChange]);

    // 暴露给父组件的方法
    useImperativeHandle(ref, () => ({
      getText(): string {
        if (!editorRef.current) return '';
        const clone = editorRef.current.cloneNode(true) as HTMLElement;
        // 将 mention-tag 替换为 @img_N 文本
        const mentionTags = clone.querySelectorAll('.mention-tag');
        for (const tag of mentionTags) {
          const imgId = tag.getAttribute('data-img-id') || '';
          tag.replaceWith(`@${imgId}`);
        }
        return (clone.innerText ?? '').replace(/\u200B/g, '').trim();
      },
      getImageReferences(): string[] {
        if (!editorRef.current) return [];
        const ids: string[] = [];
        const tags = editorRef.current.querySelectorAll('.mention-tag');
        for (const tag of tags) {
          const id = tag.getAttribute('data-img-id');
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      },
      clear(): void {
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
          // 保留零宽空格占位以防止 :empty 伪类闪烁
          const textNode = document.createTextNode('\u200B');
          editorRef.current.appendChild(textNode);
        }
        setShowMentionPopup(false);
        notifyInputChange();
      },
      setText(text: string): void {
        if (editorRef.current) {
          editorRef.current.innerHTML = '';
          const textNode = document.createTextNode(text);
          editorRef.current.appendChild(textNode);
        }
        notifyInputChange();
      },
      focus(): void {
        editorRef.current?.focus();
      },
    }), [notifyInputChange]);

    // 处理内容变化
    const handleInput = useCallback(() => {
      notifyInputChange();
    }, [notifyInputChange]);

    // 插入提及标签
    const insertMentionTag = useCallback((imgId: string) => {
      if (!editorRef.current) return;
      // 从 @ 到当前输入之间删除
      const selection = window.getSelection();
      if (!selection) return;

      // 移除之前输入的@搜索文本
      const range = selection.getRangeAt(0);
      if (mentionStartPosRef.current !== null) {
        // 找到 @ 字符所在的文本节点
        const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT, null);
        let node: Text | null;
        let accumulated = 0;
        let foundNode: Text | null = null;
        let foundOffset = 0;
        while ((node = walker.nextNode() as Text | null)) {
          const len = node.textContent?.length ?? 0;
          if (accumulated + len >= mentionStartPosRef.current) {
            foundNode = node;
            foundOffset = mentionStartPosRef.current - accumulated;
            break;
          }
          accumulated += len;
        }
        if (foundNode && foundNode.textContent) {
          const before = foundNode.textContent.slice(0, foundOffset);
          const after = foundNode.textContent.slice(foundOffset + (mentionSearch.length > 0 ? mentionSearch.length + 1 : 1));
          foundNode.textContent = before + after;
          // 将光标移动到删除后的位置
          const newRange = document.createRange();
          newRange.setStart(foundNode, before.length);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
      mentionStartPosRef.current = null;

      // 插入提及标签
      const tag = document.createElement('span');
      tag.className = 'mention-tag';
      tag.contentEditable = 'false';
      tag.dataset.imgId = imgId;
      tag.textContent = `@${imgId}`;

      // 样式
      tag.style.cssText = `
        display: inline-block;
        background: rgba(99, 102, 241, 0.12);
        color: rgb(99, 102, 241);
        border-radius: 4px;
        padding: 0 4px;
        font-size: inherit;
        cursor: pointer;
        white-space: nowrap;
      `;

      range.deleteContents();
      range.insertNode(tag);

      // 在 tag 后加一个空格，并设置光标
      const spacer = document.createTextNode('\u00A0');
      tag.parentNode?.insertBefore(spacer, tag.nextSibling);
      const newRange = document.createRange();
      newRange.setStartAfter(spacer);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      setShowMentionPopup(false);
      setMentionSearch('');
      notifyInputChange();
    }, [mentionSearch, notifyInputChange]);

    // 键盘事件
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isImeComposing(e)) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!editorRef.current) return;
        const text = editorRef.current.innerText.replace(/\u200B/g, '').trim();
        if (text.length === 0) return;
        setShowMentionPopup(false);
        onSubmit(text, []);
        return;
      }

      if (showMentionPopup) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          setShowMentionPopup(false);
          mentionStartPosRef.current = null;
          e.preventDefault();
          return;
        }
      }

      // Backspace: 如果光标紧跟在 mention-tag 后面，删除整个 tag
      if (e.key === 'Backspace') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (range.collapsed && range.startOffset === 0) {
            const prev = range.startContainer.previousSibling;
            if (prev instanceof HTMLElement && prev.classList.contains('mention-tag')) {
              e.preventDefault();
              prev.remove();
              notifyInputChange();
              return;
            }
          }
        }
      }
    }, [showMentionPopup, onSubmit, notifyInputChange]);

    // 按键抬起检测 @ 符号
    const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === '@') {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType === Node.TEXT_NODE) {
          const offset = range.startOffset;
          const text = (textNode.textContent ?? '');
          // 向前搜索最近的 @
          const atIdx = text.lastIndexOf('@', offset - 1);
          if (atIdx >= 0) {
            // 检查 @ 前面没有字母（不是 email 等情况）
            const charBefore = text[atIdx - 1];
            if (charBefore === undefined || charBefore === ' ' || charBefore === '\u00A0' || charBefore === '\n') {
              // 计算全局位置
              mentionStartPosRef.current = getGlobalOffset(editorRef.current!, textNode, atIdx);
              setMentionSearch('');
              setShowMentionPopup(true);
            }
          }
        }
      }

      // 如果在提及弹出框打开时输入，更新搜索词
      if (showMentionPopup) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const textNode = sel.getRangeAt(0).startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const text = textNode.textContent ?? '';
            const offset = sel.getRangeAt(0).startOffset;
            if (mentionStartPosRef.current !== null) {
              // 获取 @ 后的文本
              const globalOffset = getGlobalOffset(editorRef.current!, textNode, 0);
              const searchLen = globalOffset !== null && mentionStartPosRef.current !== null
                ? Math.max(0, globalOffset + offset - mentionStartPosRef.current - 1)
                : 0;
              const searchText = offset >= 0 ? text.slice(Math.max(0, offset - searchLen), offset) : '';
              setMentionSearch(searchText);
            }
          }
        }
      }
    }, [showMentionPopup]);

    // 点击空白区域关闭弹出框
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          mentionPopupRef.current &&
          !mentionPopupRef.current.contains(e.target as Node) &&
          editorRef.current &&
          !editorRef.current.contains(e.target as Node)
        ) {
          setShowMentionPopup(false);
          mentionStartPosRef.current = null;
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 粘贴时只插入纯文本，丢弃 HTML 格式
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      // 用 insertText 命令插入，保留 undo 栈且只插入纯文本
      document.execCommand('insertText', false, text);
    }, []);

    // 初始化占位符
    useEffect(() => {
      if (editorRef.current && !editorRef.current.textContent) {
        editorRef.current.innerHTML = '\u200B';
      }
    }, []);

    return (
      <div className="relative flex-1">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          className={cn(
            'min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 shadow-none focus-visible:outline-none max-h-[7rem] overflow-y-auto whitespace-pre-wrap break-words',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          data-placeholder={placeholder}
          style={{ wordBreak: 'break-word' }}
          suppressContentEditableWarning
        />
        {/* 提及弹出框 */}
        {showMentionPopup && filteredImages.length > 0 && (
          <div
            ref={mentionPopupRef}
            className="absolute bottom-full left-0 z-50 mb-1 w-56 rounded-lg border bg-popover p-1 shadow-lg"
          >
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filteredImages.slice(0, 20).map(img => (
                <button
                  key={img.imgId}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => insertMentionTag(img.imgId)}
                  title={img.description}
                >
                  <img
                    src={img.thumbnail}
                    alt={img.imgId}
                    className="h-6 w-6 flex-shrink-0 rounded object-cover"
                  />
                  <span className="truncate font-medium">{img.imgId}</span>
                  <span className="truncate text-xs text-muted-foreground">{img.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <style jsx>{`
          div[contenteditable]:empty:before,
          div[contenteditable] > :first-child:empty:before {
            content: attr(data-placeholder);
            color: hsl(var(--muted-foreground));
            pointer-events: none;
            display: block;
          }
        `}</style>
      </div>
    );
  }
);

/** 计算 textNode 中 offset 位置的全局字符偏移 */
function getGlobalOffset(root: Node, targetNode: Node, offset: number): number {
  let globalIdx = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node === targetNode) return globalIdx + offset;
    globalIdx += (node.textContent ?? '').length;
  }
  return globalIdx + offset;
}
