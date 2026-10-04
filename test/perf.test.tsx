/**
 * @jest-environment jsdom
 */
// Typing + scroll latency harness for the MD editor (before/after comparison).
import React from 'react';
import { render, fireEvent, screen, act } from '@testing-library/react';
import MDEditor from '../core/src';

const paragraph = `## Heading

Some *markdown* with a [link](https://example.com) and \`inline code\`.

\`\`\`js
function hello(name) {
  return 'hello ' + name;
}
\`\`\`

- item one
- item two
`;

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = React.useState(initial);
  return <MDEditor value={value} onChange={(v) => setValue(v || '')} textareaProps={{ title: 'perf' }} />;
}

it('typing latency', () => {
  const doc = paragraph.repeat(40); // ~6.5KB
  render(<Harness initial={doc} />);
  const input = screen.getByTitle('perf') as HTMLTextAreaElement;

  // warmup
  fireEvent.change(input, { target: { value: doc + 'a' } });

  const N = 30;
  const t0 = performance.now();
  let cur = doc;
  for (let i = 0; i < N; i++) {
    cur += 'x';
    fireEvent.change(input, { target: { value: cur } });
  }
  const t1 = performance.now();
  console.log(`TYPING: ${((t1 - t0) / N).toFixed(2)} ms/keystroke (doc ${(doc.length / 1024).toFixed(1)}KB)`);

  // scroll latency: fire scroll events on the wrapper
  const warp = document.querySelector('.w-md-editor-area') as HTMLDivElement;
  const S = 50;
  const t2 = performance.now();
  for (let i = 0; i < S; i++) {
    act(() => {
      fireEvent.scroll(warp, { target: { scrollTop: i * 10 } });
    });
  }
  const t3 = performance.now();
  console.log(`SCROLL: ${((t3 - t2) / S).toFixed(2)} ms/event`);
});
