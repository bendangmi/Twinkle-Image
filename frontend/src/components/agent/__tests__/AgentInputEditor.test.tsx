import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentInputEditor } from '../AgentInputEditor';

describe('AgentInputEditor', () => {
  it('does not submit when Enter confirms an IME composition', () => {
    const onSubmit = vi.fn();
    render(<AgentInputEditor images={[]} onSubmit={onSubmit} />);

    const editor = screen.getByRole('textbox');
    editor.innerText = 'tabbar';
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('still submits on a regular Enter key', () => {
    const onSubmit = vi.fn();
    render(<AgentInputEditor images={[]} onSubmit={onSubmit} />);

    const editor = screen.getByRole('textbox');
    editor.innerText = 'tabbar';
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledWith('tabbar', []);
  });
});
