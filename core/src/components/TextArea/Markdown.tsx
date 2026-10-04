import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { refractor } from 'refractor/core';
import markdownLanguage from 'refractor/markdown';
import { toHtml } from 'hast-util-to-html';
import { type IProps } from '../../Types';
import { EditorContext } from '../../Context';

refractor.register(markdownLanguage);

function html2Escape(sHtml: string) {
  return sHtml.replace(
    /[<&"]/g,
    (c: string) => (({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }) as Record<string, string>)[c],
  );
}

const FENCE_RE = /^\s{0,3}(?:>\s*)?(`{3,}|~{3,})/;

/**
 * Line-by-line block scanner. Blocks split at blank lines, with fenced code
 * (including inside blockquotes) kept intact. Every character of the input
 * lands in exactly one block, so `blocks.join('\n') === text.slice(startPos)`.
 *
 * `align`, when given, is consulted at each new block boundary; returning a
 * value >= 0 stops the scan early — the caller splices previously computed
 * blocks for the untouched tail instead of re-scanning it.
 */
function scanBlocks(
  text: string,
  startPos: number,
  align?: (offset: number) => number,
): { blocks: string[]; alignedIndex: number } {
  const blocks: string[] = [];
  let blockStart = startPos;
  let hasContent = false;
  let prevBlank = false;
  let inFence = false;
  let fence = '';
  let pos = startPos;
  for (;;) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(pos, lineEnd);
    const blank = !inFence && line.trim() === '';
    if (!blank && !inFence && hasContent && prevBlank) {
      // Non-blank line after trailing blank line(s): a new block starts here.
      blocks.push(text.slice(blockStart, pos - 1));
      blockStart = pos;
      hasContent = false;
      if (align) {
        const idx = align(pos);
        if (idx >= 0) return { blocks, alignedIndex: idx };
      }
    }
    if (!blank) hasContent = true;
    prevBlank = blank;
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fence = fenceMatch[1];
      } else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        inFence = false;
      }
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  blocks.push(text.slice(blockStart));
  return { blocks, alignedIndex: -1 };
}

/** Full split — exported for tests and as the reference the incremental path must match. */
export function splitBlocks(markdown: string): string[] {
  return scanBlocks(markdown, 0).blocks;
}

function renderBlock(text: string, highlight: boolean): string {
  if (highlight) {
    try {
      return toHtml(refractor.highlight(text, 'markdown'));
    } catch (error) {
      // Highlighting must never break editing; fall back to plain text.
    }
  }
  return html2Escape(text);
}

export interface BlockState {
  markdown: string;
  highlight: boolean;
  blocks: string[];
  htmls: string[];
  /** Character offset of each block's start; blocks[i] spans [starts[i], starts[i] + blocks[i].length). */
  starts: number[];
}

function fullBlockState(markdown: string, highlight: boolean): BlockState {
  const blocks = splitBlocks(markdown);
  return {
    markdown,
    highlight,
    blocks,
    htmls: blocks.map((b) => renderBlock(b, highlight)),
    starts: blockStarts(blocks),
  };
}

function blockStarts(blocks: string[]): number[] {
  const starts = new Array<number>(blocks.length);
  let pos = 0;
  for (let i = 0; i < blocks.length; i++) {
    starts[i] = pos;
    pos += blocks[i].length + 1; // + '\n' joiner
  }
  return starts;
}

/**
 * Incrementally derive the block state for `markdown` from `prev`.
 *
 * A character-level common prefix/suffix bounds the edit; only blocks touching
 * it are re-split and re-highlighted. The scan re-joins the previous state at
 * the first block boundary that lands inside the common suffix on a previous
 * block start (block starts are always outside fences, so scanner state
 * matches by construction). A worst-case edit — e.g. typing ``` mid-document,
 * which re-fences everything after it — degrades gracefully to a full re-scan.
 *
 * Invariant (property-tested): blocks always equal `splitBlocks(markdown)`.
 */
export function computeBlockState(markdown: string, highlight: boolean, prev?: BlockState): BlockState {
  if (!prev || prev.highlight !== highlight) return fullBlockState(markdown, highlight);
  const a = prev.markdown;
  const b = markdown;
  if (a === b) return prev;

  // Character-level common prefix / suffix (non-overlapping).
  const minLen = Math.min(a.length, b.length);
  let p = 0;
  while (p < minLen && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  const aEnd = a.length - 1;
  const bEnd = b.length - 1;
  while (s < minLen - p && a.charCodeAt(aEnd - s) === b.charCodeAt(bEnd - s)) s++;

  // First block that might be affected: the one containing the first changed
  // character, minus one — an edit at a block's first line can dissolve the
  // boundary and merge it into its predecessor.
  let fi = prev.starts.length - 1;
  for (let i = 0; i < prev.starts.length; i++) {
    if (prev.starts[i] > p) {
      fi = i - 1;
      break;
    }
  }
  fi = Math.max(0, fi - 1);

  const delta = b.length - a.length;
  const suffixStartInB = b.length - s;
  // Splice back into `prev` when a new block boundary lands on a previous
  // block start within the byte-identical suffix.
  const align = (offset: number): number => {
    if (offset < suffixStartInB) return -1;
    const target = offset - delta;
    let lo = fi + 1;
    let hi = prev.starts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (prev.starts[mid] === target) return mid;
      if (prev.starts[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  };

  const { blocks: midBlocks, alignedIndex } = scanBlocks(b, prev.starts[fi], align);

  // Reuse HTML for re-split middle blocks whose text is unchanged (typically
  // the safety-margin block above the edit).
  const oldEnd = alignedIndex >= 0 ? alignedIndex : prev.blocks.length;
  const midHtmls = midBlocks.map((text, i) => {
    const oldIdx = fi + i;
    if (oldIdx < oldEnd && prev.blocks[oldIdx] === text) return prev.htmls[oldIdx];
    return renderBlock(text, highlight);
  });

  const blocks = prev.blocks.slice(0, fi).concat(midBlocks, alignedIndex >= 0 ? prev.blocks.slice(alignedIndex) : []);
  const htmls = prev.htmls.slice(0, fi).concat(midHtmls, alignedIndex >= 0 ? prev.htmls.slice(alignedIndex) : []);
  return { markdown: b, highlight, blocks, htmls, starts: blockStarts(blocks) };
}

/**
 * One highlighted block. Memoized on its HTML string, so unchanged blocks
 * skip re-render entirely and keep their DOM nodes — the browser re-parses
 * only the block that actually changed.
 *
 * Rendered as a block-level box (see `-text-block` in index.less): each block
 * is its own formatting context, so editing one block re-runs line layout for
 * that block alone instead of the whole document. Stacked block boxes produce
 * the same line geometry as newline-joined inline content, keeping the
 * overlay aligned with the textarea.
 */
const Block = React.memo(function Block({ html, className }: { html: string; className: string }) {
  // The trailing '\n' lives inside the box: CSS "hangs" a forced break at the
  // end of a block box, so each block needs its own terminator to occupy the
  // same lines as the newline-joined text in the textarea.
  return <span className={className} dangerouslySetInnerHTML={{ __html: html + '\n' }} />;
});

export interface MarkdownProps extends IProps, React.HTMLAttributes<HTMLPreElement> {}

export default function Markdown(props: MarkdownProps) {
  const { prefixCls } = props;
  const { markdown = '', highlightEnable, dispatch } = useContext(EditorContext);
  const preRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (preRef.current && dispatch) {
      dispatch({ textareaPre: preRef.current });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stateRef = useRef<BlockState>();
  const htmls = useMemo(() => {
    if (!markdown) {
      stateRef.current = undefined;
      return [];
    }
    const next = computeBlockState(markdown, !!highlightEnable, stateRef.current);
    stateRef.current = next;
    return next.htmls;
  }, [markdown, highlightEnable]);

  // Memoized on the htmls array identity so renders that don't change the
  // document (e.g. the deferred preview pass) skip re-creating and re-diffing
  // one element per block.
  const blockClassName = `${prefixCls}-text-block`;
  const children = useMemo(
    () => htmls.map((html, idx) => <Block key={idx} html={html} className={blockClassName} />),
    [htmls, blockClassName],
  );

  return (
    <pre ref={preRef} className={`language-markdown ${prefixCls}-text-pre wmde-markdown-color`}>
      <code className="language-markdown">{children}</code>
    </pre>
  );
}
