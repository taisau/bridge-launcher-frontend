export interface DateRange {
  start: Date;
  end: Date;
}

const targetDate = new Date(2027, 9, 29); // Oct 29, 2027 (Month is 0-indexed)

const excludedRanges: DateRange[] = [
  { start: new Date(2026, 4, 16), end: new Date(2026, 4, 25) }, // V1: May
  { start: new Date(2026, 5, 3), end: new Date(2026, 5, 5) },  // Surgery
  { start: new Date(2026, 5, 29), end: new Date(2026, 6, 3) }, // V2: June/July
  { start: new Date(2026, 10, 25), end: new Date(2026, 10, 27) }, // V4: November
  { start: new Date(2027, 0, 8), end: new Date(2027, 0, 15) }, // V5: Puerto Vallarta
  { start: new Date(2027, 2, 6), end: new Date(2027, 2, 14) }, // V6: March (TBD)
  { start: new Date(2027, 4, 15), end: new Date(2027, 4, 23) }  // V7: May (Central Oregon)
];

const standaloneClosures: Date[] = [
  new Date(2026, 11, 24), // Christmas Eve
  new Date(2026, 11, 25), // Christmas
  new Date(2027, 0, 1),   // New Year's Day
  new Date(2027, 8, 6),   // Labor Day
  new Date(2027, 4, 31), // Memorial Day
  new Date(2027, 6, 2)   // Independence Day observed
];

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  // Skip weekends (0 is Sunday, 6 is Saturday)
  if (day === 0 || day === 6) return false;

  // Skip excluded ranges
  for (const range of excludedRanges) {
    if (date >= range.start && date <= range.end) {
      return false;
    }
  }

  // Skip standalone closures
  for (const closure of standaloneClosures) {
    if (isSameDay(date, closure)) {
      return false;
    }
  }

  return true;
}

export function calculateRemainingWorkingDays(): number {
  const now = new Date();
  
  // If it's 5:00 PM (17:00) or later, count starts from tomorrow
  let current = new Date(now);
  if (now.getHours() >= 17) {
    current.setDate(current.getDate() + 1);
  }
  
  // Normalize current to start of day for comparison
  current.setHours(0, 0, 0, 0);

  if (current >= targetDate) {
    return 0;
  }

  let count = 0;
  while (current < targetDate) {
    if (isWorkingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}
