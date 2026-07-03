'use client';

import { useState, useEffect, useRef, use } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { calculateSM2 } from '@/utils/srs';
import { 
  Sparkles, MessageSquare, Plus, CheckCircle, Image, 
  Trash2, HelpCircle, Eye, EyeOff, RotateCw, X, ChevronRight, Send, ChevronLeft
} from 'lucide-react';

const formatListText = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap(item => typeof item === 'string' ? item.split('\n') : [JSON.stringify(item)]);
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.flatMap(item => typeof item === 'string' ? item.split('\n') : [JSON.stringify(item)]);
      }
    } catch (_) {}
    return val.split('\n');
  }
  return [JSON.stringify(val)];
};

export default function TopicDetailsPage({ params }: { params: Promise<{ courseId: string; topicId: string }> }) {
  const router = useRouter();
  const supabase = createClient();
  const { courseId, topicId } = use(params);

  const [topic, setTopic] = useState<any>(null);
  const [activeSubTab, setActiveSubTab] = useState<'note' | 'additions' | 'flashcards'>('note');
  const [loading, setLoading] = useState(true);

  // Note states
  const [note, setNote] = useState<any>(null);
  const [generatingNote, setGeneratingNote] = useState(false);

  // Additions states
  const [additions, setAdditions] = useState<any[]>([]);
  const [additionText, setAdditionText] = useState('');
  const [additionFile, setAdditionFile] = useState<File | null>(null);
  const [addingAddition, setAddingAddition] = useState(false);

  // Flashcards states
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [showAddCard, setShowAddCard] = useState(false);

  // Chat states
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  async function loadTopicData() {
    setLoading(true);
    // Fetch Topic
    const { data: t } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();
    setTopic(t);

    if (t) {
      // Fetch Note
      const { data: n } = await supabase
        .from('notes')
        .select('*')
        .eq('topic_id', topicId)
        .single();
      setNote(n);

      // Fetch Additions
      const { data: adds } = await supabase
        .from('additions')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });
      setAdditions(adds || []);

      // Fetch Flashcards
      const { data: cards } = await supabase
        .from('flashcards')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true });
      setFlashcards(cards || []);
    }
    setLoading(false);
  }

  // Load chat messages
  async function loadChatMessages() {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true });
    setMessages(msgs || []);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }

  useEffect(() => {
    loadTopicData();
  }, [topicId]);

  useEffect(() => {
    if (showChat) {
      loadChatMessages();
    }
  }, [showChat]);

  // Generate study Note via AI
  const handleGenerateNote = async () => {
    setGeneratingNote(true);
    try {
      const res = await fetch('/api/topics/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate note');
      
      setNote(data.note);
      
      // Auto trigger flashcard generation right after note is generated
      handleGenerateFlashcards();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setGeneratingNote(false);
    }
  };

  // Generate Flashcards via AI
  const handleGenerateFlashcards = async () => {
    setGeneratingCards(true);
    try {
      const res = await fetch('/api/topics/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate flashcards');

      setFlashcards(data.flashcards || []);
      setCurrentCardIndex(0);
    } catch (err: any) {
      alert(`Error generating cards: ${err.message}`);
    } finally {
      setGeneratingCards(false);
    }
  };

  // Save Text or Image Addition
  const handleAddAddition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!additionText && !additionFile) return;

    setAddingAddition(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not logged in');

      let filePath = null;

      if (additionFile) {
        // Upload photo first
        const fileExt = additionFile.name.split('.').pop();
        filePath = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: storageError } = await supabase.storage
          .from('additions')
          .upload(filePath, additionFile);
        if (storageError) throw storageError;
      }

      // Call API to process text/OCR, chunk, embed, and insert addition
      const res = await fetch('/api/topics/add-addition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          type: additionFile ? 'image' : 'text',
          content: additionText,
          filePath,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save addition');

      setAdditionText('');
      setAdditionFile(null);
      
      // Reload additions list
      const { data: adds } = await supabase
        .from('additions')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });
      setAdditions(adds || []);
    } catch (err: any) {
      alert(`Error saving addition: ${err.message}`);
    } finally {
      setAddingAddition(false);
    }
  };

  // Add Custom Flashcard manually
  const handleCreateCustomCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion || !newAnswer) return;

    const { data: card, error } = await supabase
      .from('flashcards')
      .insert({
        topic_id: topicId,
        question: newQuestion,
        answer: newAnswer,
        source: 'user',
        next_review_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && card) {
      setFlashcards([...flashcards, card]);
      setNewQuestion('');
      setNewAnswer('');
      setShowAddCard(false);
    } else {
      alert(error?.message || 'Failed to add card');
    }
  };

  // Delete a Flashcard
  const handleDeleteCard = async (id: string) => {
    const { error } = await supabase
      .from('flashcards')
      .delete()
      .eq('id', id);

    if (!error) {
      setFlashcards(flashcards.filter(c => c.id !== id));
      if (currentCardIndex >= flashcards.length - 1) {
        setCurrentCardIndex(Math.max(0, flashcards.length - 2));
      }
      setIsFlipped(false);
    }
  };

  // Review flashcard using SM-2 scheduling
  const handleReviewRating = async (qualityScore: number) => {
    const currentCard = flashcards[currentCardIndex];
    if (!currentCard) return;

    // Calculate new metrics
    const updatedMetrics = calculateSM2(
      qualityScore,
      currentCard.repetitions || 0,
      currentCard.interval || 0,
      currentCard.ease_factor || 2.5
    );

    // Save to database
    const { error } = await supabase
      .from('flashcards')
      .update({
        ease_factor: updatedMetrics.ease_factor,
        interval: updatedMetrics.interval,
        repetitions: updatedMetrics.repetitions,
        next_review_date: updatedMetrics.next_review_date,
      })
      .eq('id', currentCard.id);

    if (error) {
      console.error('Failed to update flashcard review schedule:', error);
    }

    // Go to next card in stack
    setIsFlipped(false);
    setTimeout(() => {
      if (currentCardIndex < flashcards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
      } else {
        // Wrapped around / finished deck
        setCurrentCardIndex(0);
      }
    }, 150);
  };

  // Grounded Chat submission
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingMessage) return;

    const userMsg = chatInput;
    setChatInput('');
    setSendingMessage(true);

    // Optimistically update messages list
    const tempUserMsg = { id: Math.random().toString(), role: 'user', content: userMsg, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topicId,
          message: userMsg,
        }),
      });

      const res = await response.json();
      if (!response.ok) throw new Error(res.error || 'Failed to chat');

      setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), res.message.userMsg || tempUserMsg, res.message]);
    } catch (err: any) {
      alert(`Chat error: ${err.message}`);
    } finally {
      setSendingMessage(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const currentCard = flashcards[currentCardIndex];

  return (
    <div className="space-y-6 relative pb-10">
      {/* Title */}
      <div className="space-y-1">
        <button
          onClick={() => router.push(`/courses/${courseId}`)}
          className="flex items-center gap-1 text-slate-400 hover:text-white text-xs font-semibold mb-2 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Course</span>
        </button>
        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
          Course Syllabus Topic
        </span>
        <h1 className="text-xl font-bold text-white leading-tight">
          {topic?.title}
        </h1>
      </div>

      {/* Pill Segmented Tab Bar */}
      <div className="flex bg-slate-900/60 p-1 rounded-xl border border-slate-850">
        <button
          onClick={() => setActiveSubTab('note')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeSubTab === 'note'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Study Note
        </button>
        <button
          onClick={() => setActiveSubTab('additions')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeSubTab === 'additions'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          My Additions
        </button>
        <button
          onClick={() => setActiveSubTab('flashcards')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeSubTab === 'flashcards'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Flashcards ({flashcards.length})
        </button>
      </div>

      {/* Note View */}
      {activeSubTab === 'note' && (
        <div className="space-y-5">
          {note ? (
            <div className="space-y-5 text-sm leading-relaxed">
              {/* Regenerate Button Bar */}
              <div className="flex justify-between items-center bg-slate-900/40 p-3.5 rounded-2xl border border-slate-850">
                <span className="text-xs text-slate-400 font-medium">Study note generated from material.</span>
                <button
                  onClick={handleGenerateNote}
                  disabled={generatingNote}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 disabled:bg-slate-900 text-slate-200 hover:text-white rounded-xl text-[11px] font-bold transition-all border border-slate-750 flex items-center gap-1 shadow-sm"
                >
                  {generatingNote ? (
                    <>
                      <RotateCw className="w-3 h-3 animate-spin text-slate-400" />
                      <span>Regenerating...</span>
                    </>
                  ) : (
                    <>
                      <RotateCw className="w-3 h-3 text-indigo-400" />
                      <span>Regenerate Note</span>
                    </>
                  )}
                </button>
              </div>

              {/* Core Idea */}
              <div className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Core Idea
                </span>
                <p className="text-slate-200 font-medium">{note.core_idea}</p>
              </div>

              {/* Key Definitions */}
              {note.key_definitions && note.key_definitions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Key Definitions</h3>
                  <div className="grid grid-cols-1 gap-2.5">
                    {note.key_definitions.map((def: any, i: number) => (
                      <div key={i} className="p-3.5 bg-slate-900/10 border border-slate-900 rounded-xl space-y-1">
                        <strong className="text-white text-xs block font-bold">{def.term}</strong>
                        <span className="text-xs text-slate-350">{def.definition}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Process / Logic */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Process / Logic</h3>
                <div className="p-4 bg-slate-900/20 border border-slate-900 rounded-2xl space-y-2">
                  {formatListText(note.process_logic).map((line: string, i: number) => (
                    <p key={i} className="text-slate-300 text-xs leading-relaxed">
                      {line.replace(/\*\*(.*?)\*\*/g, '$1').trim()}
                    </p>
                  ))}
                </div>
              </div>

              {/* Formula or code */}
              {note.formula && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Formula / Code</h3>
                  <pre className="p-4 bg-slate-950 border border-slate-900 rounded-2xl text-indigo-400 text-xs font-mono overflow-x-auto">
                    <code>{note.formula}</code>
                  </pre>
                </div>
              )}

              {/* Exam Angles */}
              <div className="p-4 bg-indigo-950/15 border border-indigo-900/25 rounded-2xl space-y-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Common Exam Angles
                </span>
                <div className="space-y-2">
                  {formatListText(note.exam_angles).map((line: string, i: number) => (
                    <p key={i} className="text-slate-300 text-xs leading-relaxed">
                      {line.replace(/\*\*(.*?)\*\*/g, '$1').trim()}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 border border-dashed border-slate-900 rounded-3xl text-center space-y-4">
              <div className="p-3 bg-slate-900 border border-slate-850 rounded-2xl w-fit mx-auto text-indigo-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-sm">Study Note Not Generated</h3>
                <p className="text-xs text-slate-400 max-w-[220px] mx-auto">
                  Cortex can compile a recall-oriented study note based on topic-relevant materials.
                </p>
              </div>
              <button
                onClick={handleGenerateNote}
                disabled={generatingNote}
                className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 mx-auto"
              >
                {generatingNote ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Writing Note...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Note</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Additions View */}
      {activeSubTab === 'additions' && (
        <div className="space-y-6">
          {/* Add Addition Form */}
          <form onSubmit={handleAddAddition} className="bg-slate-900/30 border border-slate-900 p-4 rounded-2xl space-y-3.5">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-400" />
              <span>Add Custom Notes / Photos</span>
            </h3>

            <div className="space-y-2">
              <textarea
                placeholder="Type your additions here... (or upload a photo of handwritten notes below)"
                value={additionText}
                onChange={(e) => setAdditionText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs resize-none"
              />

              <div className="flex justify-between items-center gap-2">
                <div className="relative overflow-hidden flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-400 text-xs font-semibold cursor-pointer max-w-[200px]">
                  <Image className="w-4 h-4 text-slate-450 shrink-0" />
                  <span className="truncate">{additionFile ? additionFile.name : 'Upload Note Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setAdditionFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={addingAddition || (!additionText && !additionFile)}
                  className="py-2 px-4 bg-indigo-650 hover:bg-indigo-600 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition-all shrink-0"
                >
                  {addingAddition ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Add'
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Additions list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Contributions</h3>
            {additions.length === 0 ? (
              <div className="p-6 border border-slate-900 rounded-2xl text-center text-xs text-slate-500">
                You haven't added any custom notes to this topic yet.
              </div>
            ) : (
              <div className="space-y-3">
                {additions.map((add) => (
                  <div
                    key={add.id}
                    className="p-4 bg-slate-900/30 border border-slate-900 rounded-2xl space-y-2 relative"
                  >
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <span>{add.type === 'image' ? 'Photo OCR Extraction' : 'Typed Addition'}</span>
                      <span>{new Date(add.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-slate-350 leading-relaxed whitespace-pre-line">
                      {add.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Flashcards View */}
      {activeSubTab === 'flashcards' && (
        <div className="space-y-6">
          {flashcards.length > 0 ? (
            <div className="space-y-6">
              {/* Flashcard SRS Widget */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-full flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wider px-1">
                  <span>Card {currentCardIndex + 1} of {flashcards.length}</span>
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-full text-[9px] text-indigo-400">
                    Source: {currentCard?.source}
                  </span>
                </div>

                {/* Flip Card Container */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="w-full min-h-[180px] bg-slate-900/40 border border-slate-850 hover:border-slate-800 rounded-2xl p-6 flex flex-col justify-between cursor-pointer transition-all relative select-none shadow-lg active:scale-[0.99]"
                >
                  <div className="flex-1 flex flex-col justify-center items-center text-center">
                    {!isFlipped ? (
                      <p className="text-white font-semibold text-sm leading-relaxed max-w-[280px]">
                        {currentCard?.question}
                      </p>
                    ) : (
                      <p className="text-slate-300 text-xs leading-relaxed max-w-[280px] whitespace-pre-line">
                        {currentCard?.answer}
                      </p>
                    )}
                  </div>

                  <div className="text-center text-[9px] font-bold text-slate-500 uppercase tracking-wider flex justify-center items-center gap-1 mt-4">
                    <RotateCw className="w-3 h-3" />
                    <span>Tap to {isFlipped ? 'see question' : 'flip & reveal'}</span>
                  </div>
                </div>

                {/* SM-2 Self Rating Buttons (Only show when flipped) */}
                {isFlipped ? (
                  <div className="w-full space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">
                      Rate your recall accuracy:
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => handleReviewRating(1)}
                        className="py-2.5 px-1 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 rounded-xl text-[10px] font-bold text-rose-450 transition-all text-center"
                      >
                        Again
                      </button>
                      <button
                        onClick={() => handleReviewRating(3)}
                        className="py-2.5 px-1 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-900/40 rounded-xl text-[10px] font-bold text-amber-450 transition-all text-center"
                      >
                        Hard
                      </button>
                      <button
                        onClick={() => handleReviewRating(4)}
                        className="py-2.5 px-1 bg-indigo-950/30 hover:bg-indigo-900/50 border border-indigo-900/40 rounded-xl text-[10px] font-bold text-indigo-400 transition-all text-center"
                      >
                        Good
                      </button>
                      <button
                        onClick={() => handleReviewRating(5)}
                        className="py-2.5 px-1 bg-emerald-950/30 hover:bg-emerald-900/50 border border-emerald-900/40 rounded-xl text-[10px] font-bold text-emerald-450 transition-all text-center"
                      >
                        Easy
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="h-[62px]"></div> // height placeholder to avoid layout shifting
                )}
              </div>

              {/* Accordion to Create Custom card / list cards */}
              <div className="border-t border-slate-900 pt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setShowAddCard(!showAddCard)}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-350 transition-all flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Custom Flashcard</span>
                  </button>

                  <button
                    onClick={() => handleDeleteCard(currentCard.id)}
                    className="text-xs font-semibold text-rose-450 hover:text-rose-400 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Card</span>
                  </button>
                </div>

                {showAddCard && (
                  <form onSubmit={handleCreateCustomCard} className="bg-slate-900/25 border border-slate-900 p-4 rounded-xl space-y-3.5">
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        required
                        placeholder="Question"
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                      <textarea
                        required
                        placeholder="Answer"
                        value={newAnswer}
                        onChange={(e) => setNewAnswer(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs resize-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddCard(false)}
                        className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 text-[10px] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="py-1.5 px-3 bg-indigo-650 hover:bg-indigo-600 rounded-lg text-white text-[10px] font-bold"
                      >
                        Save Card
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 border border-dashed border-slate-900 rounded-3xl text-center space-y-4">
              <div className="p-3 bg-slate-900 border border-slate-850 rounded-2xl w-fit mx-auto text-indigo-400">
                <RotateCw className="w-6 h-6 animate-spin" style={{ animationDuration: '4s' }} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-sm">No Flashcards Yet</h3>
                <p className="text-xs text-slate-400 max-w-[220px] mx-auto">
                  {note 
                    ? "Generate a starter set of active recall cards based on the topic study note." 
                    : "Generate the study note first, and flashcards will be created automatically."}
                </p>
              </div>

              {note && (
                <button
                  onClick={handleGenerateFlashcards}
                  disabled={generatingCards}
                  className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-600 disabled:bg-indigo-900/20 disabled:text-slate-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 mx-auto"
                >
                  {generatingCards ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Creating Cards...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Generate Starter Cards</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Grounded Chat Button — lifted above bottom nav */}
      <button
        onClick={() => setShowChat(true)}
        className="fixed bottom-28 right-6 p-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl shadow-indigo-600/35 transition-all flex items-center justify-center border border-indigo-550/30 scale-100 hover:scale-105 active:scale-95 z-40"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Grounded Chat Bottom Sheet / Modal */}
      {showChat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end justify-center p-4 pb-4">
          <div className="bg-slate-950 border border-slate-850 w-full max-w-sm rounded-t-3xl h-[75vh] flex flex-col justify-between overflow-hidden animate-in slide-in-from-bottom duration-250">
            {/* Chat Header */}
            <div className="px-5 py-4 border-b border-slate-905 flex justify-between items-center bg-slate-900/30">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Topic Grounded Chat</span>
                </h3>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5 block">
                  Answers only from topic materials
                </span>
              </div>
              <button
                onClick={() => setShowChat(false)}
                className="p-1 bg-slate-900 border border-slate-800 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Message Logs */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 p-4">
                  <MessageSquare className="w-8 h-8 text-slate-650" />
                  <div className="space-y-1">
                    <p className="text-white text-xs font-bold">Ask Cortex Anything</p>
                    <p className="text-[10px] text-slate-400 max-w-[220px]">
                      Ask questions about this specific topic. I will answer strictly using the uploaded files and notes.
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-900/60 border border-slate-850 text-slate-200 rounded-tl-none prose prose-invert'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })
              )}
              {sendingMessage && (
                <div className="flex justify-start">
                  <div className="bg-slate-900 border border-slate-850 text-slate-350 rounded-2xl rounded-tl-none px-4 py-2.5 text-xs flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat Input form */}
            <form onSubmit={handleSendMessage} className="px-5 py-4 border-t border-slate-905 bg-slate-900/20 flex gap-2">
              <input
                type="text"
                placeholder="Ask about this topic..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || sendingMessage}
                className="p-3 bg-indigo-600 disabled:bg-indigo-900/20 disabled:text-slate-500 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition-all flex items-center justify-center shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
