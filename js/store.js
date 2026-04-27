export const state = {
  session: null,
  calendars: [],
  activeCalendarId: null,
  events: [],
  selectedDate: new Date(),
  view: 'month',
  search: '',
  selectedCategories: new Set(['work', 'personal', 'urgent', 'focus', 'travel']),
  realtimeChannel: null,
};

export function activeCalendar() {
  return state.calendars.find((calendar) => calendar.id === state.activeCalendarId);
}

export function canEditCalendar(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  return calendar && ['owner', 'collaborator'].includes(calendar.role);
}

export function visibleEvents() {
  const query = state.search.trim().toLowerCase();
  return state.events.filter((event) => {
    const matchesCalendar =
      !state.activeCalendarId || event.calendar_id === state.activeCalendarId;
    const matchesCategory = state.selectedCategories.has(event.category);
    const matchesSearch =
      !query ||
      event.title.toLowerCase().includes(query) ||
      (event.description || '').toLowerCase().includes(query);
    return matchesCalendar && matchesCategory && matchesSearch;
  });
}
