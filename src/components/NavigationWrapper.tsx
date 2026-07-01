'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, BookOpen, Layers, User } from 'lucide-react';

export default function NavigationWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Paths where navigation tab bar should be hidden
  const hideNav = pathname === '/login' || pathname === '/onboarding';

  const navItems = [
    { label: 'Home', href: '/', icon: Home },
    { label: 'Courses', href: '/courses', icon: BookOpen },
    { label: 'Study', href: '/study', icon: Layers },
    { label: 'Profile', href: '/profile', icon: User },
  ];

  if (hideNav) {
    return <main className="flex-1 w-full flex flex-col">{children}</main>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950 text-white md:max-w-md md:mx-auto md:shadow-2xl md:border-x md:border-slate-900 pb-20 relative">
      {/* Scrollable page content */}
      <main className="flex-1 w-full overflow-y-auto px-4 pt-6 pb-8">
        {children}
      </main>

      {/* Mobile-first bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 md:absolute bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 px-6 py-2 z-55 flex justify-between items-center shadow-lg shadow-black/40">
        {navItems.map((item) => {
          const Icon = item.icon;
          // Exact match for Home, starting-with match for others
          const isActive = item.href === '/' 
            ? pathname === '/' 
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all ${
                isActive 
                  ? 'text-indigo-400 font-semibold scale-105' 
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5 mb-1" />
              <span className="text-[10px] tracking-wide uppercase font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
