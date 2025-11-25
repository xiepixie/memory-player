import { useToastStore } from '../../store/toastStore';
import { Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const icons = {
  info: <Info size={18} />,
  success: <CheckCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertCircle size={18} />,
};

// PERFORMANCE: Replaced Framer Motion with CSS animations
// AnimatePresence mode="popLayout" triggers expensive layout calculations
// in create-projection-node.mjs, causing severe lag in Tauri WebView

export const ToastContainer = () => {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div className="toast toast-bottom toast-end z-[9999] p-6 gap-3 pointer-events-none">
        {toasts.map((toast) => {
          const [title, body] = toast.message.includes('|') 
              ? toast.message.split('|') 
              : [toast.type, toast.message];

          return (
            <div
            key={toast.id}
            className={`
              relative overflow-hidden
              flex items-center gap-3
              min-w-[300px] max-w-md
              p-4 rounded-xl
              shadow-2xl backdrop-blur-xl
              border border-white/10
              pointer-events-auto cursor-pointer
              group
              hover:scale-[1.02] active:scale-[0.98] transition-all duration-200
              animate-in slide-in-from-right-12 fade-in
            `}
            style={{
                background: 'rgba(20, 20, 25, 0.85)', // Deep dark glass
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            }}
            onClick={() => removeToast(toast.id)}
          >
             {/* Status Indicator Bar */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                toast.type === 'error' ? 'bg-error' :
                toast.type === 'success' ? 'bg-success' :
                toast.type === 'warning' ? 'bg-warning' : 'bg-info'
            }`} />

            {/* Icon */}
            <div className={`
                p-2 rounded-full bg-white/5 text-white/90
                ${toast.type === 'error' ? 'text-error' :
                  toast.type === 'success' ? 'text-success' :
                  toast.type === 'warning' ? 'text-warning' : 'text-info'}
            `}>
                {icons[toast.type]}
            </div>

            {/* Content */}
            <div className="flex-1 pr-2">
                <h4 className="font-semibold text-sm text-white/90 leading-tight mb-0.5 capitalize">
                    {title}
                </h4>
                <p className="text-xs text-white/60 font-medium leading-relaxed">
                    {body}
                </p>
            </div>

             {/* Progress/Close hint */}
             <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
             </div>
          </div>
          );
        })}
    </div>
  );
};
