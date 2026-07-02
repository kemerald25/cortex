'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, BookOpen, ChevronRight, X, Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function CoursesPage() {
  const supabase = createClient();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [level, setLevel] = useState('100L');
  const [creating, setCreating] = useState(false);

  async function loadCourses() {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCourses(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadCourses();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code || !level) return;

    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase.from('courses').insert({
        user_id: user.id,
        name,
        code,
        level,
      });

      if (!error) {
        setName('');
        setCode('');
        setLevel('100L');
        setShowModal(false);
        await loadCourses();
      } else {
        alert(error.message);
      }
    }
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            Academic
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-0.5">
            Your Courses
          </h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white shadow-lg shadow-indigo-600/10 transition-all flex items-center gap-1.5 font-semibold text-sm"
        >
          <Plus className="w-4.5 h-4.5" />
          <span>Add Course</span>
        </button>
      </div>

      {/* Courses List */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : courses.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center space-y-4">
          <div className="p-4 bg-slate-900/50 rounded-2xl w-fit mx-auto border border-slate-800 text-slate-500">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-white">No courses created yet</h3>
            <p className="text-xs text-slate-400 max-w-[220px] mx-auto">
              Add your first course to begin uploading materials and generating notes.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all"
          >
            Create Course
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="p-4 bg-slate-900/50 border border-slate-850 hover:border-slate-800 rounded-2xl flex justify-between items-center transition-all group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                    {course.code}
                  </span>
                  <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                  <span className="text-[10px] font-bold text-slate-500 tracking-wider">
                    {course.level}
                  </span>
                </div>
                <h3 className="font-bold text-white group-hover:text-indigo-400 transition-colors">
                  {course.name}
                </h3>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 transition-all group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}

      {/* Add Course Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end justify-center md:items-center p-4">
          <div className="bg-slate-950 border border-slate-850 w-full max-w-sm rounded-t-3xl md:rounded-3xl p-6 space-y-6 animate-in slide-in-from-bottom duration-250">
            {/* Modal Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Create New Course</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 bg-slate-900 border border-slate-800 rounded-full hover:bg-slate-850 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Course Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSC 301"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Course Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Database Systems"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Academic Level
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {['100L', '200L', '300L', '400L', '500L'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLevel(lvl)}
                      className={`py-2 rounded-lg font-semibold text-xs border transition-all ${
                        level === lvl
                          ? 'bg-indigo-650 border-indigo-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/35 text-white font-semibold rounded-xl transition-all flex justify-center items-center shadow-lg shadow-indigo-600/10"
              >
                {creating ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Create Course'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
