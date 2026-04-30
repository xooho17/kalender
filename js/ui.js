import { CATEGORIES, CATEGORY_COLORS } from './config.js';
import {
  addDays,
  dateKey,
  eventOccursOn,
  formatRangeTitle,
  fromLocalInputValue,
  minutesSinceStartOfDay,
  sameDay,
  startOfDay,
  startOfMonthGrid,
  startOfWeek,
  toLocalInputValue,
} from './dateUtils.js';
import { canEditCalendar, state, visibleEvents } from './store.js';

const els = {};

export function bindElements() {
  [
    'login-view',
    'calendar-view',
    'login-form',
    'login-error',
    'email',
    'password',
    'user-email',
    'calendar-list',
    'category-filters',
    'weekly-overview',
    'event-search',
    'theme-toggle',
    'logout-btn',
    'new-event-btn',
    'new-calendar-btn',
    'prev-btn',
    'today-btn',
    'next-btn',
    'period-title',
    'calendar-grid',
    'event-modal',
    'event-form',
    'event-modal-title',
    'event-id',
    'event-calendar',
    'event-title',
    'event-description',
    'event-start',
    'event-end',
    'event-category',
    'event-color',
    'event-reminder',
    'event-error',
    'delete-event-btn',
    'calendar-modal',
    'calendar-form',
    'calendar-name',
    'calendar-color',
    'calendar-error',
    'share-modal',
    'share-form',
    'share-title',
    'share-calendar-id',
    'share-user-id',
    'share-role',
    'share-error',
    'toast',
  ].forEach((id) => {
    els[toCamel(id)] = document.getElementById(id);
  });
  els.viewTabs = [...document.querySelectorAll('.view-tab')];
  els.bottomTabs = [...document.querySelectorAll('.bottom-tab')];
  els.appPanels = [...document.querySelectorAll('.app-panel')];
  els.closeModalButtons = [...document.querySelectorAll('[data-close-modal]')];
  return els;
}

export function elements() {
  return els;
}

export function setAuthenticatedView(isAuthenticated) {
  els.loginView.classList.toggle('hidden', isAuthenticated);
  els.calendarView.classList.toggle('hidden', !isAuthenticated);
  document.body.classList.toggle('authenticated', isAuthenticated);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

export function setActivePanel(panelName) {
  els.bottomTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === panelName);
  });
  els.appPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === panelName);
  });
}

export function renderUser() {
  els.userEmail.textContent = state.session?.user?.email || '';
}

export function renderAll() {
  renderCalendars();
  renderCategoryFilters();
  renderCalendar();
  renderWeeklyOverview();
  renderEventCalendarOptions();
}

export function renderCalendars() {
  els.calendarList.innerHTML = '';
  state.calendars.forEach((calendar) => {
    const item = document.createElement('div');
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.className = `calendar-list-item${
      calendar.id === state.activeCalendarId ? ' active' : ''
    }`;
    item.dataset.calendarId = calendar.id;
    item.innerHTML = `
      <span class="calendar-color" style="--calendar-color:${calendar.color}"></span>
      <span class="calendar-name">${escapeHtml(calendar.name)}</span>
      <span class="role-pill">${calendar.role}</span>
      ${
        calendar.role === 'owner'
          ? `<span class="calendar-actions">
              <button class="share-affordance" type="button" title="Share calendar">Share</button>
              <button class="calendar-delete" type="button" title="Delete calendar">Delete</button>
            </span>`
          : ''
      }
    `;
    els.calendarList.append(item);
  });
}

export function renderCategoryFilters() {
  els.categoryFilters.innerHTML = '';
  CATEGORIES.forEach((category) => {
    const label = document.createElement('label');
    label.className = 'category-chip';
    label.innerHTML = `
      <input type="checkbox" value="${category}" ${
        state.selectedCategories.has(category) ? 'checked' : ''
      } />
      <span style="--category-color:${CATEGORY_COLORS[category]}"></span>
      ${titleCase(category)}
    `;
    els.categoryFilters.append(label);
  });
}

export function renderCalendar() {
  els.periodTitle.textContent = formatRangeTitle(state.selectedDate, state.view);
  els.viewTabs.forEach((tab) =>
    tab.classList.toggle('active', tab.dataset.view === state.view),
  );

  if (state.view === 'month') renderMonth();
  if (state.view === 'week') renderWeek();
  if (state.view === 'day') renderDay();
}

