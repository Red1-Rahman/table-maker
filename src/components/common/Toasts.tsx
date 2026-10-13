import { useStore } from '@/store/tableStore';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-[80vw] rounded border px-3 py-2 text-left text-[13px] shadow-md ${
            t.kind === 'error' ? 'border-red-300 bg-red-50 text-red-900' : t.kind === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-rule bg-white text-ink'
          }`}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
