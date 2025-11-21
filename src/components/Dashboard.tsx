import { useAppStore } from '../store/appStore';
import { Play } from 'lucide-react';
import { motion } from 'framer-motion';

export const Dashboard = () => {
    const { files, fileMetadatas, setQueue, startSession } = useAppStore();

    // Calculate Due Notes
    const now = new Date();
    const dueNotes = files.filter(f => {
        const meta = fileMetadatas[f];
        if (!meta || !meta.card) return true;
        return new Date(meta.card.due) <= now;
    });

    const handleStartSession = () => {
        setQueue(dueNotes);
        startSession();
    };

    if (dueNotes.length === 0) return null;

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card bg-gradient-to-r from-primary to-primary/80 text-primary-content shadow-xl mb-6 overflow-hidden relative"
        >
            {/* Decorative background circle */}
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />

            <div className="card-body flex-row items-center justify-between p-6">
                <div>
                    <h2 className="card-title text-3xl font-bold mb-1">{dueNotes.length} Notes Due</h2>
                    <p className="opacity-80 text-sm">Ready to keep your memory sharp?</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="btn btn-secondary btn-lg gap-3 shadow-lg border-none"
                    onClick={handleStartSession}
                >
                    <Play fill="currentColor" size={20} />
                    Start Session
                </motion.button>
            </div>
        </motion.div>
    );
};
