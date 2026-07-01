'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { User, LogOut, BookOpen, FileText, CheckCircle, GraduationCap } from 'lucide-react';

const LEVELS = ['100L', '200L', '300L', '400L', '500L'];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState<string | null>(null);
  const [academicLevel, setAcademicLevel] = useState<string | null>(null);
  const [coursesCount, setCoursesCount] = useState(0);
  const [materialsCount, setMaterialsCount] = useState(0);
  const [cardsCount, setCardsCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setEmail(user.email || '');

      // Load Profile level
      const { data: profile } = await supabase
        .from('profiles')
        .select('academic_level')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        setAcademicLevel(profile.academic_level);
      }

      // Fetch stats
      const { count: courses } = await supabase
        .from('courses')
        .select('id', { count: 'exact', head: true });
      setCoursesCount(courses || 0);

      const { count: materials } = await supabase
        .from('materials')
        .select('id', { count: 'exact', head: true });
      setMaterialsCount(materials || 0);

      const { count: cards } = await supabase
        .from('flashcards')
        .select('id', { count: 'exact', head: true });
      setCardsCount(cards || 0);

      setLoading(false);
    }
    
    loadProfile();
  }, [supabase, router]);

  const handleUpdateLevel = async (level: string) => {
    setUpdating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          academic_level: level,
        });

      if (!error) {
        setAcademicLevel(level);
      }
    }
    setUpdating(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
          Student Portal
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
          Your Profile
        </h1>
      </div>

      {/* User Info card */}
      <div className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl flex items-center gap-3">
        <div className="p-3 bg-indigo-500/10 border border-indigo-900/20 text-indigo-400 rounded-xl">
          <User className="w-6 h-6" />
        </div>
        <div className="overflow-hidden">
          <h2 className="text-sm font-bold text-white truncate">{email}</h2>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Student Account</span>
        </div>
      </div>

      {/* Stats block */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-center">
          <div className="text-lg font-bold text-white">{coursesCount}</div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Courses</div>
        </div>
        <div className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-center">
          <div className="text-lg font-bold text-white">{materialsCount}</div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Materials</div>
        </div>
        <div className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-center">
          <div className="text-lg font-bold text-white">{cardsCount}</div>
          <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">Flashcards</div>
        </div>
      </div>

      {/* Academic Level selection */}
      <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <GraduationCap className="w-4 h-4 text-indigo-400" />
          <span>Academic Level Settings</span>
        </h3>

        <div className="grid grid-cols-5 gap-1.5">
          {LEVELS.map((lvl) => {
            const isSelected = academicLevel === lvl;
            return (
              <button
                key={lvl}
                type="button"
                disabled={updating}
                onClick={() => handleUpdateLevel(lvl)}
                className={`py-2 rounded-lg font-semibold text-xs border transition-all ${
                  isSelected
                    ? 'bg-indigo-650 border-indigo-500 text-white shadow-md'
                    : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Log out */}
      <button
        onClick={handleSignOut}
        className="w-full py-4 border border-rose-900/30 text-rose-450 hover:bg-rose-950/15 font-semibold rounded-xl text-xs transition-all flex justify-center items-center gap-2"
      >
        <LogOut className="w-4.5 h-4.5" />
        <span>Sign Out Account</span>
      </button>
    </div>
  );
}
