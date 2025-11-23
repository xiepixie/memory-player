import { ReactNode, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useAppStore } from '../store/appStore';
import { useToastStore } from '../store/toastStore';

interface AuthGateProps {
  children: ReactNode;
}

type AuthStatus = 'checking' | 'no-supabase' | 'needs-login' | 'ready';

export const AuthGate = ({ children }: AuthGateProps) => {
  const initDataService = useAppStore((state) => state.initDataService);
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
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;

        if (error) {
          // Supabase v2 may throw/return an AuthSessionMissingError when no session exists.
          // In that case we simply treat it as "not logged in" and show the login form.
          console.log('[AuthGate] auth check error (expected if not logged in):', error);
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
        // getUser can also reject with AuthSessionMissingError when there is no session
        console.log('[AuthGate] auth check exception (expected if not logged in):', err);
        if (!cancelled) {
          setStatus('needs-login');
        }
      }
    };

    checkUser();

    return () => {
      cancelled = true;
    };
  }, [initDataService]);

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

  if (status === 'no-supabase' || status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-base-300 to-base-200">
      <div className="card w-full max-w-sm bg-base-100 shadow-xl border border-base-200">
        <form className="card-body gap-4" onSubmit={handleSubmit}>
          <h2 className="card-title text-lg">Sign in to your Memory Vault</h2>
          <p className="text-xs opacity-70">
            Use the email and password from Supabase Authentication &rarr; Users. Your notes stay on disk;
            only review progress and metadata are synced to Supabase.
          </p>
          <label className="form-control w-full">
            <span className="label-text text-xs mb-1">Email</span>
            <input
              type="email"
              className="input input-bordered w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text text-xs mb-1">Password</span>
            <input
              type="password"
              className="input input-bordered w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div className="text-error text-xs whitespace-pre-line">
              {error}
            </div>
          )}
          <div className="card-actions justify-end mt-2">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
