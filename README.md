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

## Authentication and ownership

The frontend signs users in with Supabase Auth email/password. After login,
Supabase stores the session in the browser and attaches the authenticated user's
JWT to database requests made with the publishable key.

Calendar creation is handled in `js/api.js`:

```js
const { data: userData } = await supabase.auth.getUser();
await supabase
  .from('calendars')
  .insert({ name, color, owner_id: userData.user.id });
```

The database also sets `calendars.owner_id` to `auth.uid()` by default. The
explicit frontend `owner_id` keeps the data flow clear, while the RLS policy
still verifies that the submitted owner is the current authenticated user. A
user cannot create a calendar for someone else by editing browser code.

After a calendar is inserted, the `calendars_add_owner_member` trigger inserts
an `owner` row into `calendar_members`. That membership is what lets the new
calendar appear in the shared calendar list and enables future owner actions.

## RLS policy model

RLS must stay enabled on `calendars`, `calendar_members`, and `events`. The app
uses the browser publishable key, so the database is the authorization boundary.

The policies are:

- `calendars INSERT`: authenticated users can insert only when
  `owner_id = auth.uid()`.
- `calendars SELECT`: authenticated users can read calendars they own or where
  they have a `calendar_members` row.
- `calendars UPDATE/DELETE`: only owners can modify or delete calendars.
- `calendar_members SELECT`: users can read their own memberships; owners can
  read memberships for calendars they own.
- `calendar_members INSERT/UPDATE/DELETE`: only calendar owners can manage
  sharing.
- `events SELECT`: calendar members can read events.
- `events INSERT/UPDATE/DELETE`: owners and collaborators can modify events;
  viewers cannot.

Helper functions such as `is_calendar_member`, `is_calendar_owner`, and
`can_edit_calendar` are `security definer` functions so policies can check
membership without running into recursive RLS checks on `calendar_members`.

## Fixing calendar creation RLS errors

If creating a calendar fails with:

```text
new row violates row-level security policy for table "calendars"
```

the insert policy on `calendars` is missing, stale, or not scoped to
authenticated users correctly. Run this migration in the Supabase SQL editor:

```sql
-- File: supabase/rls_fix_calendars.sql
```

That script:

- Keeps RLS enabled.
- Ensures `calendars.owner_id` defaults to `auth.uid()`.
- Recreates the calendar policies for `INSERT`, `SELECT`, `UPDATE`, and
  `DELETE`.
- Recreates membership policies needed for sharing.
- Recreates the trigger that automatically adds the creator as an owner member.

When changing schema or policies later, keep these rules intact:

- Do not add public `anon` policies for private calendar data.
- Do not hardcode user IDs in frontend code or SQL policies.
- Do not remove the owner membership trigger unless calendar creation is
  replaced by an RPC that creates the calendar and membership together.
- Test create, read, update, delete, share, and viewer-only access with at least
  two separate Supabase users.

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
