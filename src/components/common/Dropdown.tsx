import * as DM from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
}

interface Props {
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  triggerClassName?: string;
  label?: string;
}

export function Dropdown({ trigger, items, align = 'start', triggerClassName = '', label }: Props) {
  return (
    <DM.Root>
      <DM.Trigger
        aria-label={label}
        className={`inline-flex h-8 items-center gap-1 rounded border border-transparent px-2 text-[13px] hover:bg-black/5 data-[state=open]:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${triggerClassName}`}
      >
        {trigger}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align={align} sideOffset={4} className="z-50 min-w-[210px] rounded-md border border-rule bg-white p-1 shadow-lg">
          {items.map((it, i) =>
            it.separator ? (
              <DM.Separator key={`s${i}`} className="my-1 h-px bg-rule" />
            ) : (
              <DM.Item
                key={it.label}
                disabled={it.disabled}
                onSelect={() => it.onSelect?.()}
                className="flex cursor-default items-center justify-between gap-6 rounded px-2.5 py-1.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent-soft"
              >
                <span>
                  {it.checked !== undefined && <span className="mr-1.5 inline-block w-3 text-accent">{it.checked ? '✓' : ''}</span>}
                  {it.label}
                </span>
                {it.shortcut && <span className="text-[11px] text-ink-soft">{it.shortcut}</span>}
              </DM.Item>
            ),
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
