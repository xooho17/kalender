import {
  createCalendar,
  deleteEvent,
  fetchCalendars,
  fetchEvents,
  getSession,
  onAuthStateChange,
  removeChannel,
  saveEvent,
  shareCalendar,
  signIn,
  signOut,
  subscribeToEvents,
} from './api.js';
import { CATEGORY_COLORS } from './config.js';
import { addDays, addMonths, dateKey, startOfDay, startOfMonthGrid, startOfWeek } from './dateUtils.js';
import { canEditCalendar, state } from './store.js';
import {
  bindElements,
  elements,
  openCalendarModal,
  openEventModal,
  openShareModal,
  readEventForm,
  renderAll,
  renderCalendar,
  renderCalendars,
  renderUser,
  setAuthenticatedView,
  showToast,
} from './ui.js';

bindElements();
const els = elements();

boot();

async function boot() {
  bindUiEvents();
  document.documentElement.dataset.theme =
    localStorage.getItem('kalender-theme') || 'light';
  syncThemeButton();

  state.session = await getSession();
  setAuthenticatedView(Boolean(state.session));
  if (state.session) await loadWorkspace();

  onAuthStateChange(async (_event, session) => {
    state.session = session;
    setAuthenticatedView(Boolean(session));
    if (session) {
      await loadWorkspace();
    } else {
      state.calendars = [];
      state.events = [];
      await removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
  });
}

function bindUiEvents() {
  els.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    els.loginError.textContent = '';
    try {
      await signIn(els.email.value.trim(), els.password.value);
    } catch (error) {
      els.loginError.textContent = error.message;
    }
  });

  els.logoutBtn.addEventListener('click', signOut);
  els.themeToggle.addEventListener('click', toggleTheme);
  els.newEventBtn.addEventListener('click', () => openEventModal());
  els.newCalendarBtn.addEventListener('click', openCalendarModal);
  els.prevBtn.addEventListener('click', () => movePeriod(-1));
  els.todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    refreshEventsAndRender();
  });
  els.nextBtn.addEventListener('click', () => movePeriod(1));

  els.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      refreshEventsAndRender();
    });
  });

  els.eventSearch.addEventListener('input', () => {
    state.search = els.eventSearch.value;
    renderAll();
  });

  els.categoryFilters.addEventListener('change', (event) => {
    if (event.target.matches('input[type="checkbox"]')) {
      if (event.target.checked) state.selectedCategories.add(event.target.value);
      else state.selectedCategories.delete(event.target.value);
      renderAll();
    }
  });

  els.calendarList.addEventListener('click', (event) => {
    const shareTarget = event.target.closest('.share-affordance');
    const item = event.target.closest('.calendar-list-item');
    if (!item) return;
    if (shareTarget) {
      openShareModal(item.dataset.calendarId);
      return;
    }
    state.activeCalendarId =
      state.activeCalendarId === item.dataset.calendarId ? null : item.dataset.calendarId;
    renderAll();
  });

  els.calendarGrid.addEventListener('click', (event) => {
    const eventButton = event.target.closest('[data-event-id]');
    if (eventButton) {
      const calendarEvent = state.events.find((item) => item.id === eventButton.dataset.eventId);
      if (calendarEvent) openEventModal(calendarEvent);
      return;
    }

    const dated = event.target.closest('[data-date]');
    if (dated) openEventModal(null, new Date(`${dated.dataset.date}T00:00:00`));
  });

  els.calendarGrid.addEventListener('dragstart', (event) => {
    const eventButton = event.target.closest('[data-event-id]');
    if (!eventButton) return;
    event.dataTransfer.setData('text/plain', eventButton.dataset.eventId);
  });
  els.calendarGrid.addEventListener('dragover', (event) => {
    if (event.target.closest('[data-date]')) event.preventDefault();
  });
  els.calendarGrid.addEventListener('drop', handleEventDrop);

  els.eventCategory.addEventListener('change', () => {
    els.eventColor.value = CATEGORY_COLORS[els.eventCategory.value];
  });

  els.eventForm.addEventListener('submit', handleEventSubmit);
  els.deleteEventBtn.addEventListener('click', handleDeleteEvent);
  els.calendarForm.addEventListener('submit', handleCreateCalendar);
  els.shareForm.addEventListener('submit', handleShareCalendar);
  els.closeModalButtons.forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });

  if ('Notification' in window && Notification.permission === 'default') {
    window.setTimeout(() => Notification.requestPermission(), 1200);
  }
}

