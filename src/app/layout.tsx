import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import NavigationWrapper from '@/components/NavigationWrapper';
import './globals.css';

// Using a gorgeous modern font Outfit
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Cortex - read once, remember always',
  description: 'Turn your PDF, DOCX, and handwritten study materials into reviewable notes and flashcards with spaced repetition.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased dark`}>
      <body className="font-sans min-h-full flex flex-col bg-slate-950">
        <NavigationWrapper>{children}</NavigationWrapper>
      </body>
    </html>
  );
}
