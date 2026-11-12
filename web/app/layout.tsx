import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import Link from 'next/link';
import { ThemeToggle } from './theme-toggle';
import './globals.css';

const geist = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Clinic Booking',
  description: 'Book an appointment slot at the clinic.',
};

// Runs before paint so the saved theme applies with no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <nav className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-teal-600">+</span> Clinic Booking
            </Link>
            <ThemeToggle />
          </nav>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
