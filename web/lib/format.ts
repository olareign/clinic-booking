// Everything is shown in UTC so server and browser always render the same text.
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });

/** e.g. "Thu 10 Dec" */
export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));

/** e.g. "9:00 AM" (12-hour clock) */
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));

/** e.g. "Thu 10 Dec, 9:00 AM–9:30 AM UTC" */
export const formatSlotTime = (start: string, end: string): string =>
  `${formatDay(start)}, ${formatTime(start)}–${formatTime(end)} UTC`;
