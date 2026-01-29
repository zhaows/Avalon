/**
 * Custom confirm modal component
 */
import { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  type = 'warning'
}: ConfirmModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: '⚠️',
      iconBg: 'bg-red-500/20',
      confirmClass: 'btn-danger'
    },
    warning: {
      icon: '🎮',
      iconBg: 'bg-amber-500/20',
      confirmClass: 'bg-amber-600 hover:bg-amber-500 text-white'
    },
    info: {
      icon: '💡',
      iconBg: 'bg-blue-500/20',
      confirmClass: 'btn-primary'
    }
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Modal */}
      <div className="relative glass-dark rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-scale-in">
        {/* Content */}
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${styles.iconBg}`}>
              {styles.icon}
            </div>
            <h3 className="text-xl font-bold text-white">{title}</h3>
          </div>
          
          <p className="text-slate-300 leading-relaxed whitespace-pre-line ml-16">
            {message}
          </p>
        </div>
        
        {/* Actions */}
        <div className="px-6 md:px-8 pb-6 md:pb-8 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="btn btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`btn ${styles.confirmClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
