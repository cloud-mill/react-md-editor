import React, { useEffect, useRef } from 'react';
import { type IProps } from '../../Types';
import './index.less';

export interface IDragBarProps extends IProps {
  height: number;
  maxHeight: number;
  minHeight: number;
  onChange: (value: number) => void;
}

const dragIcon = (
  <svg viewBox="0 0 512 512" height="100%">
    <path
      fill="currentColor"
      d="M304 256c0 26.5-21.5 48-48 48s-48-21.5-48-48 21.5-48 48-48 48 21.5 48 48zm120-48c-26.5 0-48 21.5-48 48s21.5 48 48 48 48-21.5 48-48-21.5-48-48-48zm-336 0c-26.5 0-48 21.5-48 48s21.5 48 48 48 48-21.5 48-48-21.5-48-48-48z"
    />
  </svg>
);

function getClientY(event: Event): number | undefined {
  const mouseY = (event as MouseEvent).clientY;
  if (typeof mouseY === 'number') return mouseY;
  return (event as TouchEvent).changedTouches?.[0]?.clientY;
}

const DragBar: React.FC<IDragBarProps> = (props) => {
  const { prefixCls, height, minHeight, maxHeight, onChange } = props;
  const $dom = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ height: number; dragY: number }>();
  // Handlers are bound once on mount; read the latest props through a ref so
  // height/minHeight/maxHeight/onChange updates are never stale.
  const propsRef = useRef(props);
  propsRef.current = props;

  const clampAndChange = (newHeight: number) => {
    const { minHeight, maxHeight, onChange } = propsRef.current;
    const next = Math.min(Math.max(newHeight, minHeight), maxHeight);
    if (next !== propsRef.current.height) {
      onChange(next);
    }
  };

  useEffect(() => {
    const dom = $dom.current;
    if (!dom) return;
    const handleMove = (event: Event) => {
      if (!dragRef.current) return;
      const clientY = getClientY(event);
      if (typeof clientY !== 'number') return;
      clampAndChange(dragRef.current.height + clientY - dragRef.current.dragY);
    };
    const handleUp = () => {
      dragRef.current = undefined;
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      dom.removeEventListener('touchmove', handleMove);
      dom.removeEventListener('touchend', handleUp);
    };
    const handleDown = (event: Event) => {
      event.preventDefault();
      const clientY = getClientY(event);
      if (typeof clientY !== 'number') return;
      dragRef.current = { height: propsRef.current.height, dragY: clientY };
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      dom.addEventListener('touchmove', handleMove, { passive: false });
      dom.addEventListener('touchend', handleUp, { passive: false });
    };
    dom.addEventListener('mousedown', handleDown);
    dom.addEventListener('touchstart', handleDown, { passive: false });
    return () => {
      dom.removeEventListener('mousedown', handleDown);
      dom.removeEventListener('touchstart', handleDown);
      handleUp();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = (event.shiftKey ? 30 : 10) * (event.key === 'ArrowUp' ? -1 : 1);
    clampAndChange(propsRef.current.height + step);
  };

  return (
    <div
      className={`${prefixCls}-bar`}
      ref={$dom}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the editor"
      aria-valuemin={minHeight}
      aria-valuemax={maxHeight}
      aria-valuenow={height}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {dragIcon}
    </div>
  );
};

export default DragBar;
