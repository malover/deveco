import { TextAttributes, ScrollBoxRenderable } from '@opentui/core';
import { useTheme } from '@opencode-ai/tui/context/theme';
import { useDialog } from '@opencode-ai/tui/ui/dialog';
import { useToast } from '@opencode-ai/tui/ui/toast';
import { createStore } from 'solid-js/store';
import { onMount, Show, createSignal, createMemo, For } from 'solid-js';
import { useBindings } from '@opencode-ai/tui/keymap';
import { useTerminalDimensions } from '@opentui/solid';
import open from 'open';
import { AGREEMENT_DEFAULTS } from '@/cli/deveco-legal';
import { listLogFiles, packLogs, uploadLogs, logInfo, logError } from '@/cli/cmd/debug/log-export';
import { deleteCrashedFlag } from '@/cli/crash-detect';

interface LogFile {
  path: string
  label: string
  group: string
}

type Field =
  | { type: 'group'; group: string; label: string }
  | { type: 'file'; index: number }
  | { type: 'privacy' }
  | { type: 'agree' }
  | { type: 'upload' };

export function DialogCollect(props: { triggerType?: string }) {
  const dialog = useDialog();
  const { theme } = useTheme();
  const toast = useToast();
  const dimensions = useTerminalDimensions();

  const logFiles = createMemo<LogFile[]>(() => listLogFiles());

  // Initialize: deveco group checked, mcp group unchecked
  const initialFiles = logFiles();
  const initialChecked: Record<number, boolean> = {};
  for (let i = 0; i < initialFiles.length; i++) {
    initialChecked[i] = initialFiles[i].group !== 'mcp';
  }
  const [checked, setChecked] = createStore<Record<number, boolean>>(initialChecked);
  const [agree, setAgree] = createSignal(false);
  const [active, setActive] = createSignal<number>(0);
  const [uploading, setUploading] = createSignal(false);
  let scroll: ScrollBoxRenderable | undefined;

  const scrollMaxHeight = createMemo(() => {
    const h = dimensions().height;
    return Math.max(5, Math.floor(h / 3));
  });

  onMount(() => {
    dialog.setSize('medium');
  });

  // Build the list of navigable fields: group headers + files + agree + upload
  const fields = createMemo<Field[]>(() => {
    const files = logFiles();
    const result: Field[] = [];
    const groups: { group: string; label: string }[] = [];
    if (files.some((f) => f.group === 'deveco')) {
      groups.push({ group: 'deveco', label: 'Main logs' });
    }
    if (files.some((f) => f.group === 'mcp')) {
      groups.push({ group: 'mcp', label: 'MCP logs' });
    }

    let fileIdx = 0;
    for (const g of groups) {
      result.push({ type: 'group', group: g.group, label: g.label });
      while (fileIdx < files.length && files[fileIdx].group === g.group) {
        result.push({ type: 'file', index: fileIdx });
        fileIdx++;
      }
    }
    result.push({ type: 'privacy' });
    result.push({ type: 'agree' });
    result.push({ type: 'upload' });
    return result;
  });

  const groupChecked = createMemo(() => {
    const files = logFiles();
    const map: Record<string, boolean> = {};
    for (const g of ['deveco', 'mcp']) {
      const groupFiles = files.filter((f) => f.group === g);
      if (groupFiles.length > 0) {
        map[g] = groupFiles.every((f) => checked[files.indexOf(f)] === true);
      }
    }
    return map;
  });

  const isGroupAllChecked = (group: string) => groupChecked()[group] === true;

  const toggleGroup = (group: string) => {
    const files = logFiles();
    const allChecked = isGroupAllChecked(group);
    for (const f of files.filter((f) => f.group === group)) {
      const idx = files.indexOf(f);
      setChecked(idx, !allChecked);
    }
  };

  const scrollToActive = () => {
    if (!scroll) {
      return;
    }
    const cur = active();
    const target = scroll.getChildren()[cur];
    if (!target) {
      return;
    }
    const y = target.y - scroll.y;
    if (y < 0) {
      scroll.scrollBy(y);
    } else if (y >= scroll.height) {
      scroll.scrollBy(y - scroll.height + 1);
    }
  };

  useBindings(() => ({
    bindings: [
      {
        key: 'tab',
        desc: 'Next',
        group: 'Dialog',
        cmd: () => {
          const total = fields().length;
          if (total === 0) {
            return;
          }
          setActive((prev) => (prev + 1) % total);
          setTimeout(scrollToActive, 0);
        },
      },
      {
        key: 'down',
        desc: 'Next',
        group: 'Dialog',
        cmd: () => {
          const total = fields().length;
          if (total === 0) {
            return;
          }
          setActive((prev) => (prev + 1) % total);
          setTimeout(scrollToActive, 0);
        },
      },
      {
        key: 'up',
        desc: 'Previous',
        group: 'Dialog',
        cmd: () => {
          const total = fields().length;
          if (total === 0) {
            return;
          }
          setActive((prev) => (prev - 1 + total) % total);
          setTimeout(scrollToActive, 0);
        },
      },
      {
        key: 'space',
        desc: 'Toggle',
        group: 'Dialog',
        cmd: () => {
          const cur = active();
          const field = fields()[cur];
          if (!field) {
            return;
          }
          if (field.type === 'group') {
            toggleGroup(field.group);
          } else if (field.type === 'file') {
            setChecked(field.index, !checked[field.index]);
          } else if (field.type === 'privacy') {
            open(AGREEMENT_DEFAULTS.privacy_url).catch(() => {});
          } else if (field.type === 'agree') {
            setAgree(!agree());
          }
        },
      },
      {
        key: 'return',
        desc: 'Upload',
        group: 'Dialog',
        cmd: () => void doUpload(),
      },
    ],
  }));

  async function doUpload(): Promise<void> {
    if (uploading()) {
      return;
    }
    if (!agree()) {
      toast.show({ message: 'Please agree to the privacy policy first', variant: 'error' });
      return;
    }
    const selected = logFiles().filter((_, i) => checked[i]);
    if (selected.length === 0) {
      toast.show({ message: 'Please select at least one log file', variant: 'error' });
      return;
    }

    setUploading(true);
    try {
      const archive = packLogs(selected.map((f) => f.path));
      if (!archive) {
        toast.show({ message: 'No log files found', variant: 'error' });
        setUploading(false);
        return;
      }
      logInfo('manual log upload started', { size: archive.length, files: selected.length });
      await uploadLogs(archive, props.triggerType ?? '00001');
      logInfo('manual log upload completed');
      deleteCrashedFlag();
      toast.show({ message: 'Logs uploaded successfully', variant: 'success' });
      dialog.clear();
    } catch (e) {
      logError('manual log upload failed', { error: String(e) });
      toast.show({ message: 'Upload log failed.', variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection='row' justifyContent='space-between'>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          Collect Logs
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          {'ESC'}
        </text>
      </box>

      <Show when={logFiles().length === 0}>
        <text fg={theme.textMuted}>No log files found</text>
      </Show>

      <Show when={logFiles().length > 0}>
        <scrollbox
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={scrollMaxHeight()}
          verticalScrollbarOptions={{ visible: true }}
          horizontalScrollbarOptions={{ visible: false }}
        >
          <For each={fields().filter((f) => f.type !== 'agree' && f.type !== 'upload' && f.type !== 'privacy')}>
            {(field, fi) => {
              const allFields = fields();
              const realIdx = allFields.indexOf(field);

              if (field.type === 'group') {
                return (
                  <box
                    flexDirection='row'
                    gap={2}
                    paddingLeft={1}
                    backgroundColor={active() === realIdx ? theme.backgroundElement : undefined}
                    onMouseUp={() => setActive(realIdx)}
                  >
                    <text fg={active() === realIdx ? theme.primary : theme.textMuted}>
                      {groupChecked()[field.group] === true ? '[✓]' : '[ ]'}
                    </text>
                    <text fg={active() === realIdx ? theme.primary : theme.textMuted} attributes={TextAttributes.BOLD}>
                      {field.label}
                    </text>
                  </box>
                );
              }

              // file type
              const file = logFiles()[field.index];
              return (
                <box
                  flexDirection='row'
                  gap={2}
                  paddingLeft={3}
                  backgroundColor={active() === realIdx ? theme.backgroundElement : undefined}
                  onMouseUp={() => setActive(realIdx)}
                >
                  <text fg={active() === realIdx ? theme.primary : theme.textMuted}>
                    {checked[field.index] === true ? '[✓]' : '[ ]'}
                  </text>
                  <text fg={active() === realIdx ? theme.primary : theme.text}>{file.label}</text>
                </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>

      <box flexDirection='column' gap={1}>
        <For each={fields()}>
          {(field, fi) => {
            if (field.type === 'privacy') {
              return (
                <box
                  flexDirection='row'
                  gap={2}
                  paddingLeft={1}
                  backgroundColor={active() === fi() ? theme.backgroundElement : undefined}
                  onMouseUp={() => {
                    setActive(fi());
                    open(AGREEMENT_DEFAULTS.privacy_url).catch(() => {});
                  }}
                >
                  <text fg={active() === fi() ? theme.primary : theme.textMuted}>Privacy Policy:</text>
                  <text fg={active() === fi() ? theme.primary : theme.primary}>Open</text>
                </box>
              );
            }
            if (field.type !== 'agree') {
              return null;
            }
            return (
              <box
                flexDirection='row'
                gap={2}
                paddingLeft={1}
                backgroundColor={active() === fi() ? theme.backgroundElement : undefined}
                onMouseUp={() => {
                  setActive(fi());
                  setAgree(!agree());
                }}
              >
                <text fg={active() === fi() ? theme.primary : theme.textMuted}>
                  {agree() ? '[✓]' : '[ ]'}
                </text>
                <text fg={active() === fi() ? theme.primary : theme.text}>
                  I have read and agree to the privacy policy
                </text>
              </box>
            );
          }}
        </For>
      </box>

      <Show when={uploading()}>
        <text fg={theme.primary}>Uploading...</text>
      </Show>

      <Show when={!uploading()}>
        <For each={fields()}>
          {(field, fi) => {
            if (field.type !== 'upload') {
              return null;
            }
            return (
              <box
                flexDirection='row'
                gap={2}
                paddingLeft={1}
                backgroundColor={active() === fi() ? theme.backgroundElement : undefined}
                onMouseUp={() => {
                  setActive(fi());
                  void doUpload();
                }}
              >
                <text fg={agree() ? theme.primary : theme.textMuted}>
                  {agree() ? '> Upload <' : '  Upload  '}
                </text>
              </box>
            );
          }}
        </For>
      </Show>

      <text fg={theme.textMuted} paddingBottom={1}>
        {'space: toggle  |  up/down: navigate  |  enter: upload  |  esc: cancel'}
      </text>
    </box>
  );
}
