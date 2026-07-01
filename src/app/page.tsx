'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { Brain, BookOpen, FileText, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [profile, setProfile] = useState<any>(null);
  const [coursesCount, setCoursesCount] = useState(0);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [dueCardsCount, setDueCardsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      // Fetch profile
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(prof);

      // Fetch courses count
      const { count: courses } = await supabase
        .from('courses')
        .select('id', { count: 'exact', head: true });
      setCoursesCount(courses || 0);

      // Fetch materials count
      const { count: materials } = await supabase
        .from('materials')
        .select('id', { count: 'exact', head: true });
      setMaterialsCount(materials || 0);

      // Fetch due flashcards count
      const { count: dueCards } = await supabase
        .from('flashcards')
        .select('id', { count: 'exact', head: true })
        .lte('next_review_date', new Date().toISOString());
      setDueCardsCount(dueCards || 0);

      setLoading(false);
    }

    loadDashboardData();
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 mt-4 text-sm font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            Dashboard
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
            Cortex Hub
          </h1>
        </div>
        <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs text-slate-350 font-medium">
          {profile?.academic_level || 'Onboarding...'} Level
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3">
        <Link 
          href="/courses"
          className="bg-slate-900/40 border border-slate-850 hover:border-slate-800 p-4 rounded-2xl flex flex-col justify-between h-28 transition-all"
        >
          <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 w-fit">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{coursesCount}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Courses</div>
          </div>
        </Link>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-2xl flex flex-col justify-between h-28">
          <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400 w-fit">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{materialsCount}</div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Materials</div>
          </div>
        </div>
      </div>

      {/* Action SRS Card */}
      <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border border-indigo-550/30 p-5 rounded-2xl shadow-xl shadow-indigo-950/10 relative overflow-hidden">
        <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-10">
          <Brain className="w-40 h-40 text-indigo-400" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Active Recall</span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">Daily Review Queue</h2>
            <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
              {dueCardsCount > 0 
                ? `You have ${dueCardsCount} flashcards due for review today.`
                : "You're all caught up! No flashcards due today."}
            </p>
          </div>

          <Link
            href="/study"
            className={`w-full py-3 rounded-xl font-bold text-sm text-center flex justify-center items-center gap-1.5 transition-all ${
              dueCardsCount > 0
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <span>Start Review Session</span>
            <ChevronRight className="w-4.5 h-4.5" />
          </Link>
        </div>
      </div>

      {/* Quick Tips or Guideline */}
      <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">How to Study with Cortex</h3>
        <ul className="space-y-3.5 text-xs text-slate-400">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Create a <strong>Course</strong> (e.g. CSC 301).</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Upload slides, textbooks, or notes.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Cortex extracts <strong>Topics</strong>; approve or reorder them.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Generate structured <strong>Notes</strong> and review <strong>Flashcards</strong>.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
