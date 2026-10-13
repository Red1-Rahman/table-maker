import { normalizeKey } from '@/core/input/keyNormalizer';
import { saveDraft } from '@/store/middleware/persistence';
import { selectionToRange } from '@/store/slices/gridSlice';
import { useStore } from '@/store/tableStore';
import { parseClipboard, rangeMatrix, toClipboardHtml, toTsv } from '@/utils/clipboard';
import { ingestImageFile, isImageFile } from '@/utils/image';
import { cellKey } from '@/types/schema';
import { useEffect } from 'react';

const isTextTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Global shortcuts: navigation, formatting, undo/redo, Ctrl/Cmd+S draft save, smart clipboard. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const k = normalizeKey(e);
      // Ctrl/Cmd+S: save draft without triggering the browser "save page" dialog
      if (k.primary && k.letter === 's') {
        e.preventDefault();
        st.setSaveState('saving');
        saveDraft(st.doc)
          .then(() => {
            st.setSaveState('saved');
            st.toast('Draft saved on this device.', 'success');
          })
          .catch(() => st.setSaveState('error'));
        return;
      }
      if (st.modal || isTextTarget(e.target)) return;
      if (st.ctxMenu && k.key === 'Escape') {
        st.setCtxMenu(null);
        return;
      }
      if (k.primary) {
        switch (k.letter) {
          case 'z':
            e.preventDefault();
            return k.shift ? st.redo() : st.undo();
          case 'y':
            e.preventDefault();
            return st.redo();
          case 'a':
            e.preventDefault();
            return st.selectAll();
          case 'b':
            e.preventDefault();
            return st.toggleStyle('bold');
          case 'i':
            e.preventDefault();
            return st.toggleStyle('italic');
          case 'u':
            e.preventDefault();
            return st.toggleStyle('underline');
          case 'x':
            if (k.shift) {
              e.preventDefault();
              return st.toggleStyle('strike');
            }
            return;
          case 'k':
            e.preventDefault();
            return st.setAiBarOpen(true);
        }
        if (k.key === 'Home') {
          e.preventDefault();
          return st.select({ r: 0, c: 0 });
        }
        if (k.key === 'End') {
          e.preventDefault();
          return st.select({ r: st.doc.rows.length - 1, c: st.doc.columns.length - 1 });
        }
        if (k.key.startsWith('Arrow')) {
          e.preventDefault();
          const f = st.selection.focus;
          const d = st.doc;
          const t = k.key === 'ArrowUp' ? { r: 0, c: f.c } : k.key === 'ArrowDown' ? { r: d.rows.length - 1, c: f.c } : k.key === 'ArrowLeft' ? { r: f.r, c: 0 } : { r: f.r, c: d.columns.length - 1 };
          return st.select(k.shift ? st.selection.anchor : t, t);
        }
        return; // let copy/cut/paste fall through to clipboard events
      }
      switch (k.key) {
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dr = k.key === 'ArrowUp' ? -1 : k.key === 'ArrowDown' ? 1 : 0;
          const dc = k.key === 'ArrowLeft' ? -1 : k.key === 'ArrowRight' ? 1 : 0;
          return st.moveSelection(dr, dc, k.shift);
        }
        case 'Tab': {
          e.preventDefault();
          const f = st.selection.focus;
          const dir = k.shift ? -1 : 1;
          if (dir === 1 && f.c === st.doc.columns.length - 1 && f.r < st.doc.rows.length - 1) return st.select({ r: f.r + 1, c: 0 });
          if (dir === -1 && f.c === 0 && f.r > 0) return st.select({ r: f.r - 1, c: st.doc.columns.length - 1 });
          return st.moveSelection(0, dir);
        }
        case 'Enter': {
          e.preventDefault();
          if (k.shift) return st.moveSelection(-1, 0);
          const f = st.selection.focus;
          return st.startEdit(f.r, f.c);
        }
        case 'F2': {
          e.preventDefault();
          const f = st.selection.focus;
          return st.startEdit(f.r, f.c);
        }
        case 'Clear':
          e.preventDefault();
          return st.clearSelection();
        case 'Home':
          e.preventDefault();
          return st.select({ r: st.selection.focus.r, c: 0 });
        case 'End':
          e.preventDefault();
          return st.select({ r: st.selection.focus.r, c: st.doc.columns.length - 1 });
        case 'PageDown':
          e.preventDefault();
          return st.moveSelection(10, 0, k.shift);
        case 'PageUp':
          e.preventDefault();
          return st.moveSelection(-10, 0, k.shift);
        case 'Char': {
          const f = st.selection.focus;
          e.preventDefault();
          return st.startEdit(f.r, f.c, k.char, true);
        }
      }
    };

    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (isTextTarget(e.target) || useStore.getState().modal) return;
      const st = useStore.getState();
      const rg = selectionToRange(st.doc, st.selection);
      const matrix = rangeMatrix(st.doc, rg);
      const tsv = toTsv(matrix);
      const { cells } = st.copySelection();
      useStore.setState({ clip: { tsv, cells } });
      e.clipboardData?.setData('text/plain', tsv);
      e.clipboardData?.setData('text/html', toClipboardHtml(st.doc, rg));
      e.preventDefault();
      if (cut) st.clearSelection();
    };
    const onCopyEvt = (e: ClipboardEvent) => onCopy(e, false);
    const onCutEvt = (e: ClipboardEvent) => onCopy(e, true);

    const onPaste = (e: ClipboardEvent) => {
      if (isTextTarget(e.target) || useStore.getState().modal) return;
      const st = useStore.getState();
      const cd = e.clipboardData;
      if (!cd) return;
      const imgFile = Array.from(cd.files).find(isImageFile);
      e.preventDefault();
      if (imgFile) {
        ingestImageFile(imgFile)
          .then((cfg) => {
            const f = useStore.getState().selection.focus;
            useStore.getState().setImage(f.r, f.c, cfg);
          })
          .catch((err) => st.toast(err.message, 'error'));
        return;
      }
      const text = cd.getData('text/plain');
      const html = cd.getData('text/html');
      if (!text && !html) return;
      st.pasteMatrix(parseClipboard(text, html), text);
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('copy', onCopyEvt);
    document.addEventListener('cut', onCutEvt);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('copy', onCopyEvt);
      document.removeEventListener('cut', onCutEvt);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}

export { cellKey };
