"use client";

import HistoryExplorer from "@/components/HistoryExplorer";

// School-Administrator "History" — a global, searchable log of everything that
// has happened across this school's portal (config, people, calendar, messaging,
// reports, integrations…), backed by the audit trail.
export default function HistoryTab({ schoolId }: { schoolId: string }) {
  return (
    <HistoryExplorer
      baseUrl={`/api/schools/${schoolId}/history`}
      title="Activity history"
      subtitle="Search everything that's happened across your school — who changed what, and when. Open Details on any row for the full record."
    />
  );
}
