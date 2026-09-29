# Session notes

## 2026-09-29

### RLS pass (#11)
- `leave_requests`: staff Withdraw relies on the delete returning the deleted rows. Staff need **delete + select** on their own rows, or Withdraw will always say "already decided".

### Follow-ups / parked
- **Pay-period maths is duplicated** in `pages/wages.js` (`getPeriod`), `pages/me.js`, `pages/index.js`, `pages/admin.js` and `pages/api/cron/wage-reminder.js`. Consolidate them all onto `payPeriodFor()` in `lib/weekSchedule.js` in a future cleanup. (`payPeriodFor` was checked against `getPeriod` in Perth time for the current period, Tue/Wed boundaries and Dec 2026 → Jan 2027: all matched. Only `pages/roster.js` uses it so far.)
