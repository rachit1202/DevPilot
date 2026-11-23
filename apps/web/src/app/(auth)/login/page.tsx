'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, EyeOff, ShieldCheck, Sparkles, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const { user, login, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('admin@codeculture.dev');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-devpilot-bg flex items-center justify-center p-4 selection:bg-devpilot-purple selection:text-white">
      {/* Subtle background ambient blur */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-devpilot-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/3 w-80 h-80 bg-devpilot-cyan/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Brand Title */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-devpilot-purple to-devpilot-cyan flex items-center justify-center mx-auto shadow-lg shadow-purple-950/50 mb-4">
            <span className="font-bold text-white text-xl">DP</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-devpilot-text">DevPilot</h1>
          <p className="text-xs text-devpilot-muted mt-1">Your AI-powered social media command center</p>
          <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-devpilot-subtle">
            <span>Managing:</span>
            <span className="text-devpilot-text font-medium">CodeCulture</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-devpilot-card rounded-2xl border border-devpilot-border shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-devpilot-text">Command Center Sign In</h2>
            <p className="text-xs text-devpilot-muted mt-1">
              Enter your credentials to manage CodeCulture operations.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-devpilot-danger/10 border border-devpilot-danger/30 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-devpilot-danger" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                Admin Email
              </label>
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="admin@codeculture.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-devpilot-muted mb-1.5">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-devpilot-subtle hover:text-devpilot-text transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-2"
              size="lg"
              isLoading={isSubmitting}
            >
              Sign In to Command Center
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-devpilot-border/50 flex items-center justify-between text-[11px] text-devpilot-subtle">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-devpilot-success" />
              HttpOnly Secure Session
            </span>
            <span>Local Node • v1.0.0</span>
          </div>
        </div>

        {/* Footer Tagline */}
        <p className="text-center text-xs text-devpilot-subtle mt-6">
          CodeCulture — Code. Create. Build. Repeat.
        </p>
      </div>
    </div>
  );
}
