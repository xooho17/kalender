import {
  createCalendar,
  createTag,
  deleteCalendar,
  deleteEvent,
  deleteTag,
  fetchCalendars,
  fetchEvents,
  fetchTags,
  getSession,
  onAuthStateChange,
  removeChannel,
  saveEvent,
  setEventCompleted,
  shareCalendar,
  signIn,
  signOut,
  subscribeToEvents,
  updateTag,
} from './api.js';
import { addDays, addMonths, dateKey, startOfDay, startOfMonthGrid, startOfWeek } from './dateUtils.js';
import { canEditCalendar, state, syncSelectedTags } from './store.js';
import {
  bindElements,
  elements,
  openCalendarModal,
  openEventModal,
  openTagModal,
  openShareModal,
  readEventForm,
  readTagForm,
  renderAll,
  renderCalendar,
  renderCalendars,
  renderUser,
  selectEventTag,
  setActivePanel,
  setAuthenticatedView,
  showToast,
} from './ui.js';

bindElements();
const els = elements();

boot();

async function boot() {
  registerServiceWorker();
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
      state.tags = [];
      await removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // The app remains fully usable if service worker registration is blocked.
    });
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
  els.newCalendarBtn.addEventListener('click', openCalendarModal);
  els.newTagBtn.addEventListener('click', () => openTagModal());
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

  els.bottomTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'create') {
        openEventModal();
        return;
      }
      setActivePanel(tab.dataset.tab);
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

  els.eventTagOptions.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-tag-id]');
    if (!chip) return;
    selectEventTag(chip.dataset.tagId);
  });

  els.calendarList.addEventListener('click', (event) => {
    const shareTarget = event.target.closest('.share-affordance');
    const deleteTarget = event.target.closest('.calendar-delete');
    const item = event.target.closest('.calendar-list-item');
    if (!item) return;
    if (shareTarget) {
      openShareModal(item.dataset.calendarId);
      return;
    }
    if (deleteTarget) {
      handleDeleteCalendar(item.dataset.calendarId);
      return;
    }
    state.activeCalendarId =
      state.activeCalendarId === item.dataset.calendarId ? null : item.dataset.calendarId;
    renderAll();
  });

  els.calendarList.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const item = event.target.closest('.calendar-list-item');
    if (!item || event.target.closest('button')) return;
    event.preventDefault();
    state.activeCalendarId =
      state.activeCalendarId === item.dataset.calendarId ? null : item.dataset.calendarId;
    renderAll();
  });

  els.tagList.addEventListener('click', (event) => {
    const row = event.target.closest('.tag-list-item');
    if (!row) return;
    const tag = state.tags.find((item) => item.id === row.dataset.tagId);
    if (!tag) return;

    if (event.target.closest('.tag-delete')) {
      handleDeleteTag(tag.id);
      return;
    }

    if (event.target.closest('.tag-edit') || row.contains(event.target)) {
      openTagModal(tag);
    }
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
  bindSwipeNavigation();

  els.weeklyOverview.addEventListener('click', (event) => {
    const completeButton = event.target.closest('[data-complete-event-id]');
    if (completeButton) {
      handleToggleComplete(completeButton.dataset.completeEventId);
      return;
    }

    const eventButton = event.target.closest('[data-event-id]');
    if (!eventButton) return;
    const calendarEvent = state.events.find((item) => item.id === eventButton.dataset.eventId);
    if (calendarEvent) openEventModal(calendarEvent);
  });

  els.eventForm.addEventListener('submit', handleEventSubmit);
  els.deleteEventBtn.addEventListener('click', handleDeleteEvent);
  els.calendarForm.addEventListener('submit', handleCreateCalendar);
  els.tagForm.addEventListener('submit', handleSaveTag);
  els.deleteTagBtn.addEventListener('click', () => handleDeleteTag(els.tagId.value));
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
  const [calendars, tags] = await Promise.all([fetchCalendars(), fetchTags()]);
  state.calendars = calendars;
  state.tags = tags;
  syncSelectedTags();
  state.activeCalendarId = state.calendars[0]?.id || null;
  setActivePanel('calendar');
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

async function handleSaveTag(event) {
  event.preventDefault();
  els.tagError.textContent = '';
  try {
    const tag = readTagForm();
    if (tag.id) {
      await updateTag(tag.id, tag);
      showToast('Tag updated');
    } else {
      await createTag(tag);
      showToast('Tag created');
    }
    els.tagModal.close();
    state.tags = await fetchTags();
    syncSelectedTags();
    renderAll();
  } catch (error) {
    els.tagError.textContent = error.message;
  }
}

async function handleDeleteTag(tagId) {
  const tag = state.tags.find((item) => item.id === tagId);
  if (!tag) return;

  const confirmed = window.confirm(
    `Delete the "${tag.name}" tag? Events using it will keep their color but lose the tag link.`,
  );
  if (!confirmed) return;

  try {
    await deleteTag(tagId);
    if (els.tagModal.open) els.tagModal.close();
    state.tags = await fetchTags();
    syncSelectedTags();
    await refreshEventsAndRender();
    showToast('Tag deleted');
  } catch (error) {
    if (els.tagModal.open) els.tagError.textContent = error.message;
    else showToast(error.message);
  }
}

async function handleShareCalendar(event) {
  event.preventDefault();
  els.shareError.textContent = '';
  try {
    await shareCalendar({
      calendar_id: els.shareCalendarId.value,
      email: els.shareUserId.value.trim(),
      role: els.shareRole.value,
    });
    els.shareModal.close();
    showToast('Calendar shared');
  } catch (error) {
    els.shareError.textContent = error.message;
  }
}

async function handleDeleteCalendar(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  if (!calendar || calendar.role !== 'owner') return;

  const confirmed = window.confirm(
    `Delete "${calendar.name}" and all of its events? This cannot be undone.`,
  );
  if (!confirmed) return;

  try {
    await deleteCalendar(calendarId);
    if (state.activeCalendarId === calendarId) state.activeCalendarId = null;
    await loadWorkspace();
    showToast('Calendar deleted');
  } catch (error) {
    showToast(error.message);
  }
}

async function handleToggleComplete(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  if (!canEditCalendar(event.calendar_id)) {
    showToast('You do not have permission to update this task.');
    return;
  }

  try {
    await setEventCompleted(eventId, !event.completed);
    await refreshEventsAndRender();
  } catch (error) {
    showToast(error.message);
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

function bindSwipeNavigation() {
  let startX = 0;
  let startY = 0;
  let startedAt = 0;

  els.calendarGrid.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      startedAt = Date.now();
    },
    { passive: true },
  );

  els.calendarGrid.addEventListener(
    'touchend',
    (event) => {
      if (!startedAt) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      const isHorizontal = Math.abs(deltaX) > 72 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
      const isQuick = Date.now() - startedAt < 600;
      startedAt = 0;

      if (isHorizontal && isQuick) {
        movePeriod(deltaX > 0 ? -1 : 1);
      }
    },
    { passive: true },
  );
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
