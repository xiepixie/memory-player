import { ReactNode, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useAppStore } from '../store/appStore';
import { useToastStore } from '../store/toastStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain } from 'lucide-react';

interface AuthGateProps {
  children: ReactNode;
}

type AuthStatus = 'checking' | 'no-supabase' | 'needs-login' | 'ready';

export const AuthGate = ({ children }: AuthGateProps) => {
  const initDataService = useAppStore((state) => state.initDataService);
  const authCheckCounter = useAppStore((state) => state.authCheckCounter);
  const addToast = useToastStore((state) => state.addToast);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      initDataService('mock');
      setStatus('no-supabase');
      return;
    }

    let cancelled = false;

    const checkUser = async () => {
      setStatus('checking');
      // Add a minimum delay to prevent flickering if check is too fast
      const minDelay = new Promise(resolve => setTimeout(resolve, 800));
      
      try {
        const [sessionResult] = await Promise.all([
            supabase.auth.getUser(),
            minDelay
        ]);
        
        const { data, error } = sessionResult;
        if (cancelled) return;

        if (error) {
          console.warn('[AuthGate] auth check error (expected if not logged in):', error);
          setStatus('needs-login');
          return;
        }

        if (data.user) {
          await initDataService('supabase');
          setStatus('ready');
        } else {
          setStatus('needs-login');
        }
      } catch (err) {
        console.warn('[AuthGate] auth check exception (expected if not logged in):', err);
        if (!cancelled) {
          setStatus('needs-login');
        }
      }
    };

    checkUser();

    return () => {
      cancelled = true;
    };
  }, [initDataService, authCheckCounter]);

  useEffect(() => {
    setEmail('');
    setPassword('');
    setError(null);
  }, [authCheckCounter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase is not configured.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        addToast('Login failed', 'error');
        return;
      }
      addToast('Logged in', 'success');
      await initDataService('supabase');
      setStatus('ready');
    } catch (err: any) {
      const message = err?.message || 'Unknown error';
      setError(message);
      addToast('Login failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {(status === 'no-supabase' || status === 'ready') && (
        <motion.div
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full w-full"
        >
            {children}
        </motion.div>
      )}

      {status === 'checking' && (
        <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ duration: 0.5 }}
            className="h-screen w-screen flex flex-col items-center justify-center bg-base-100 fixed inset-0 z-50 select-none relative"
        >
            <div className="absolute inset-0 z-0" data-tauri-drag-region />
            <motion.div
                animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.5, 1, 0.5],
                    rotate: [0, 180, 360]
                }}
                transition={{ 
                    duration: 3, 
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-primary/20 to-secondary/20 flex items-center justify-center mb-8 backdrop-blur-md border border-white/5 shadow-2xl relative z-10"
            >
                <Brain className="w-10 h-10 text-primary drop-shadow-lg" />
            </motion.div>
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-medium text-base-content/40 tracking-[0.2em] uppercase relative z-10"
            >
                Initializing Cortex
            </motion.div>
        </motion.div>
      )}

      {status === 'needs-login' && (
        <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-screen w-screen flex items-center justify-center bg-base-200/50 fixed inset-0 z-50 relative"
        >
            <div className="absolute inset-0 z-0" data-tauri-drag-region />
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div 
                    animate={{ 
                        scale: [1, 1.1, 1],
                        x: [0, 20, 0],
                        y: [0, -20, 0]
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px]" 
                />
                <motion.div 
                    animate={{ 
                        scale: [1, 1.2, 1],
                        x: [0, -30, 0],
                        y: [0, 30, 0]
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-secondary/10 rounded-full blur-[120px]" 
                />
            </div>

          <div className="card w-full max-w-md bg-base-100/60 backdrop-blur-2xl shadow-2xl border border-white/10 relative z-10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
            
            <form className="card-body gap-6 p-8 relative" onSubmit={handleSubmit}>
              <div className="text-center mb-4">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 mx-auto flex items-center justify-center shadow-lg shadow-primary/20 mb-6 ring-1 ring-white/20"
                  >
                      <Brain className="w-8 h-8 text-primary" />
                  </motion.div>
                  <motion.h2 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-base-content to-base-content/60"
                  >
                    Welcome Back
                  </motion.h2>
                  <motion.p 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-sm text-base-content/60 mt-2"
                  >
                    Sign in to sync your neural network
                  </motion.p>
              </div>

              <motion.div 
                className="space-y-4"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                  <div className="form-control w-full group">
                    <label className="label">
                        <span className="label-text text-xs font-bold uppercase text-base-content/40 group-focus-within:text-primary transition-colors">Email</span>
                    </label>
                    <input
                      type="email"
                      id="login-email"
                      name="email"
                      className="input input-bordered w-full bg-base-200/30 focus:bg-base-100 transition-all border-transparent focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="hello@example.com"
                    />
                  </div>
                  <div className="form-control w-full group">
                    <label className="label">
                        <span className="label-text text-xs font-bold uppercase text-base-content/40 group-focus-within:text-primary transition-colors">Password</span>
                    </label>
                    <input
                      type="password"
                      id="login-password"
                      name="password"
                      className="input input-bordered w-full bg-base-200/30 focus:bg-base-100 transition-all border-transparent focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                    />
                  </div>
              </motion.div>

              {error && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-error text-xs bg-error/10 p-3 rounded-lg border border-error/10 flex items-center justify-center text-center"
                >
                  {error}
                </motion.div>
              )}

              <motion.div 
                className="card-actions mt-4"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <button
                  type="submit"
                  className="btn btn-primary w-full shadow-lg shadow-primary/20 hover:shadow-primary/30 h-12 text-base"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    'Sign In'
                  )}
                </button>
              </motion.div>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center text-[10px] opacity-40 mt-4 font-mono"
              >
                Local-first architecture. Your notes stay on your device.
              </motion.p>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

