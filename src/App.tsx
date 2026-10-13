import { normalizeSchema } from '@/core/engine/schemaUtil';
import { importFile } from '@/core/export/importers';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { loadDraft, saveDraft } from '@/store/middleware/persistence';
import { useStore } from '@/store/tableStore';
import { ingestImageFile } from '@/utils/image';
import { useEffect, useRef } from 'react';
import { AIPromptBar } from './components/ai/AIPromptBar';
import { KeyManagerModal } from './components/ai/KeyManagerModal';
import { CanvasContainer } from './components/canvas/CanvasContainer';
import { Toasts } from './components/common/Toasts';
import { MultiFormatExportModal } from './components/export/MultiFormatExportModal';
import { HelpModal } from './components/export/HelpModal';
import { TemplatesModal } from './components/export/TemplatesModal';
import { ContextMenu } from './components/grid/ContextMenu';
import { FormatControls } from './components/toolbar/FormatControls';
import { FormulaBar } from './components/toolbar/FormulaBar';
import { Inspector } from './components/toolbar/Inspector';
import { MainToolbar } from './components/toolbar/MainToolbar';
import { StatusBar } from './components/toolbar/StatusBar';

export default function App() {
  useKeyboardShortcuts();
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const imageInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  // restore the last draft once, then autosave (debounced) on every change
  useEffect(() => {
    let cancelled = false;
    loadDraft().then((raw) => {
      if (cancelled) return;
      restored.current = true;
      if (raw && useStore.getState().past.length === 0) {
        try {
          useStore.getState().loadDocument(normalizeSchema(raw));
          useStore.getState().toast('Restored your last draft.');
        } catch {
          /* ignore corrupt draft */
        }
      }
      useStore.getState().requestFit();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.doc === prev.doc || !restored.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        useStore.getState().setSaveState('saving');
        saveDraft(useStore.getState().doc)
          .then(() => useStore.getState().setSaveState('saved'))
          .catch(() => useStore.getState().setSaveState('error'));
      }, 800);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsub();
    };
  }, []);

  useEffect(() => {
    const pickImage = () => imageInput.current?.click();
    const pickImport = () => importInput.current?.click();
    window.addEventListener('tm:pick-image', pickImage);
    window.addEventListener('tm:pick-import', pickImport);
    return () => {
      window.removeEventListener('tm:pick-image', pickImage);
      window.removeEventListener('tm:pick-import', pickImport);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <MainToolbar />
      <FormatControls />
      <FormulaBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <CanvasContainer />
          <AIPromptBar />
        </main>
        {inspectorOpen && <Inspector />}
      </div>
      <StatusBar />
      <ContextMenu />
      <MultiFormatExportModal />
      <KeyManagerModal />
      <TemplatesModal />
      <HelpModal />
      <Toasts />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
        hidden
        data-testid="image-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const st = useStore.getState();
          try {
            const f = st.selection.focus;
            st.setImage(f.r, f.c, await ingestImageFile(file));
          } catch (err) {
            st.toast(err instanceof Error ? err.message : 'Could not add that image.', 'error');
          }
        }}
      />
      <input
        ref={importInput}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.json,.md,.markdown"
        hidden
        data-testid="import-input"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const st = useStore.getState();
          if (st.past.length > 0 && !window.confirm('Replace the current table with the imported file?')) return;
          try {
            st.loadDocument(await importFile(file));
            st.toast(`Imported ${file.name}`, 'success');
            st.requestFit();
          } catch (err) {
            st.toast(err instanceof Error ? err.message : 'Import failed.', 'error');
          }
        }}
      />
    </div>
  );
}
