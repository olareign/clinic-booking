// Everything is shown in UTC so server and browser always render the same text.
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** e.g. "Thu 10 Dec, 09:00–09:30 UTC" */
export const formatSlotTime = (start: string, end: string): string =>
  `${dateFmt.format(new Date(start))}–${timeFmt.format(new Date(end))} UTC`;

/** e.g. "Thu 10 Dec" */
export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));

/** e.g. "09:00" */
export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
