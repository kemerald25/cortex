'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Mail, Lock, BookOpen, MailOpen, X } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Sign up
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          // In Supabase, if email verification is disabled, user is immediately logged in with a session.
          // If email verification is enabled, session is null, and user must verify first.
          if (data.session) {
            router.refresh();
            router.push('/onboarding');
          } else {
            setShowVerificationModal(true);
          }
        }
      } else {
        // Log in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        router.refresh();
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseModal = () => {
    setShowVerificationModal(false);
    setIsSignUp(false);
    setPassword('');
  };

  return (
    <>
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:max-w-md md:mx-auto md:shadow-2xl md:border-x md:border-slate-800">
        {/* Top Section */}
        <div className="flex-1 flex flex-col justify-center items-center gap-2">
          <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
            <Image src="/logo.svg" alt="CortexLogo" width={48} height={48} className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mt-2">
            Cortex
          </h1>
          <p className="text-slate-400 text-sm text-center max-w-[260px]">
            Turn your study materials into structured recall notes and flashcards.
          </p>
        </div>

        {/* Form Section */}
        <div className="w-full flex-none">
          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="p-3 text-sm bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700/50 disabled:text-slate-400 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex justify-center items-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Toggle Sign Up / Log In */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-all"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        {/* Bottom spacing for mobile */}
        <div className="h-6"></div>
      </div>

      {showVerificationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md transition-opacity duration-300">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center transition-all duration-300 transform scale-100">
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute right-4 top-4 p-1 text-slate-500 hover:text-white rounded-full hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Icon */}
            <div className="w-16 h-16 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-5 mt-2 animate-bounce">
              <MailOpen className="w-8 h-8" />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-white mb-2">
              Check your email
            </h3>

            {/* Description */}
            <p className="text-slate-400 text-sm mb-6 px-2 leading-relaxed">
              We've sent a verification link to{' '}
              <span className="text-indigo-400 font-semibold break-all">{email}</span>.
              Please check your inbox to verify your email and continue.
            </p>

            {/* Action Buttons */}
            <div className="w-full space-y-3">
              <a
                href={
                  email.includes('gmail.com')
                    ? 'https://mail.google.com'
                    : email.includes('outlook.com') || email.includes('hotmail.com')
                    ? 'https://outlook.live.com'
                    : 'mailto:' + email
                }
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                Open Email App
              </a>
              <button
                onClick={handleCloseModal}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all border border-slate-700/50 cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
