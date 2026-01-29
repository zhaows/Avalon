/**
 * Toast notification container component
 */
import { useToastStore, ToastType } from '../store/toastStore';

const typeStyles: Record<ToastType, { bg: string; icon: string; border: string }> = {
  success: {
    bg: 'bg-emerald-500/10',
    icon: '✅',
    border: 'border-emerald-500/30'
  },
  error: {
    bg: 'bg-red-500/10',
    icon: '❌',
    border: 'border-red-500/30'
  },
  warning: {
    bg: 'bg-amber-500/10',
    icon: '⚠️',
    border: 'border-amber-500/30'
  },
  info: {
    bg: 'bg-blue-500/10',
    icon: '💡',
    border: 'border-blue-500/30'
  }
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 max-w-sm">
      {toasts.map((toast) => {
        const styles = typeStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`glass ${styles.bg} ${styles.border} border rounded-xl shadow-2xl p-4 
                       animate-slide-in cursor-pointer
                       hover:scale-[1.02] transition-transform`}
            onClick={() => removeToast(toast.id)}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0">{styles.icon}</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-semibold">{toast.title}</h4>
                {toast.message && (
                  <p className="text-slate-400 text-sm mt-1">{toast.message}</p>
                )}
              </div>
              <button 
                className="text-slate-500 hover:text-white flex-shrink-0 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
