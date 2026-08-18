import React, { useContext, useEffect, useMemo } from 'react';
import { type IProps } from '../../Types';
import { EditorContext, type ExecuteCommandState } from '../../Context';
import { TextAreaCommandOrchestrator } from '../../commands/';
import handleKeyDown from './handleKeyDown';
import shortcuts from './shortcuts';
import './index.less';

export interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>, IProps {}

export default function Textarea(props: TextAreaProps) {
  const { prefixCls, onChange, onKeyDown, ...other } = props;
  const {
    markdown,
    commands,
    fullscreen,
    preview,
    highlightEnable,
    extraCommands,
    tabSize,
    defaultTabEnable,
    autoFocusEnd,
    textareaWarp,
    dispatch,
  } = useContext(EditorContext);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const executeRef = React.useRef<TextAreaCommandOrchestrator>();
  const statesRef = React.useRef<ExecuteCommandState>({ fullscreen, preview, highlightEnable });

  useEffect(() => {
    statesRef.current = { fullscreen, preview, highlightEnable };
  }, [fullscreen, preview, highlightEnable]);

  useEffect(() => {
    if (textRef.current && dispatch) {
      const commandOrchestrator = new TextAreaCommandOrchestrator(textRef.current);
      executeRef.current = commandOrchestrator;
      dispatch({ textarea: textRef.current, commandOrchestrator });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoFocusEnd && textRef.current && textareaWarp) {
      textRef.current.focus();
      const length = textRef.current.value.length;
      textRef.current.setSelectionRange(length, length);
      setTimeout(() => {
        if (textareaWarp) {
          textareaWarp.scrollTop = textareaWarp.scrollHeight;
        }
        if (textRef.current) {
          textRef.current.scrollTop = textRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [autoFocusEnd, textareaWarp]);

  const allCommands = useMemo(() => [...(commands || []), ...(extraCommands || [])], [commands, extraCommands]);

  const onKeyDownHandle = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    handleKeyDown(e, tabSize, defaultTabEnable);
    shortcuts(e, allCommands, executeRef.current, dispatch, statesRef.current);
    onKeyDown && onKeyDown(e);
  };

  return (
    <textarea
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      {...other}
      ref={textRef}
      className={`${prefixCls}-text-input ${other.className ? other.className : ''}`}
      value={markdown}
      onKeyDown={onKeyDownHandle}
      onChange={(e) => {
        dispatch && dispatch({ markdown: e.target.value });
        onChange && onChange(e);
      }}
    />
  );
}
