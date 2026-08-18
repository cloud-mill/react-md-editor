/**
 * The editing pane only ever highlights the `markdown` grammar, so the
 * "common" build no longer needs its own implementation — kept as a re-export
 * for compatibility with deep imports.
 */
export { default, type MarkdownProps } from './Markdown';
