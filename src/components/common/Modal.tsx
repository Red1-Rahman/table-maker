import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, width = 'max-w-lg', footer }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[94vw] ${width} -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-rule bg-white shadow-xl`}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between border-b border-rule px-5 py-3">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-ink">{title}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12px] text-ink-soft">{description ?? ' '}</Dialog.Description>
            </div>
            <Dialog.Close className="-mr-1 rounded p-1 text-ink-soft hover:bg-black/5" aria-label="Close">
              ✕
            </Dialog.Close>
          </div>
          <div className="overflow-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
