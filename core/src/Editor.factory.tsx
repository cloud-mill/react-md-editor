import React, { useCallback, useEffect, useReducer, useMemo, useRef, useState, useImperativeHandle } from 'react';
import { ToolbarVisibility } from './components/Toolbar/';
import DragBar from './components/DragBar/';
import { getCommands, getExtraCommands, type ICommand, type TextState, TextAreaCommandOrchestrator } from './commands/';
import { reducer, EditorContext, type ContextStore } from './Context';
import type { MDEditorProps } from './Types';

function setGroupPopFalse(data: Record<string, boolean> = {}) {
  Object.keys(data).forEach((keyname) => {
    data[keyname] = false;
  });
  return data;
}

export interface RefMDEditor extends ContextStore {}

type PreviewComponent = React.ComponentType<any>;
type TextAreaComponent = React.ComponentType<any>;

const defaultPreviewOptions: NonNullable<MDEditorProps['previewOptions']> = {};

// On React 18+ the preview re-render is deferred so keystrokes stay responsive
// while the preview catches up; on older React versions it renders in the same
// pass (the previous behaviour). Resolved once at module load, so the hook
// call order is stable.
const useDeferredValueCompat: <T>(value: T) => T = (React as any).useDeferredValue || (<T,>(value: T): T => value);

// Delay before the latest scroll position is committed to the store. Scrolling
// itself is synchronised imperatively; the store only needs the settled value
// (it is read back when the textarea remounts, e.g. after a preview toggle).
const SCROLL_COMMIT_DELAY = 80;

// Above this document size the live preview stops tracking every keystroke and
// re-renders on a short typing pause instead. Deferred rendering alone is not
// enough at this scale: React eventually force-flushes a starved deferred
// update synchronously, which puts the whole-document markdown parse back on
// the keystroke path.
const LARGE_DOCUMENT_SIZE = 100_000;
const LARGE_DOCUMENT_PREVIEW_DELAY = 250;

export function createMDEditor<
  TMarkdownPreview extends PreviewComponent,
  TTextArea extends TextAreaComponent,
