import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 1. Authenticate the logged-in user
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate if the user is an admin (if ADMIN_EMAIL env is defined)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email !== adminEmail) {
      return NextResponse.json({ error: 'Forbidden: Admin access only.' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Service role key is not configured in environment variables.' },
        { status: 500 }
      );
    }

    // Initialize Supabase Admin client using the service role key to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 3. Fetch all auth users
    const { data: userData, error: listUsersError } = await supabaseAdmin.auth.admin.listUsers();
    if (listUsersError) throw listUsersError;
    const users = userData?.users || [];

    // 4. Fetch all profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('*');
    if (profilesError) throw profilesError;
    const profileMap = new Map(profiles?.map(p => [p.id, p]));

    // 5. Fetch all courses
    const { data: courses, error: coursesError } = await supabaseAdmin
      .from('courses')
      .select('id, user_id, name, code, level, created_at')
      .order('created_at', { ascending: false });
    if (coursesError) throw coursesError;

    // 6. Fetch all materials
    const { data: materials, error: materialsError } = await supabaseAdmin
      .from('materials')
      .select('id, course_id, name, type, status, created_at')
      .order('created_at', { ascending: false });
    if (materialsError) throw materialsError;

    // 7. Fetch all notes
    const { data: notes, error: notesError } = await supabaseAdmin
      .from('notes')
      .select('id, topic_id, created_at');
    if (notesError) throw notesError;

    // 8. Fetch all chat messages
    const { data: chatMessages, error: chatsError } = await supabaseAdmin
      .from('chat_messages')
      .select('id, user_id, topic_id, role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (chatsError) throw chatsError;

    // 9. Fetch all topics (to resolve topic titles in chat logs)
    const { data: topics, error: topicsError } = await supabaseAdmin
      .from('topics')
      .select('id, title');
    if (topicsError) throw topicsError;

    const topicMap = new Map(topics?.map(t => [t.id, t.title]));
    const userEmailMap = new Map(users.map(u => [u.id, u.email]));

    // 10. Process Users list with course and upload counts
    const usersData = users.map(u => {
      const profile = profileMap.get(u.id);
      const userCourses = courses?.filter(c => c.user_id === u.id) || [];
      const courseIds = userCourses.map(c => c.id);
      const userMaterials = materials?.filter(m => courseIds.includes(m.course_id)) || [];

      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        academic_level: profile?.academic_level || 'Not set',
        courses_count: userCourses.length,
        materials_count: userMaterials.length,
      };
    });

    // 11. Compile Recent Activities
    const recentCourses = courses?.slice(0, 10).map(c => ({
      id: c.id,
      name: c.name,
      code: c.code,
      user_email: userEmailMap.get(c.user_id) || 'Unknown User',
      created_at: c.created_at,
    })) || [];

    const recentMaterials = materials?.slice(0, 10).map(m => {
      const course = courses?.find(c => c.id === m.course_id);
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        user_email: course ? userEmailMap.get(course.user_id) : 'Unknown User',
        created_at: m.created_at,
      };
    }) || [];

    const recentChats = chatMessages?.filter(m => m.role === 'user').slice(0, 15).map(m => ({
      id: m.id,
      user_email: userEmailMap.get(m.user_id) || 'Unknown User',
      topic_title: topicMap.get(m.topic_id) || 'Unknown Topic',
      content: m.content,
      created_at: m.created_at,
    })) || [];

    return NextResponse.json({
      stats: {
        total_users: users.length,
        total_courses: courses?.length || 0,
        total_materials: materials?.length || 0,
        total_notes: notes?.length || 0,
        total_chats: chatMessages?.length || 0,
      },
      users: usersData,
      activities: {
        courses: recentCourses,
        materials: recentMaterials,
        chats: recentChats,
      },
      warning: !adminEmail ? 'Warning: ADMIN_EMAIL environment variable is not configured. Anyone logged in can access this dashboard.' : undefined,
    });

  } catch (err: any) {
    console.error('Admin stats API error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
