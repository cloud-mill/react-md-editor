/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MDEditor from '../core/src';
import { splitBlocks, computeBlockState, type BlockState } from '../core/src/components/TextArea/Markdown';
import { reducer, type ContextStore } from '../core/src/Context';

function ControlledEditor(props: { initial?: string; tabSize?: number }) {
  const [value, setValue] = React.useState(props.initial ?? '');
  return (
    <MDEditor
      value={value}
      tabSize={props.tabSize}
      textareaProps={{ title: 'test' }}
      onChange={(v) => setValue(v || '')}
    />
  );
}

describe('Textarea keyboard handling', () => {
  it('Tab inserts exactly `tabSize` spaces', () => {
    render(<ControlledEditor initial="hello" tabSize={2} />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    expect(input).toHaveValue('  hello');
  });

  it('Tab respects an updated tabSize prop (no stale keydown closure)', () => {
    const { rerender } = render(<ControlledEditor initial="hello" tabSize={2} />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    rerender(<ControlledEditor initial="hello" tabSize={6} />);
    input.focus();
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: 'Tab', code: 'Tab' });
    expect(input.value.length - input.value.trimStart().length).toBe(6);
  });

  it('ctrl+b keyboard shortcut wraps the selection in bold markers', () => {
    render(<ControlledEditor initial="title" />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    input.focus();
    input.setSelectionRange(0, 5);
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(input).toHaveValue('**title**');
  });

  it('Enter continues an unordered list', () => {
    render(<ControlledEditor initial="- item" />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    input.focus();
    input.setSelectionRange(6, 6);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(input).toHaveValue('- item\n- ');
  });

  it('calls a user-supplied onKeyDown from textareaProps', () => {
    const onKeyDown = jest.fn();
    render(<MDEditor value="" textareaProps={{ title: 'test', onKeyDown }} />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    fireEvent.keyDown(input, { key: 'a', code: 'KeyA' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});

describe('editing pane highlight', () => {
  it('renders Prism tokens for markdown syntax', () => {
    const { container } = render(<MDEditor value="## Heading" textareaProps={{ title: 'test' }} />);
    const pre = container.querySelector('.w-md-editor-text-pre');
    expect(pre).toBeInTheDocument();
    expect(pre!.querySelector('code .token')).not.toBeNull();
  });

  it('renders an empty highlight pane without crashing for empty value', () => {
    const { container } = render(<MDEditor value="" textareaProps={{ title: 'test' }} />);
    expect(container.querySelector('.w-md-editor-text-pre')).toBeInTheDocument();
  });

  it('escapes HTML in the highlight pane', () => {
    const { container } = render(<MDEditor value={'<img src=x onerror=alert(1)>'} textareaProps={{ title: 'test' }} />);
    const pre = container.querySelector('.w-md-editor-text-pre');
    expect(pre!.querySelector('img')).toBeNull();
  });

  it('renders text byte-identical to the document (block splitting is lossless)', () => {
    const doc = '# Title\n\n\npara **bold**\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\n- item\n';
    const { container } = render(<MDEditor value={doc} textareaProps={{ title: 'test' }} />);
    const pre = container.querySelector('.w-md-editor-text-pre');
    expect(pre!.textContent).toBe(doc + '\n');
  });

  it('keeps unchanged blocks\' DOM nodes when another block is edited (incremental)', () => {
    const doc = '# First block\n\nsecond block\n\nthird block';
    render(<ControlledEditor initial={doc} />);
    const input = screen.getByTitle<HTMLTextAreaElement>('test');
    const firstSpan = document.querySelector('.w-md-editor-text-pre code > span');
    expect(firstSpan).not.toBeNull();
    fireEvent.change(input, { target: { value: doc + ' edited' } });
    // The third block changed; the first block's element must be the same node.
    expect(document.querySelector('.w-md-editor-text-pre code > span')).toBe(firstSpan);
  });
});

describe('splitBlocks', () => {
  it('reconstructs the document exactly', () => {
    const docs = [
      '',
      'one line',
      'a\n\nb\n\n\nc\n',
      '# h\n\n```\ncode\n\nstill code\n```\n\ntail',
      '\n\nleading blanks\n\n> quote\n> more\n\n| a | b |\n| - | - |\n',
    ];
    for (const doc of docs) {
      expect(splitBlocks(doc).join('\n')).toBe(doc);
    }
  });

  it('keeps a fenced code block with blank lines as one block', () => {
    const blocks = splitBlocks('before\n\n```js\nline\n\nline after blank\n```\n\nafter');
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toContain('line after blank');
  });
});

describe('computeBlockState (incremental splitting)', () => {
  // Deterministic PRNG so failures are reproducible.
  const makeRng = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const PIECES = ['# h', 'text **b**', '', '', '```', 'code', '~~~', '- li', '> q', '| a |', '   ', 'x'];

  it('always matches a from-scratch split across random edit sequences', () => {
    const rng = makeRng(42);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
    for (let run = 0; run < 25; run++) {
      const lineCount = 1 + Math.floor(rng() * 30);
      let doc = Array.from({ length: lineCount }, () => pick(PIECES)).join('\n');
      let state: BlockState | undefined;
      for (let step = 0; step < 40; step++) {
        state = computeBlockState(doc, true, state);
        expect(state.blocks).toEqual(splitBlocks(doc));
        expect(state.blocks.join('\n')).toBe(doc);
        // random edit: insert, delete, or replace at a random position
        const posValue = Math.floor(rng() * (doc.length + 1));
        const op = rng();
        if (op < 0.45) {
          doc = doc.slice(0, posValue) + pick(['x', '\n', '\n\n', '`', '```\n', '# ']) + doc.slice(posValue);
        } else if (op < 0.8 && doc.length > 0) {
          doc = doc.slice(0, posValue) + doc.slice(Math.min(doc.length, posValue + 1 + Math.floor(rng() * 5)));
        } else {
          doc = doc.slice(0, posValue) + pick(PIECES) + doc.slice(posValue);
        }
      }
    }
  });

  it('reuses block HTML outside the edited region', () => {
    const doc = '# one\n\ntwo\n\nthree\n\nfour';
    const s1 = computeBlockState(doc, true);
    const s2 = computeBlockState(doc.replace('three', 'three!'), true, s1);
    expect(s2.htmls[0]).toBe(s1.htmls[0]);
    expect(s2.htmls[3]).toBe(s1.htmls[3]);
    expect(s2.htmls[2]).not.toBe(s1.htmls[2]);
  });
});

describe('DragBar', () => {
  it('supports keyboard resizing', () => {
    const { container } = render(<MDEditor value="" height={200} textareaProps={{ title: 'test' }} />);
    const bar = screen.getByRole('separator');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    const root = container.firstChild as HTMLDivElement;
    expect(root.style.height).toBe('210px');
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(root.style.height).toBe('200px');
  });
});

describe('Context reducer', () => {
  it('returns the same state reference when nothing changed', () => {
    const state: ContextStore = { markdown: 'a', scrollTop: 10 };
    expect(reducer(state, { markdown: 'a' })).toBe(state);
    expect(reducer(state, { scrollTop: 10, markdown: 'a' })).toBe(state);
  });

  it('returns a new merged state when a value changed', () => {
    const state: ContextStore = { markdown: 'a', scrollTop: 10 };
    const next = reducer(state, { markdown: 'b' });
    expect(next).not.toBe(state);
    expect(next.markdown).toBe('b');
    expect(next.scrollTop).toBe(10);
  });
});
