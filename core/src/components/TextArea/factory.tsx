import React, { useEffect, Fragment, useContext, JSX } from 'react';
import type * as CSS from 'csstype';
import { EditorContext, type ContextStore, type ExecuteCommandState } from '../../Context';
import shortcuts from './shortcuts';
import Textarea, { type TextAreaProps } from './Textarea';
import { type IProps } from '../../Types';
import { TextAreaCommandOrchestrator, type ICommand } from '../../commands/';
import './index.less';

export type RenderTextareaHandle = {
  dispatch: ContextStore['dispatch'];
  onChange?: TextAreaProps['onChange'];
  useContext?: {
    commands: ContextStore['commands'];
    extraCommands: ContextStore['extraCommands'];
    commandOrchestrator?: TextAreaCommandOrchestrator;
  };
  shortcuts?: (
    e: KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>,
    commands: ICommand[],
    commandOrchestrator?: TextAreaCommandOrchestrator,
    dispatch?: React.Dispatch<ContextStore>,
    state?: ExecuteCommandState,
  ) => void;
};

export interface ITextAreaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onScroll'>, IProps {
  value?: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  renderTextarea?: (
    props: React.TextareaHTMLAttributes<HTMLTextAreaElement> | React.HTMLAttributes<HTMLDivElement>,
    opts: RenderTextareaHandle,
  ) => JSX.Element;
}

export type TextAreaRef = {
  text?: HTMLTextAreaElement;
  warp?: HTMLDivElement;
};

type MarkdownComponent = React.ComponentType<{ prefixCls?: string }>;

const emptyTextStyle: CSS.Properties = {};
const plainTextStyle: CSS.Properties = { WebkitTextFillColor: 'initial', overflow: 'auto' };
const renderTextareaStyle: CSS.Properties = { WebkitTextFillColor: 'inherit', overflow: 'auto' };

export function createTextArea(options?: { Markdown?: MarkdownComponent; useMinHeight?: boolean }) {
  const MarkdownComponent = options?.Markdown;
  const useMinHeight = options?.useMinHeight ?? false;

  return function TextArea(props: ITextAreaProps) {
    const { prefixCls, className, onScroll, renderTextarea, ...otherProps } = props || {};
    const { markdown, scrollTop, commands, minHeight, highlightEnable, extraCommands, dispatch } =
      useContext(EditorContext);
    const textRef = React.useRef<HTMLTextAreaElement>(null);
    const executeRef = React.useRef<TextAreaCommandOrchestrator>();
    const warp = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
      const state: ContextStore = {};
      if (warp.current) {
        state.textareaWarp = warp.current || undefined;
        warp.current.scrollTop = scrollTop || 0;
      }
      // Only populated in the `renderTextarea` path — the default path's
      // orchestrator is created by the inner <Textarea /> component.
      if (textRef.current) {
        const commandOrchestrator = new TextAreaCommandOrchestrator(textRef.current);
        executeRef.current = commandOrchestrator;
        state.textarea = textRef.current;
        state.commandOrchestrator = commandOrchestrator;
      }
      if (dispatch) {
        dispatch({ ...state });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const textStyle: CSS.Properties = MarkdownComponent && highlightEnable ? emptyTextStyle : plainTextStyle;

    return (
      <div ref={warp} className={`${prefixCls}-area ${className || ''}`} onScroll={onScroll}>
        <div className={`${prefixCls}-text`} style={useMinHeight ? { minHeight } : undefined}>
          {renderTextarea ? (
            React.cloneElement(
              renderTextarea(
                {
                  ...otherProps,
                  value: markdown,
                  autoComplete: 'off',
                  autoCorrect: 'off',
                  spellCheck: 'false',
                  autoCapitalize: 'off',
                  className: `${prefixCls}-text-input`,
                  style: renderTextareaStyle,
                },
                {
                  dispatch,
                  onChange: otherProps.onChange,
                  shortcuts,
                  useContext: { commands, extraCommands, commandOrchestrator: executeRef.current },
                },
              ),
              {
                ref: textRef,
              },
            )
          ) : (
            <Fragment>
              {MarkdownComponent && highlightEnable && <MarkdownComponent prefixCls={prefixCls} />}
              <Textarea prefixCls={prefixCls} {...otherProps} style={textStyle} />
            </Fragment>
          )}
        </div>
      </div>
    );
  };
}