export function renderWeeklyOverview() {
  const weekStart = startOfWeek(new Date());
  const upcoming = visibleEvents()
    .filter((event) => {
      const start = new Date(event.starts_at);
      return start >= weekStart && start < addDays(weekStart, 7);
    })
    .slice(0, 6);

  els.weeklyOverview.innerHTML =
    upcoming.length === 0
      ? '<p class="empty-note">No events this week.</p>'
      : upcoming
          .map(
            (event) => `
              <div class="overview-event ${event.completed ? 'completed' : ''}">
                <span style="--event-color:${event.color}"></span>
                <button
                  class="task-check"
                  type="button"
                  data-complete-event-id="${event.id}"
                  aria-label="${event.completed ? 'Mark incomplete' : 'Mark complete'}"
                  aria-pressed="${event.completed ? 'true' : 'false'}"
                ></button>
                <button class="overview-main" type="button" data-event-id="${event.id}">
                  <strong>${escapeHtml(event.title)}</strong>
                  <small>${formatEventTime(event)}</small>
                </button>
              </div>
            `,
          )
          .join('');

}

export function renderEventCalendarOptions() {
  els.eventCalendar.innerHTML = state.calendars
    .map(
      (calendar) =>
        `<option value="${calendar.id}" ${
          calendar.id === state.activeCalendarId ? 'selected' : ''
        } ${canEditCalendar(calendar.id) ? '' : 'disabled'}>${escapeHtml(
          calendar.name,
        )}</option>`,
    )
    .join('');
}

export function openEventModal(event = null, date = null) {
  const writableCalendar =
    state.calendars.find((calendar) => calendar.id === state.activeCalendarId && canEditCalendar(calendar.id)) ||
    state.calendars.find((calendar) => canEditCalendar(calendar.id));

  if (!event && !writableCalendar) {
    showToast('You only have viewer access to the selected calendars.');
    return;
  }

  const start = event ? new Date(event.starts_at) : defaultStart(date || state.selectedDate);
  const end = event ? new Date(event.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);

  els.eventModalTitle.textContent = event ? 'Edit event' : 'New event';
  els.eventId.value = event?.id || '';
  els.eventCalendar.value = event?.calendar_id || writableCalendar.id;
  els.eventTitle.value = event?.title || '';
  els.eventDescription.value = event?.description || '';
  els.eventStart.value = toLocalInputValue(start);
  els.eventEnd.value = toLocalInputValue(end);
  els.eventCategory.value = event?.category || 'work';
  els.eventColor.value = event?.color || CATEGORY_COLORS[event?.category || 'work'];
  els.eventReminder.checked = Boolean(event?.reminder_minutes);
  const options = els.eventModal.querySelector('.event-options');
  if (options) {
    options.open = Boolean(
      event &&
        (event.description || event.reminder_minutes || event.category !== 'work'),
    );
  }
  els.deleteEventBtn.hidden = !event;
  els.eventError.textContent = '';
  els.eventModal.showModal();
}

export function readEventForm() {
  const id = els.eventId.value || null;
  const existingEvent = id ? state.events.find((event) => event.id === id) : null;
  const startsAt = fromLocalInputValue(els.eventStart.value);
  const endsAt = fromLocalInputValue(els.eventEnd.value);

  if (endsAt <= startsAt) {
    throw new Error('End time must be after start time.');
  }

  return {
    id,
    calendar_id: els.eventCalendar.value,
    title: els.eventTitle.value.trim(),
    description: els.eventDescription.value.trim(),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    category: els.eventCategory.value,
    color: els.eventColor.value,
    reminder_minutes: els.eventReminder.checked ? 15 : null,
    completed: Boolean(existingEvent?.completed),
  };
}

export function openCalendarModal() {
  els.calendarName.value = '';
  els.calendarColor.value = '#92c5fc';
  els.calendarError.textContent = '';
  els.calendarModal.showModal();
}

export function openShareModal(calendarId) {
  const calendar = state.calendars.find((item) => item.id === calendarId);
  if (!calendar || calendar.role !== 'owner') return;
  els.shareTitle.textContent = `Share ${calendar.name}`;
  els.shareCalendarId.value = calendarId;
  els.shareUserId.value = '';
  els.shareUserId.type = 'email';
  els.shareUserId.placeholder = 'person@example.com';
  els.shareRole.value = 'collaborator';
  els.shareError.textContent = '';
  els.shareModal.showModal();
}

