type RelativeDatePreset =
  | "today"
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "maximum";

type PageDatePreset = RelativeDatePreset | "custom" | string;

type ResolvePageDateFilterInput = {
  datePreset: PageDatePreset;
  customDateStart?: string | null;
  customDateStop?: string | null;
  todayIso?: string;
};

type CalendarWindow = {
  dateStart: string;
  dateStop: string;
};

type RequestParams =
  | { datePreset: string }
  | { dateStart: string; dateStop: string };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function buildCalendarWindow(datePreset: RelativeDatePreset, todayIso: string): CalendarWindow | null {
  if (datePreset === "maximum") return null;
  if (datePreset === "today") {
    return { dateStart: todayIso, dateStop: todayIso };
  }
  if (datePreset === "last_7d") {
    return { dateStart: shiftDays(todayIso, -6), dateStop: todayIso };
  }
  if (datePreset === "last_30d") {
    return { dateStart: shiftDays(todayIso, -29), dateStop: todayIso };
  }
  return { dateStart: shiftDays(todayIso, -89), dateStop: todayIso };
}

export function resolvePageDateFilter({
  datePreset,
  customDateStart,
  customDateStop,
  todayIso = isoDate(new Date()),
}: ResolvePageDateFilterInput): {
  requestParams: RequestParams;
  calendarWindow: CalendarWindow | null;
  compareAgainstPreviousPeriod: boolean;
} {
  if (datePreset === "custom" && customDateStart && customDateStop) {
    return {
      requestParams: {
        dateStart: customDateStart,
        dateStop: customDateStop,
      },
      calendarWindow: {
        dateStart: customDateStart,
        dateStop: customDateStop,
      },
      compareAgainstPreviousPeriod: true,
    };
  }

  const relativePreset = (datePreset || "last_30d") as RelativeDatePreset;
  return {
    requestParams: { datePreset: relativePreset },
    calendarWindow: buildCalendarWindow(relativePreset, todayIso),
    compareAgainstPreviousPeriod: relativePreset !== "maximum",
  };
}
