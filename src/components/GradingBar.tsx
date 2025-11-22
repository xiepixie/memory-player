import { useAppStore } from '../store/appStore';
import { useToastStore } from '../store/toastStore';
import { motion } from 'framer-motion';

export const GradingBar = () => {
  const { saveReview, currentMetadata } = useAppStore();

  if (!currentMetadata) return null;

  const leftButtons = [
    { label: 'Again', rating: 1, color: 'hover:bg-error/20 hover:text-error', key: '1', type: 'error' as const, msg: 'Forgot?|Review scheduled soon' },
    { label: 'Hard', rating: 2, color: 'hover:bg-warning/20 hover:text-warning', key: '2', type: 'warning' as const, msg: 'Hard|Review scheduled later' },
  ];

  const rightButtons = [
    { label: 'Good', rating: 3, color: 'hover:bg-info/20 hover:text-info', key: '3', type: 'info' as const, msg: 'Good|Progress recorded' },
    { label: 'Easy', rating: 4, color: 'hover:bg-success/20 hover:text-success', key: '4', type: 'success' as const, msg: 'Easy|Mastered!' },
  ];

  type ButtonConfig = typeof leftButtons[number] | typeof rightButtons[number];

  const ButtonGroup = ({ buttons, align }: { buttons: ButtonConfig[], align: 'left' | 'right' }) => (
    <div className={`flex flex-col gap-3 ${align === 'left' ? 'items-start' : 'items-end'}`}>
        {buttons.map((btn) => (
        <motion.button
            key={btn.rating}
            whileHover={{ scale: 1.1, x: align === 'left' ? -5 : 5 }}
            whileTap={{ scale: 0.95 }}
            className={`
                group relative flex items-center
                ${align === 'left' ? 'flex-row' : 'flex-row-reverse'}
            `}
            onClick={() => {
                useToastStore.getState().addToast(btn.msg, btn.type);
                saveReview(btn.rating);
            }}
            title={`Press ${btn.key}`}
        >
            {/* Paper-style Orb Button */}
            <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                shadow-md border border-base-300 bg-base-100
                transition-all duration-200
                hover:shadow-lg hover:border-base-content/20
                ${btn.type === 'error' ? 'hover:text-error hover:border-error/30' :
                  btn.type === 'warning' ? 'hover:text-warning hover:border-warning/30' :
                  btn.type === 'info' ? 'hover:text-info hover:border-info/30' : 
                  'hover:text-success hover:border-success/30'}
            `}>
                 <span className="text-sm font-bold font-mono opacity-60 group-hover:opacity-100 transition-opacity">
                    {btn.key}
                 </span>
            </div>

            {/* Floating Label - Paper Style */}
            <div className={`
                absolute ${align === 'left' ? 'left-12' : 'right-12'}
                opacity-0 group-hover:opacity-100 transition-all duration-200
                bg-base-100 border border-base-200 px-3 py-1.5 rounded-lg shadow-lg
                whitespace-nowrap pointer-events-none z-50
                flex items-center gap-2
            `}>
                 <span className={`text-xs font-bold uppercase tracking-wider ${
                    btn.type === 'error' ? 'text-error' :
                    btn.type === 'warning' ? 'text-warning' :
                    btn.type === 'info' ? 'text-info' : 'text-success'
                 }`}>
                    {btn.label}
                 </span>
            </div>
        </motion.button>
        ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full flex justify-between pointer-events-none"
    >
      {/* Left Controls - Negative Offset to hang outside column */}
      <div className="pointer-events-auto -translate-x-16">
        <ButtonGroup buttons={leftButtons} align="left" />
      </div>

      {/* Right Controls - Positive Offset to hang outside column */}
      <div className="pointer-events-auto translate-x-16">
        <ButtonGroup buttons={rightButtons} align="right" />
      </div>
    </motion.div>
  );
};
