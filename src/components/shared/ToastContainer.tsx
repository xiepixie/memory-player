import { useToastStore } from '../../store/toastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react';

const icons = {
  info: <Info size={18} />,
  success: <CheckCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  error: <AlertCircle size={18} />,
};

const colors = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-error',
};

export const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="toast toast-bottom toast-end z-[100] p-4 gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.9 }}
            layout
            className={`alert ${colors[toast.type]} shadow-lg max-w-sm flex items-start pointer-events-auto cursor-pointer`}
            onClick={() => removeToast(toast.id)}
          >
            <div className="flex gap-2 items-center">
                {icons[toast.type]}
                <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