>(options: { MarkdownPreview: TMarkdownPreview; TextArea: TTextArea }) {
  const { MarkdownPreview, TextArea } = options;
  const PreviewComponent = MarkdownPreview as React.ComponentType<any>;
  const TextAreaComponent = TextArea as React.ComponentType<any>;

  const InternalMDEditor = React.forwardRef<RefMDEditor, MDEditorProps>(
    (props: MDEditorProps, ref: React.ForwardedRef<RefMDEditor>) => {
      const {
        prefixCls = 'w-md-editor',
        className,
        value: propsValue,
        commands: commandsProp,
        commandsFilter,
        direction,
        extraCommands: extraCommandsProp,
        height = 200,
        enableScroll = true,
        visibleDragbar = typeof props.visiableDragbar === 'boolean' ? props.visiableDragbar : true,
        highlightEnable = true,
        preview: previewType = 'live',
        fullscreen = false,
        overflow = true,
        previewOptions = defaultPreviewOptions,
        textareaProps,
        maxHeight = 1200,
        minHeight = 100,
        autoFocus,
        autoFocusEnd = false,
        tabSize = 2,
        defaultTabEnable = false,
        onChange,
        onStatistics,
        onHeightChange,
        hideToolbar,
        toolbarBottom = false,
        components,
        renderTextarea,
        ...other
      } = props || {};
      const commands = useMemo(() => commandsProp ?? getCommands(), [commandsProp]);
      const extraCommands = useMemo(() => extraCommandsProp ?? getExtraCommands(), [extraCommandsProp]);
      const cmds = useMemo(
        () =>
          commands.map((item) => (commandsFilter ? commandsFilter(item, false) : item)).filter(Boolean) as ICommand[],
        [commands, commandsFilter],
      );
      const extraCmds = useMemo(
        () =>
          extraCommands
            .map((item) => (commandsFilter ? commandsFilter(item, true) : item))
            .filter(Boolean) as ICommand[],
        [extraCommands, commandsFilter],
      );
      const [state, dispatch] = useReducer(reducer, {
        markdown: propsValue,
        preview: previewType,
        components,
        height,
        minHeight,
        highlightEnable,
        tabSize,
        defaultTabEnable,
        scrollTop: 0,
        scrollTopPreview: 0,
        commands: cmds,
        extraCommands: extraCmds,
        fullscreen,
        barPopup: {},
      });
      const container = useRef<HTMLDivElement>(null);
      const previewRef = useRef<HTMLDivElement>(null);
      const enableScrollRef = useRef(enableScroll);

      useImperativeHandle(ref, () => ({ ...state, container: container.current, dispatch }), [state]);
      enableScrollRef.current = enableScroll;
      useEffect(() => {
        const stateInit: ContextStore = {};
        if (container.current) {
          stateInit.container = container.current || undefined;
        }
        stateInit.markdown = propsValue || '';
        stateInit.barPopup = {};
        if (dispatch) {
          dispatch({ ...state, ...stateInit });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const cls = [
        className,
        'wmde-markdown-var',
        direction ? `${prefixCls}-${direction}` : null,
        prefixCls,
        state.preview ? `${prefixCls}-show-${state.preview}` : null,
        state.fullscreen ? `${prefixCls}-fullscreen` : null,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      useMemo(
        () => propsValue !== state.markdown && dispatch({ markdown: propsValue || '' }),
        [propsValue, state.markdown],
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(() => previewType !== state.preview && dispatch({ preview: previewType }), [previewType]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(() => tabSize !== state.tabSize && dispatch({ tabSize }), [tabSize]);
      useMemo(
        () => highlightEnable !== state.highlightEnable && dispatch({ highlightEnable }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [highlightEnable],
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(() => autoFocus !== state.autoFocus && dispatch({ autoFocus: autoFocus }), [autoFocus]);
      useMemo(() => autoFocusEnd !== state.autoFocusEnd && dispatch({ autoFocusEnd: autoFocusEnd }), [autoFocusEnd]);
      useMemo(
        () => fullscreen !== state.fullscreen && dispatch({ fullscreen: fullscreen }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [fullscreen],
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(() => height !== state.height && dispatch({ height: height }), [height]);
      useMemo(
        () => height !== state.height && onHeightChange && onHeightChange(state.height, height, state),
        [height, onHeightChange, state],
      );
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(() => commands !== state.commands && dispatch({ commands: cmds }), [props.commands]);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useMemo(
        () => extraCommands !== state.extraCommands && dispatch({ extraCommands: extraCmds }),
        [props.extraCommands],
      );

      const textareaDomRef = useRef<HTMLDivElement>();
      const active = useRef<'text' | 'preview'>('preview');
      const initScroll = useRef(false);
      const scrollCommitTimer = useRef<ReturnType<typeof setTimeout>>();

      useEffect(() => {
        textareaDomRef.current = state.textareaWarp;
        const warp = state.textareaWarp;
        if (!warp) return;
        const activateText = () => {
          active.current = 'text';
        };
        const activatePreview = () => {
          active.current = 'preview';
        };
        warp.addEventListener('mouseover', activateText);
        warp.addEventListener('mouseleave', activatePreview);
        return () => {
          warp.removeEventListener('mouseover', activateText);
          warp.removeEventListener('mouseleave', activatePreview);
        };
      }, [state.textareaWarp]);

      useEffect(() => () => clearTimeout(scrollCommitTimer.current), []);

      const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>, type: 'text' | 'preview') => {
        if (!enableScrollRef.current) return;
        const textareaDom = textareaDomRef.current;
        const previewDom = previewRef.current ? previewRef.current : undefined;
        if (!initScroll.current) {
          active.current = type;
          initScroll.current = true;
        }
        if (textareaDom && previewDom) {
          const scale =
            (textareaDom.scrollHeight - textareaDom.offsetHeight) / (previewDom.scrollHeight - previewDom.offsetHeight);
          if (e.target === textareaDom && active.current === 'text') {
            previewDom.scrollTop = textareaDom.scrollTop / scale;
          }
          if (e.target === previewDom && active.current === 'preview') {
            textareaDom.scrollTop = previewDom.scrollTop * scale;
          }
          let scrollTop = 0;
          if (active.current === 'text') {
            scrollTop = textareaDom.scrollTop || 0;
          } else if (active.current === 'preview') {
            scrollTop = previewDom.scrollTop || 0;
          }
          clearTimeout(scrollCommitTimer.current);
          scrollCommitTimer.current = setTimeout(() => dispatch({ scrollTop }), SCROLL_COMMIT_DELAY);
        }
        // `dispatch` from useReducer is stable and everything else is read from refs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      const previewClassName = `${prefixCls}-preview ${previewOptions.className || ''}`;
      const handlePreviewScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement, UIEvent>) => handleScroll(e, 'preview'),
        [handleScroll],
      );
      const handleTextScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => handleScroll(e, 'text'),
        [handleScroll],
      );
      const markdownValue = state.markdown || '';
      const deferredMarkdown = useDeferredValueCompat(markdownValue);
      const isLargeDocument = markdownValue.length > LARGE_DOCUMENT_SIZE;
      const [settledMarkdown, setSettledMarkdown] = useState(markdownValue);
      useEffect(() => {
        if (!isLargeDocument) return;
        const timer = setTimeout(() => setSettledMarkdown(deferredMarkdown), LARGE_DOCUMENT_PREVIEW_DELAY);
        return () => clearTimeout(timer);
      }, [deferredMarkdown, isLargeDocument]);
      const previewSource = isLargeDocument ? settledMarkdown : deferredMarkdown;
      let mdPreview = useMemo(
        () => (
          <div ref={previewRef} className={previewClassName}>
            <PreviewComponent {...previewOptions} onScroll={handlePreviewScroll} source={previewSource} />
          </div>
        ),
        [previewClassName, previewOptions, handlePreviewScroll, previewSource],
      );
      const preview = components?.preview && components?.preview(state.markdown || '', state, dispatch);
      if (preview && React.isValidElement(preview)) {
        mdPreview = (
          <div className={previewClassName} ref={previewRef} onScroll={handlePreviewScroll}>
            {preview}
          </div>
        );
      }

      const containerStyle = { ...other.style, height: state.height || '100%' };
      const containerClick = () => {
        // Only re-render when a popup is actually open.
        if (state.barPopup && Object.values(state.barPopup).some(Boolean)) {
          dispatch({ barPopup: { ...setGroupPopFalse(state.barPopup) } });
        }
      };
      const dragBarChange = (newHeight: number) => dispatch({ height: newHeight });

      const changeHandle = (evn: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange && onChange(evn.target.value, evn, state);
        if (textareaProps && textareaProps.onChange) {
          textareaProps.onChange(evn);
        }
        if (state.textarea && state.textarea instanceof HTMLTextAreaElement && onStatistics) {
          const obj = state.commandOrchestrator || new TextAreaCommandOrchestrator(state.textarea);
          const objState = (obj.getState() || {}) as TextState;
          onStatistics({
            ...objState,
            lineCount: evn.target.value.split('\n').length,
            length: evn.target.value.length,
          });
        }
      };

      const contextValue = useMemo(() => ({ ...state, dispatch }), [state]);
      return (
        <EditorContext.Provider value={contextValue}>
          <div ref={container} className={cls} {...other} onClick={containerClick} style={containerStyle}>
            <ToolbarVisibility
              hideToolbar={hideToolbar}
              toolbarBottom={toolbarBottom}
              prefixCls={prefixCls}
              overflow={overflow}
              placement="top"
            />
            <div className={`${prefixCls}-content`}>
              {/(edit|live)/.test(state.preview || '') && (
                <TextAreaComponent
                  className={`${prefixCls}-input`}
                  prefixCls={prefixCls}
                  autoFocus={autoFocus}
                  {...textareaProps}
                  onChange={changeHandle}
                  renderTextarea={components?.textarea || renderTextarea}
                  onScroll={handleTextScroll}
                />
              )}
              {/(live|preview)/.test(state.preview || '') && mdPreview}
            </div>
            {visibleDragbar && !state.fullscreen && (
              <DragBar
                prefixCls={prefixCls}
                height={state.height as number}
                maxHeight={maxHeight!}
                minHeight={minHeight!}
                onChange={dragBarChange}
              />
            )}
            <ToolbarVisibility
              hideToolbar={hideToolbar}
              toolbarBottom={toolbarBottom}
              prefixCls={prefixCls}
              overflow={overflow}
              placement="bottom"
            />
          </div>
        </EditorContext.Provider>
      );
    },
  );

  type EditorComponent = typeof InternalMDEditor & {
    Markdown: TMarkdownPreview;
  };

  const Editor = InternalMDEditor as EditorComponent;
  Editor.Markdown = MarkdownPreview;
  Editor.displayName = 'MDEditor';

  return Editor;
}
