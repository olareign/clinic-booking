'use client';

export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {
      // Storage blocked (private mode): the toggle still works for this visit.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      <span className="dark:hidden">Dark</span>
      <span className="hidden dark:inline">Light</span>
    </button>
  );
}
