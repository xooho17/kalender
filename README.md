# Kalender

A static, GitHub Pages friendly calendar app with Supabase Auth, shared calendars,
collaborative events, realtime updates, drag-and-drop rescheduling, dark mode,
search, filters, and a weekly overview.

## Project structure

- `index.html` - app shell and dialogs
- `css/styles.css` - responsive light/dark design system
- `js/config.js` - Supabase URL/key and category colors
- `js/api.js` - Supabase Auth, database, and realtime calls
- `js/ui.js` - rendering and form helpers
- `js/app.js` - application state transitions and event handlers
- `supabase/schema.sql` - tables, triggers, RLS policies, and realtime setup

## Supabase setup

1. Open your Supabase project: `https://wpcycaqvzxujyxablnkp.supabase.co`.
2. Enable Email/Password under Authentication providers.
3. Create users manually in Authentication. There is intentionally no public sign-up UI.
4. Run `supabase/schema.sql` in the SQL editor.
5. In Authentication URL configuration, add your GitHub Pages URL to allowed redirect/site URLs.

The app uses these tables:

- `calendars`: owner-created calendars.
- `calendar_members`: access control with `owner`, `collaborator`, and `viewer` roles.
- `events`: shared events with title, description, time range, color, category, and optional reminder.

RLS ensures users can only read calendars they belong to. Owners can share
calendars, owners and collaborators can modify events, and viewers can only read.

## Sharing calendars

Open the share action beside an owned calendar and enter the target user's
Supabase Auth user ID. Supabase Auth does not expose other users by email to the
browser with a publishable key, so sharing by user ID avoids adding a privileged
backend service.

## Local usage

Because the app uses ES modules, serve it with any static server rather than
opening the file directly:

```bash
node server.mjs
```

Then open `http://127.0.0.1:4173/`.

## GitHub Pages deployment

1. Push this folder to a GitHub repository.
2. In GitHub, open Settings -> Pages.
3. Select Deploy from a branch.
4. Choose your default branch and `/root`.
5. Save and wait for the Pages URL to publish.
6. Add that Pages URL in Supabase Authentication URL configuration.

No build step is required.
