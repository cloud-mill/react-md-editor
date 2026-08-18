import { ICommand, TextAreaCommandOrchestrator } from '../../commands/';
import { ContextStore, ExecuteCommandState } from '../../Context';

function collectShortcutCommands(
  data: ICommand[] = [],
  result: Record<string, ICommand> = {},
): Record<string, ICommand> {
  data.forEach((item) => {
    if (item.children && Array.isArray(item.children)) {
      collectShortcutCommands(item.children, result);
    } else if (item.keyCommand && item.shortcuts && item.execute) {
      result[item.shortcuts.toLocaleLowerCase()] = item;
    }
  });
  return result;
}

export default function shortcutsHandle(
  e: KeyboardEvent | React.KeyboardEvent<HTMLTextAreaElement>,
  commands: ICommand[] = [],
  commandOrchestrator?: TextAreaCommandOrchestrator,
  dispatch?: React.Dispatch<ContextStore>,
  state?: ExecuteCommandState,
) {
  const data = collectShortcutCommands(commands || []);
  const shortcuts: string[] = [];
  if (e.altKey) {
    shortcuts.push('alt');
  }
  if (e.shiftKey) {
    shortcuts.push('shift');
  }
  if (e.metaKey) {
    shortcuts.push('cmd');
  }
  if (e.ctrlKey) {
    shortcuts.push('ctrl');
  }
  if (shortcuts.length > 0 && !/(control|alt|meta|shift)/.test(e.key.toLocaleLowerCase())) {
    shortcuts.push(e.key.toLocaleLowerCase());
  }
  if (/escape/.test(e.key.toLocaleLowerCase())) {
    shortcuts.push('escape');
  }
  if (shortcuts.length < 1) {
    return;
  }

  let command = data[shortcuts.join('+')];

  Object.keys(data).forEach((item) => {
    const isequal = item.split('+').every((v) => {
      if (/ctrlcmd/.test(v)) {
        return shortcuts.includes('ctrl') || shortcuts.includes('cmd');
      }
      return shortcuts.includes(v);
    });
    if (isequal) {
      command = data[item];
    }
  });
  if (command && commandOrchestrator) {
    e.stopPropagation();
    e.preventDefault();
    commandOrchestrator.executeCommand(command, dispatch, state, shortcuts);
    return;
  }
}
