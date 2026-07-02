'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Users, BookOpen, FileText, Sparkles, MessageSquare, 
  Clock, ArrowLeft, AlertTriangle, RefreshCw, Search, ShieldAlert
} from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'activity'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    total_users: 0,
    total_courses: 0,
    total_materials: 0,
    total_notes: 0,
    total_chats: 0
  });
  
  const [users, setUsers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any>({
    courses: [],
    materials: [],
    chats: []
  });

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/stats');
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(data.error || 'Access denied: Admin only.');
        }
        throw new Error(data.error || 'Failed to load admin stats.');
      }
      
      setStats(data.stats);
      setUsers(data.users);
      setActivities(data.activities);
      if (data.warning) {
        setWarning(data.warning);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.academic_level?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-6 text-center space-y-4 max-w-sm mx-auto">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-450 rounded-2xl">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Access Restricted</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error} Make sure you are logged in with the correct account or verify the admin email setting in your environment variables.
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="w-full py-3 bg-slate-900 border border-slate-800 text-white font-semibold rounded-xl text-xs transition-all hover:bg-slate-850 flex items-center justify-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => router.push('/')}
            className="p-2.5 bg-slate-900 border border-slate-850 rounded-xl hover:bg-slate-800 text-slate-450 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              Control Panel
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
              Admin Dashboard
            </h1>
          </div>
        </div>
        <button 
          onClick={loadAdminData}
          className="p-2.5 bg-indigo-650 hover:bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-600/10 transition-all"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Warnings */}
      {warning && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-3 text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider">Security Warning</h4>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Anyone authenticated can access this control panel because the <code>ADMIN_EMAIL</code> environment variable is not configured.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-slate-900/30 border border-slate-900/85 p-4 rounded-2xl flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Users</span>
            <Users className="w-4.5 h-4.5 text-indigo-400" />
          </div>
          <span className="text-2xl font-bold text-white leading-none mt-2">{stats.total_users}</span>
        </div>

        <div className="bg-slate-900/30 border border-slate-900/85 p-4 rounded-2xl flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Courses</span>
            <BookOpen className="w-4.5 h-4.5 text-violet-400" />
          </div>
          <span className="text-2xl font-bold text-white leading-none mt-2">{stats.total_courses}</span>
        </div>

        <div className="bg-slate-900/30 border border-slate-900/85 p-4 rounded-2xl flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Uploaded Files</span>
            <FileText className="w-4.5 h-4.5 text-pink-400" />
          </div>
          <span className="text-2xl font-bold text-white leading-none mt-2">{stats.total_materials}</span>
        </div>

        <div className="bg-slate-900/30 border border-slate-900/85 p-4 rounded-2xl flex flex-col justify-between h-[100px]">
          <div className="flex justify-between items-start text-slate-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">AI Notes</span>
            <Sparkles className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <span className="text-2xl font-bold text-white leading-none mt-2">{stats.total_notes}</span>
        </div>
      </div>

      <div className="bg-indigo-950/15 border border-indigo-900/20 p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">AI Support Queries</h4>
            <span className="text-[10px] text-indigo-300 font-medium">Chat messages processed</span>
          </div>
        </div>
        <span className="text-xl font-bold text-indigo-400 pr-1">{stats.total_chats}</span>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-900">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'users'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-450 hover:text-white'
          }`}
        >
          Users List ({filteredUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'activity'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-450 hover:text-white'
          }`}
        >
          Recent Activity Feed
        </button>
      </div>

      {/* Search Input for Users */}
      {activeTab === 'users' && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search users by email or academic level..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs"
          />
        </div>
      )}

      {/* Tab Contents */}
      {activeTab === 'users' ? (
        <div className="space-y-3">
          {filteredUsers.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-850 rounded-2xl text-center text-xs text-slate-500">
              No users found matching search criteria.
            </div>
          ) : (
            filteredUsers.map((u) => (
              <div 
                key={u.id}
                className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-white truncate max-w-[200px]">
                    {u.email}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[9px] text-indigo-400 font-bold uppercase tracking-wider">
                    {u.academic_level}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-900 pt-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Joined</span>
                    <span className="text-[11px] text-slate-350 font-semibold">
                      {new Date(u.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Courses</span>
                    <span className="text-[11px] text-slate-350 font-semibold">{u.courses_count}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Materials</span>
                    <span className="text-[11px] text-slate-350 font-semibold">{u.materials_count}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Recent Courses Feed */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-violet-400" />
              <span>Recent Courses Created</span>
            </h3>
            {activities.courses.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500">
                No courses created recently.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activities.courses.map((c: any) => (
                  <div key={c.id} className="p-3 bg-slate-900/20 border border-slate-900 rounded-xl flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-indigo-400 uppercase tracking-wider">{c.code}</span>
                      <span className="text-slate-500 font-semibold">{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="text-xs font-bold text-white">{c.name}</h4>
                    <span className="text-[9px] text-slate-450 truncate">Creator: {c.user_email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Materials Uploaded */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-pink-400" />
              <span>Recent Uploaded Materials</span>
            </h3>
            {activities.materials.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500">
                No materials uploaded recently.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activities.materials.map((m: any) => (
                  <div key={m.id} className="p-3 bg-slate-900/20 border border-slate-900 rounded-xl flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-pink-400 uppercase tracking-wider">{m.type}</span>
                      <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] text-slate-400 capitalize font-medium">
                        {m.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-white truncate max-w-[280px]">{m.name}</h4>
                    <div className="flex justify-between items-center text-[9px] text-slate-450 mt-1">
                      <span className="truncate max-w-[180px]">Uploader: {m.user_email}</span>
                      <span className="text-slate-500">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent AI Chat Queries */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span>Recent AI Chats (Grounded)</span>
            </h3>
            {activities.chats.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-850 rounded-xl text-center text-xs text-slate-500">
                No chat messages exchanged recently.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activities.chats.map((ch: any) => (
                  <div key={ch.id} className="p-3.5 bg-slate-900/20 border border-slate-900 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-[10px] text-slate-500">
                      <span className="font-bold text-amber-400 truncate max-w-[150px]">Topic: {ch.topic_title}</span>
                      <span>{new Date(ch.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-350 italic leading-relaxed whitespace-pre-line bg-slate-900/40 p-2.5 border border-slate-900 rounded-lg">
                      "{ch.content}"
                    </p>
                    <div className="text-[9px] text-slate-450 text-right">
                      Asked by: {ch.user_email}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
