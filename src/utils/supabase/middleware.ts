import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const isAuthPage = url.pathname.startsWith('/login');
  const isApiRoute = url.pathname.startsWith('/api') || url.pathname.startsWith('/_next') || url.pathname === '/favicon.ico';
  const isOnboardingPage = url.pathname.startsWith('/onboarding');

  // If we are hitting an API route or asset, don't redirect
  if (isApiRoute) {
    return supabaseResponse;
  }

  // Not logged in -> Redirect to login if on protected page
  if (!user) {
    if (!isAuthPage) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Logged in
  if (isAuthPage) {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // Check onboarding status (academic_level)
  const { data: profile } = await supabase
    .from('profiles')
    .select('academic_level')
    .eq('id', user.id)
    .single();

  const needsOnboarding = !profile || !profile.academic_level;

  if (needsOnboarding && !isOnboardingPage) {
    url.pathname = '/onboarding';
    return NextResponse.redirect(url);
  }

  if (!needsOnboarding && isOnboardingPage) {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
