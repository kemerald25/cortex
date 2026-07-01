'use client';

import { useState, useEffect, use } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { 
  FileText, Upload, Plus, Sparkles, AlertCircle, 
  Trash2, Edit3, ArrowUp, ArrowDown, Check, Save 
} from 'lucide-react';

export default function CourseDetailsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const router = useRouter();
  const supabase = createClient();
  const { courseId } = use(params);

  const [course, setCourse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'topics'>('materials');
  const [loading, setLoading] = useState(true);

  // Materials states
  const [materials, setMaterials] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [materialName, setMaterialName] = useState('');
  const [materialType, setMaterialType] = useState('notes'); // textbook, past questions, slides, notes
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Topics states
  const [topics, setTopics] = useState<any[]>([]);
  const [extractingTopics, setExtractingTopics] = useState(false);
  const [isConfirmingTOC, setIsConfirmingTOC] = useState(false);
  const [proposedTOC, setProposedTOC] = useState<any[] | null>(null); // Proposed but unconfirmed

  async function loadCourseDetails() {
    setLoading(true);
    // Fetch course
    const { data: c, error: cErr } = await supabase
      .from('courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (cErr || !c) {
      router.push('/courses');
      return;
    }
    setCourse(c);

    // Fetch materials
    const { data: mats } = await supabase
      .from('materials')
      .select('*')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false });
    setMaterials(mats || []);

    // Fetch confirmed topics
    const { data: tops } = await supabase
      .from('topics')
      .select('*')
      .eq('course_id', courseId)
      .order('order_index', { ascending: true });
    
    // Check if topics are confirmed
    if (tops && tops.length > 0 && tops[0].is_confirmed) {
      setTopics(tops);
      setProposedTOC(null);
    } else if (tops && tops.length > 0) {
      // Unconfirmed topics exists, let's treat them as proposed
      setProposedTOC(tops);
    } else {
      setTopics([]);
      setProposedTOC(null);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCourseDetails();
  }, [courseId]);

  // Handle Material Upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !materialName || !course) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const fileExt = selectedFile.name.split('.').pop();
      const storagePath = `${user.id}/${Date.now()}.${fileExt}`;

      // 1. Upload to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('materials')
        .upload(storagePath, selectedFile);

      if (storageError) throw storageError;

      // 2. Insert record in materials table
      const { data: matRecord, error: dbError } = await supabase
        .from('materials')
        .insert({
          course_id: courseId,
          name: materialName,
          type: materialType,
          file_path: storagePath,
          status: 'pending',
        })
        .select()
        .single();

      if (dbError || !matRecord) throw dbError || new Error('Failed to create material record');

      // Reset Form
      setMaterialName('');
      setSelectedFile(null);
      
      // Reload lists
      await loadCourseDetails();

      // 3. Trigger OCR/Text Extraction API route asynchronously
      fetch('/api/materials/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: matRecord.id }),
      }).then(() => {
        // Reload details to capture updated extraction status
        loadCourseDetails();
      });

    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Trigger AI topic extraction
  const handleExtractTopics = async () => {
    setExtractingTopics(true);
    try {
      const response = await fetch('/api/courses/extract-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      });

      const res = await response.json();
      if (!response.ok) throw new Error(res.error || 'Failed to extract topics');

      setProposedTOC(res.topics.map((t: any, i: number) => ({ ...t, order_index: i })));
    } catch (err: any) {
      alert(`Error extracting topics: ${err.message}`);
    } finally {
      setExtractingTopics(false);
    }
  };

  // Save/Confirm the Table of Contents
  const handleConfirmTOC = async () => {
    if (!proposedTOC) return;
    setIsConfirmingTOC(true);

    try {
      const response = await fetch('/api/courses/confirm-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          topics: proposedTOC,
        }),
      });

      const res = await response.json();
      if (!response.ok) throw new Error(res.error || 'Failed to confirm TOC');

      await loadCourseDetails();
    } catch (err: any) {
      alert(`Error confirming TOC: ${err.message}`);
    } finally {
      setIsConfirmingTOC(false);
    }
  };

  // Proposed TOC editing helpers
  const handleUpdateProposedItem = (index: number, key: string, value: string) => {
    if (!proposedTOC) return;
    const updated = [...proposedTOC];
    updated[index][key] = value;
    setProposedTOC(updated);
  };

  const handleMoveProposedItem = (index: number, direction: 'up' | 'down') => {
    if (!proposedTOC) return;
    const updated = [...proposedTOC];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= updated.length) return;

    // Swap
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    setProposedTOC(updated);
  };

  const handleAddProposedItem = () => {
    if (!proposedTOC) {
      setProposedTOC([{ title: 'New Topic', description: 'Describe what this topic covers.', order_index: 0 }]);
      return;
    }
    setProposedTOC([
      ...proposedTOC,
      {
        title: 'New Topic',
        description: 'Describe what this topic covers.',
        order_index: proposedTOC.length,
      },
    ]);
  };

  const handleDeleteProposedItem = (index: number) => {
    if (!proposedTOC) return;
    setProposedTOC(proposedTOC.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-550 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Course Info */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">{course?.code}</span>
          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
          <span className="text-xs text-slate-500 font-bold">{course?.level} Level</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{course?.name}</h1>
      </div>

      {/* Custom segmented tab control */}
      <div className="flex bg-slate-900/60 p-1.5 rounded-xl border border-slate-850">
        <button
          onClick={() => setActiveTab('materials')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'materials'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Study Materials ({materials.length})
        </button>
        <button
          onClick={() => setActiveTab('topics')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'topics'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Topics Table of Contents
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'materials' && (
        <div className="space-y-6">
          {/* Upload Form */}
          <form onSubmit={handleUpload} className="bg-slate-900/30 border border-slate-900 p-4 rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-indigo-400" />
              <span>Upload Material</span>
            </h2>

            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  required
                  placeholder="Material name (e.g. Lecture 1 Slides)"
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <select
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                    className="w-full px-3 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs"
                  >
                    <option value="notes">Notes</option>
                    <option value="slides">Slides</option>
                    <option value="textbook">Textbook</option>
                    <option value="past questions">Past Questions</option>
                  </select>
                </div>

                <div className="relative">
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        if (!materialName) {
                          // Auto fill name
                          const base = e.target.files[0].name.split('.').slice(0, -1).join('.');
                          setMaterialName(base);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-full px-3 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-xs font-semibold text-center border-dashed hover:border-slate-700 transition-all overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedFile ? selectedFile.name : 'Select PDF/DOCX/Photo'}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white font-bold rounded-xl text-xs transition-all flex justify-center items-center gap-1.5"
              >
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Upload & Process</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Materials List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Uploaded Materials</h3>
            {materials.length === 0 ? (
              <div className="p-6 border border-slate-900 rounded-2xl text-center text-xs text-slate-500">
                No materials uploaded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl flex justify-between items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-950 text-indigo-400 rounded-xl border border-indigo-900/50">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm">{mat.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-indigo-400/90 uppercase tracking-wider">
                            {mat.type}
                          </span>
                          <span className="w-1 h-1 bg-slate-800 rounded-full"></span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            mat.status === 'completed' ? 'text-emerald-400' :
                            mat.status === 'extracting' ? 'text-amber-400 animate-pulse' :
                            mat.status === 'failed' ? 'text-rose-450' : 'text-slate-500'
                          }`}>
                            {mat.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Topics Tab */}
      {activeTab === 'topics' && (
        <div className="space-y-6">
          {/* Confirmed Topics List */}
          {topics.length > 0 && !proposedTOC && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Course Syllabus</h3>
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Confirmed
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {topics.map((topic, i) => (
                  <button
                    key={topic.id}
                    onClick={() => router.push(`/courses/${courseId}/topics/${topic.id}`)}
                    className="p-4 bg-slate-900/50 border border-slate-850 hover:border-slate-800 rounded-2xl text-left transition-all group flex justify-between items-start"
                  >
                    <div className="space-y-1 pr-4">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                        Topic {i + 1}
                      </div>
                      <h4 className="font-bold text-white group-hover:text-indigo-400 transition-colors">
                        {topic.title}
                      </h4>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {topic.description}
                      </p>
                    </div>
                    <div className="p-1 bg-slate-850 border border-slate-800 text-slate-400 group-hover:text-white rounded-lg flex items-center justify-center shrink-0 mt-1">
                      <Plus className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Proposal Generation Trigger */}
          {topics.length === 0 && !proposedTOC && (
            <div className="p-8 border border-dashed border-slate-900 rounded-3xl text-center space-y-5">
              <div className="p-4 bg-slate-900/40 rounded-2xl w-fit mx-auto border border-slate-850 text-indigo-400">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white">Generate Table of Contents</h3>
                <p className="text-xs text-slate-400 max-w-[260px] mx-auto">
                  Cortex can analyze all uploaded study materials and outline a custom syllabus of study topics.
                </p>
              </div>

              {materials.filter(m => m.status === 'completed').length === 0 ? (
                <div className="p-3 text-xs bg-amber-500/10 border border-amber-500/25 text-amber-400 rounded-xl flex items-center gap-2 max-w-[280px] mx-auto">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Upload and parse at least one material first.</span>
                </div>
              ) : (
                <button
                  onClick={handleExtractTopics}
                  disabled={extractingTopics}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 mx-auto"
                >
                  {extractingTopics ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Analyzing Materials...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4.5 h-4.5" />
                      <span>Generate Topics Syllabus</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Proposed TOC (Editable Screen) */}
          {proposedTOC && (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl space-y-1">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Proposed Table of Contents</h3>
                <p className="text-[11px] text-slate-400">
                  Review the topics below. You can edit names, reorder, delete, or add topics before confirming.
                </p>
              </div>

              <div className="space-y-3">
                {proposedTOC.map((item, index) => (
                  <div
                    key={index}
                    className="p-4 bg-slate-900/40 border border-slate-850 rounded-2xl space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Topic {index + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveProposedItem(index, 'up')}
                          className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 rounded-lg text-slate-400"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={index === proposedTOC.length - 1}
                          onClick={() => handleMoveProposedItem(index, 'down')}
                          className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 rounded-lg text-slate-400"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProposedItem(index)}
                          className="p-1 bg-slate-900 hover:bg-rose-900/30 hover:text-rose-400 rounded-lg text-slate-450 ml-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateProposedItem(index, 'title', e.target.value)}
                        placeholder="Topic Title"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-bold"
                      />
                      <textarea
                        value={item.description}
                        onChange={(e) => handleUpdateProposedItem(index, 'description', e.target.value)}
                        placeholder="Topic Description"
                        rows={2}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAddProposedItem}
                  className="py-3 border border-slate-800 text-slate-350 hover:text-white rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Topic</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmTOC}
                  disabled={isConfirmingTOC || proposedTOC.length === 0}
                  className="py-3 bg-indigo-650 hover:bg-indigo-600 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition-all flex justify-center items-center gap-1.5 shadow-lg shadow-indigo-600/5"
                >
                  {isConfirmingTOC ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Confirm Syllabus</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
