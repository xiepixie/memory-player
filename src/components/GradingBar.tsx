import { useAppStore } from '../store/appStore';
import { motion } from 'framer-motion';

export const GradingBar = () => {
  const { saveReview, currentMetadata } = useAppStore();

  if (!currentMetadata) return null;

  const handleGrade = async (rating: number) => {
    await saveReview(rating);
  };

  const buttons = [
      { label: 'Again', rating: 1, color: 'btn-error', time: '1m', key: '1' },
      { label: 'Hard', rating: 2, color: 'btn-warning', time: '2d', key: '2' },
      { label: 'Good', rating: 3, color: 'btn-info', time: '4d', key: '3' },
      { label: 'Easy', rating: 4, color: 'btn-success', time: '7d', key: '4' },
  ];

  return (
    <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="card bg-base-100/80 backdrop-blur-md border border-base-200 shadow-2xl p-4 pb-6 mb-4"
    >
      <div className="flex gap-4">
          {buttons.map((btn) => (
              <motion.button
                key={btn.rating}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`btn btn-lg ${btn.color} flex flex-col gap-1 w-24 h-24 rounded-xl relative`}
                onClick={() => handleGrade(btn.rating)}
              >
                  <span className="text-lg font-bold">{btn.label}</span>
                  <span className="text-xs opacity-70 font-normal">{btn.time}</span>

                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-base-100/30 text-[10px] flex items-center justify-center border border-white/20">
                      {btn.key}
                  </div>
              </motion.button>
          ))}
      </div>

      <div className="text-center mt-4 text-xs text-base-content/40 font-mono">
          PRESS 1-4 TO GRADE
      </div>
    </motion.div>
  );
};
