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

    const handleReviewAhead = () => {
        // Find future notes
        const futureNotes = files.filter(f => {
            const meta = fileMetadatas[f];
            if (!meta || !meta.card) return false;
            return new Date(meta.card.due) > now;
        }).sort((a, b) => {
            const dateA = new Date(fileMetadatas[a].card!.due).getTime();
            const dateB = new Date(fileMetadatas[b].card!.due).getTime();
            return dateA - dateB;
        }).slice(0, 20); // Take next 20

        if (futureNotes.length > 0) {
            setQueue(futureNotes);
            startSession();
        }
    };

    if (dueNotes.length === 0) {
        return (
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card bg-gradient-to-br from-base-100 to-base-200/50 border border-base-200 shadow-sm mb-6 overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-success/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="card-body flex-row items-center justify-between p-6 relative z-10">
                    <div>
                        <h2 className="card-title text-2xl font-bold mb-1 text-success">All Caught Up! 🎉</h2>
                        <p className="opacity-60 text-sm">You've reviewed all your due notes.</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="btn btn-ghost btn-outline gap-2"
                        onClick={handleReviewAhead}
                    >
                        <Play size={16} />
                        Review Ahead (20)
                    </motion.button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card bg-gradient-to-r from-primary to-secondary text-primary-content shadow-xl mb-6 overflow-hidden relative"
        >
            {/* Decorative background circle */}
            <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/5 rounded-full blur-2xl pointer-events-none" />

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
