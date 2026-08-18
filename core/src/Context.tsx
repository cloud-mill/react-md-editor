import React from 'react';
import { ICommand, TextAreaCommandOrchestrator } from './commands/';
import { MDEditorProps } from './Types';

export type PreviewType = 'live' | 'edit' | 'preview';

export interface ContextStore {
  components?: MDEditorProps['components'];
  commands?: ICommand<string>[];
  extraCommands?: ICommand<string>[];
  markdown?: string;
  preview?: PreviewType;
  height?: React.CSSProperties['height'];
  fullscreen?: boolean;
  highlightEnable?: boolean;
  autoFocus?: boolean;
  autoFocusEnd?: boolean;
  textarea?: HTMLTextAreaElement;
  commandOrchestrator?: TextAreaCommandOrchestrator;
  textareaWarp?: HTMLDivElement;
  textareaPre?: HTMLPreElement;
  container?: HTMLDivElement | null;
  dispatch?: React.Dispatch<ContextStore>;
  barPopup?: Record<string, boolean>;
  scrollTop?: number;
  scrollTopPreview?: number;
  tabSize?: number;
  defaultTabEnable?: boolean;
  [key: string]: any;
}

export type ExecuteCommandState = Pick<ContextStore, 'fullscreen' | 'preview' | 'highlightEnable'>;

export function reducer(state: ContextStore, action: ContextStore) {
  for (const key in action) {
    if (!Object.is(state[key], action[key])) {
      return { ...state, ...action };
    }
  }
  // Nothing actually changed — keep the same reference so React can bail out
  // of re-rendering the whole editor tree.
  return state;
}

export const EditorContext = React.createContext<ContextStore>({ markdown: '' });