async function loadWorkspace() {
  renderUser();
  state.calendars = await fetchCalendars();
  state.activeCalendarId = state.calendars[0]?.id || null;
  await setupRealtime();
  await refreshEventsAndRender();
}

async function refreshEventsAndRender() {
  const [rangeStart, rangeEnd] = eventRangeForView();
  state.events = await fetchEvents(
    state.calendars.map((calendar) => calendar.id),
    rangeStart,
    rangeEnd,
  );
  renderAll();
  scheduleReminders();
}

async function setupRealtime() {
  await removeChannel(state.realtimeChannel);
  state.realtimeChannel = subscribeToEvents(
    state.calendars.map((calendar) => calendar.id),
    async () => {
      await refreshEventsAndRender();
      showToast('Calendar updated');
    },
  );
}

function eventRangeForView() {
  if (state.view === 'month') {
    const start = startOfMonthGrid(state.selectedDate);
    return [start, addDays(start, 42)];
  }
  if (state.view === 'week') {
    const start = startOfWeek(state.selectedDate);
    return [start, addDays(start, 7)];
  }
  const start = startOfDay(state.selectedDate);
  return [start, addDays(start, 1)];
}

function movePeriod(direction) {
  if (state.view === 'month') state.selectedDate = addMonths(state.selectedDate, direction);
  if (state.view === 'week') state.selectedDate = addDays(state.selectedDate, direction * 7);
  if (state.view === 'day') state.selectedDate = addDays(state.selectedDate, direction);
  refreshEventsAndRender();
}

async function handleEventSubmit(event) {
  event.preventDefault();
  els.eventError.textContent = '';
  try {
    const payload = readEventForm();
    if (!canEditCalendar(payload.calendar_id)) {
      throw new Error('You do not have permission to edit this calendar.');
    }
    await saveEvent(payload);
    els.eventModal.close();
    await refreshEventsAndRender();
    showToast('Event saved');
  } catch (error) {
    els.eventError.textContent = error.message;
  }
}

async function handleDeleteEvent() {
  const eventId = els.eventId.value;
  const event = state.events.find((item) => item.id === eventId);
  if (!event || !canEditCalendar(event.calendar_id)) return;
  await deleteEvent(eventId);
  els.eventModal.close();
  await refreshEventsAndRender();
  showToast('Event deleted');
}

async function handleCreateCalendar(event) {
  event.preventDefault();
  els.calendarError.textContent = '';
  try {
    const calendar = await createCalendar({
      name: els.calendarName.value.trim(),
      color: els.calendarColor.value,
    });
    state.activeCalendarId = calendar.id;
    els.calendarModal.close();
    await loadWorkspace();
    showToast('Calendar created');
  } catch (error) {
    els.calendarError.textContent = error.message;
  }
}

async function handleShareCalendar(event) {
  event.preventDefault();
  els.shareError.textContent = '';
  try {
    await shareCalendar({
      calendar_id: els.shareCalendarId.value,
      user_id: els.shareUserId.value.trim(),
      role: els.shareRole.value,
    });
    els.shareModal.close();
    showToast('Calendar shared');
  } catch (error) {
    els.shareError.textContent = error.message;
  }
}

async function handleEventDrop(event) {
  const dropTarget = event.target.closest('[data-date]');
  if (!dropTarget) return;
  event.preventDefault();

  const eventId = event.dataTransfer.getData('text/plain');
  const calendarEvent = state.events.find((item) => item.id === eventId);
  if (!calendarEvent || !canEditCalendar(calendarEvent.calendar_id)) return;

  const destination = new Date(`${dropTarget.dataset.date}T00:00:00`);
  const oldStart = new Date(calendarEvent.starts_at);
  const oldEnd = new Date(calendarEvent.ends_at);
  const duration = oldEnd - oldStart;
  destination.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);

  await saveEvent({
    ...calendarEvent,
    starts_at: destination.toISOString(),
    ends_at: new Date(destination.getTime() + duration).toISOString(),
  });
  await refreshEventsAndRender();
  showToast('Event moved');
}

function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('kalender-theme', next);
  syncThemeButton();
}

function syncThemeButton() {
  els.themeToggle.textContent =
    document.documentElement.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode';
}

function scheduleReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  state.events.forEach((event) => {
    if (!event.reminder_minutes || event.reminderScheduled) return;
    const notifyAt =
      new Date(event.starts_at).getTime() - event.reminder_minutes * 60 * 1000;
    const delay = notifyAt - Date.now();
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      event.reminderScheduled = true;
      window.setTimeout(() => {
        new Notification(event.title, {
          body: `Starts at ${new Date(event.starts_at).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}`,
        });
      }, delay);
    }
  });
}
