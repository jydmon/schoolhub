# Google Play Console — SIPlat listing & Data safety

**App name:** SIPlat
**Package:** com.siplat.app
**Category:** Education
**Default language:** en-GB

## Short description (80 chars)
Your whole school in one secure app — for parents, teachers, drivers and staff.

## Full description
SIPlat brings a school's whole community into one secure app. Everyone sees only
what's relevant to their role.

Parents / guardians: dashboards for every child, attendance, behaviour, homework,
reports, trips, calendar, timetable, daily menu, real-time school-bus tracking and
secure messaging with the school.

Teachers: assigned pupils, timetable and calendar, take attendance, log behaviour,
write pupil reports, manage trips, and a role-scoped AI assistant.

Drivers: today's journeys, start/stop routes, check pupils in and out, share live
location only while a route is running, pre-trip vehicle checks and office messaging.

School & transport staff: manage pupils, staff, routes, fleet, communications, a
live transport control centre and reporting.

Security & privacy first: access is strictly role-based and limited to your own
school; parents only ever see their own children; a bus's location is shared only
during a live journey, never afterwards.

## Contact & policy
- Support email: support@siplat.com
- Website: https://siplat.com
- Privacy policy: https://siplat.com/privacy

## Data safety form (answers)
Data is encrypted in transit (HTTPS). Users can request access/deletion of their
data through their school (in-app Help & Support).

Data collected & shared:
- **Personal info** — name, email, phone: collected, not shared with third parties;
  used for app functionality and account management.
- **Location (approximate & precise)** — collected **only for the Driver role while
  a journey is active**, used for real-time bus tracking; not shared with third
  parties; not collected in the background outside an active journey.
- **Photos** — optional, only when a user attaches one to a trip/report.
- **Messages** — in-app messages between users of the same school; used for app
  functionality; not shared externally.
- **App activity / device identifiers** — for push notifications and security.

Data is NOT used for advertising or shared with data brokers. Pupil data is never
used to train AI models.

## Content rating
Complete the IARC questionnaire: no violence/mature content → expected "Everyone /
PEGI 3". App is used by adults (parents/staff) and older students under school
supervision.

## Release track
Start on **internal testing**, then closed/open testing, then production. The
`eas.json` Android submit is set to `track: internal`, `releaseStatus: draft` —
change to `production` when you're ready to roll out.
