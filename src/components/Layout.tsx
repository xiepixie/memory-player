import { useAppStore } from '../store/appStore';
import { LibraryView } from './LibraryView';
import { NoteRenderer } from './NoteRenderer';
import { AnimatePresence, motion } from 'framer-motion';
import { useKeyboardShortcuts } from './shared/useKeyboardShortcuts';
import { ToastContainer } from './shared/ToastContainer';

export const Layout = () => {
  const viewMode = useAppStore((state) => state.viewMode);

  // Initialize Global Shortcuts
  useKeyboardShortcuts();

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-base-300 to-base-200 overflow-hidden flex relative">
       <AnimatePresence mode="wait">
         {viewMode === 'library' ? (
            <motion.div
                key="library"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full h-full"
            >
                <LibraryView />
            </motion.div>
         ) : (
             <motion.div
                key="player"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="w-full h-full relative"
             >
                 <NoteRenderer />
             </motion.div>
         )}
       </AnimatePresence>

       <ToastContainer />
    </div>
  );
};