export function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove('visible');
  }, 3200);
}

function renderMonth() {
  const today = new Date();
  const gridStart = startOfMonthGrid(state.selectedDate);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  els.calendarGrid.className = 'calendar-grid month-grid';
  els.calendarGrid.innerHTML = weekHeaderHtml();
  days.forEach((day) => {
    const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, day));
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `month-cell${sameDay(day, today) ? ' today' : ''}${
      day.getMonth() !== state.selectedDate.getMonth() ? ' muted' : ''
    }`;
    cell.dataset.date = dateKey(day);
    cell.innerHTML = `
      <span class="day-number">${day.getDate()}</span>
      <span class="event-stack">
        ${dayEvents
          .slice(0, 3)
          .map(
            (event) => `
              <span class="event-pill" draggable="true" data-event-id="${event.id}" style="--event-color:${event.color}">
                ${escapeHtml(event.title)}
              </span>
            `,
          )
          .join('')}
        ${dayEvents.length > 3 ? `<span class="more-pill">+${dayEvents.length - 3}</span>` : ''}
      </span>
    `;
    els.calendarGrid.append(cell);
  });
}

function renderWeek() {
  const start = startOfWeek(state.selectedDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));

  if (window.matchMedia('(max-width: 719px)').matches) {
    els.calendarGrid.className = 'calendar-grid week-list';
    els.calendarGrid.innerHTML = days.map(renderWeekListDay).join('');
    return;
  }

  els.calendarGrid.className = 'calendar-grid time-grid';
  els.calendarGrid.innerHTML = days
    .map((day) => renderTimeColumn(day, day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })))
    .join('');
}

function renderWeekListDay(day) {
  const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, day));
  const label = day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return `
    <section class="week-list-day" data-date="${dateKey(day)}">
      <header>
        <strong>${label}</strong>
        <span>${dayEvents.length || 'No'} event${dayEvents.length === 1 ? '' : 's'}</span>
      </header>
      <div class="week-list-events">
        ${
          dayEvents.length
            ? dayEvents
                .map(
                  (event) => `
                    <button
                      class="week-list-event ${event.completed ? 'completed' : ''}"
                      type="button"
                      data-event-id="${event.id}"
                    >
                      <span style="--event-color:${event.color}"></span>
                      <strong>${escapeHtml(event.title)}</strong>
                      <small>${formatEventTime(event)}</small>
                    </button>
                  `,
                )
                .join('')
            : '<p class="empty-note">Tap to add an event.</p>'
        }
      </div>
    </section>
  `;
}

function renderDay() {
  els.calendarGrid.className = 'calendar-grid time-grid day-grid';
  els.calendarGrid.innerHTML = renderTimeColumn(
    state.selectedDate,
    state.selectedDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }),
  );
}

function renderTimeColumn(day, label) {
  const dayEvents = visibleEvents().filter((event) => eventOccursOn(event, day));
  return `
    <section class="time-column" data-date="${dateKey(day)}">
      <header>${label}</header>
      <div class="time-lane">
        ${Array.from({ length: 24 }, (_, hour) => `<span>${String(hour).padStart(2, '0')}:00</span>`).join('')}
        ${dayEvents.map(renderPositionedEvent).join('')}
      </div>
    </section>
  `;
}

function renderPositionedEvent(event) {
  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const top = (minutesSinceStartOfDay(start) / 1440) * 100;
  const height = Math.max(((end - start) / 60000 / 1440) * 100, 4);
  return `
    <button
      class="time-event"
      draggable="true"
      data-event-id="${event.id}"
      style="--event-color:${event.color}; --top:${top}%; --height:${height}%"
      type="button"
    >
      <strong>${escapeHtml(event.title)}</strong>
      <span>${formatEventTime(event)}</span>
    </button>
  `;
}

function weekHeaderHtml() {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((day) => `<div class="week-label">${day}</div>`)
    .join('');
}

function defaultStart(date) {
  const start = startOfDay(date);
  const now = new Date();
  if (sameDay(start, now)) {
    start.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  return start;
}

function formatEventTime(event) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return formatter.format(new Date(event.starts_at));
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}
