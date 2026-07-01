'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { GraduationCap, ArrowRight } from 'lucide-react';

const LEVELS = ['100L', '200L', '300L', '400L', '500L'];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      } else {
        router.push('/login');
      }
    }
    getUser();
  }, [supabase, router]);

  const handleSubmit = async () => {
    if (!selectedLevel || !userId) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          academic_level: selectedLevel,
        });

      if (error) throw error;

      router.refresh();
      router.push('/');
    } catch (err) {
      console.error('Error saving onboarding info:', err);
      alert('Failed to save academic level. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 md:max-w-md md:mx-auto md:shadow-2xl md:border-x md:border-slate-800">
      <div className="flex-1 flex flex-col justify-center gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="p-4 bg-indigo-600/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
            <GraduationCap className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mt-2">
            Welcome to Cortex
          </h1>
          <p className="text-slate-400 text-sm max-w-[280px]">
            To customize your study experience, please select your current academic level.
          </p>
        </div>

        {/* Level Selectors */}
        <div className="grid grid-cols-1 gap-3">
          {LEVELS.map((level) => {
            const isSelected = selectedLevel === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setSelectedLevel(level)}
                className={`py-4 px-6 rounded-xl border text-left font-semibold transition-all flex justify-between items-center ${
                  isSelected
                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-lg shadow-indigo-600/5'
                    : 'bg-slate-900/50 border-slate-850 text-slate-400 hover:border-slate-800 hover:text-slate-350'
                }`}
              >
                <span>{level} Undergraduate</span>
                {isSelected && <ArrowRight className="w-5 h-5 text-indigo-400 animate-pulse" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full flex-none">
        <button
          type="button"
          disabled={!selectedLevel || loading}
          onClick={handleSubmit}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/10 flex justify-center items-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <>
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>

      {/* Bottom spacer for mobile */}
      <div className="h-6"></div>
    </div>
  );
}
