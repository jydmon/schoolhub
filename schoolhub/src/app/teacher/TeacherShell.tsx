"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import ScopedSearch from "@/components/ScopedSearch";
import { useAccessGate } from "@/lib/useAccessGate";
import { TDashboard, TTimetable, TCalendar, TStudents, TAttendance, TBehaviour, TReports, TTrips, TNotifications, THistory, TProfile, TAssistant, TImport } from "./TeacherPages";

const TITLES: Record<string, string> = {
  assistant: "Ask AI Assistant", dashboard: "Dashboard", students: "My pupils", attendance: "Attendance",
  behaviour: "Behaviour", reports: "Pupil reports", timetable: "Timetable", calendar: "Calendar",
  trips: "My trips", notifications: "Notifications", history: "My history", profile: "My profile", dm: "Messages", help: "Help & support", search: "Search",
  import: "Import data",
};

export default function TeacherShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("dashboard");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [unread, setUnread] = useState(0);
  const [canImport, setCanImport] = useState(false);
  const { gate } = useAccessGate(schoolId);

  useEffect(() => {
    fetch(`/api/teacher/context`).then((r) => r.json()).then((d) => {
      setSchools(d.schools ?? []);
      if ((d.schools ?? []).length) setSchoolId(d.schools[0].id);
    }).catch(() => {});
  }, []);
  // Show the Import tab only if the server accepts this teacher for imports
  // (i.e. they've been granted the import_data permission for this school).
  useEffect(() => {
    if (!schoolId) { setCanImport(false); return; }
    let cancelled = false;
    fetch(`/api/schools/${schoolId}/import`).then((r) => { if (!cancelled) setCanImport(r.ok); }).catch(() => { if (!cancelled) setCanImport(false); });
    return () => { cancelled = true; };
  }, [schoolId]);
  const loadUnread = useCallback(() => { fetch(`/api/me/notifications`).then((r) => r.json()).then((d) => setUnread(d.unread ?? 0)).catch(() => {}); }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => { if (active !== "notifications") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) { setActive(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  // Standardised navigation: Assistant on top, role content, then Support and Account.
  const NAV: NavGroup[] = [
    { label: "Assistant", items: [{ key: "assistant", label: "Ask AI Assistant", icon: "🤖" }] },
    { label: "Teaching", items: [
      { key: "dashboard", label: "Dashboard", icon: "📊" },
      { key: "search", label: "Search", icon: "🔍" },
      { key: "students", label: "My pupils", icon: "🎓" },
      { key: "attendance", label: "Attendance", icon: "✅" },
      { key: "behaviour", label: "Behaviour", icon: "⭐" },
      { key: "reports", label: "Pupil reports", icon: "📄" },
      ...(canImport ? [{ key: "import", label: "Import data", icon: "📥" }] : []),
    ] },
    { label: "Schedule", items: [
      { key: "timetable", label: "Timetable", icon: "🗓️" },
      { key: "calendar", label: "Calendar", icon: "📅" },
      { key: "trips", label: "My trips", icon: "🧳" },
    ] },
    { label: "Support", items: [
      { key: "dm", label: "Messaging", icon: "💬" },
      { key: "notifications", label: "Notifications", icon: "🔔", badge: unread },
      { key: "help", label: "Help & support", icon: "🆘" },
    ] },
    { label: "Account", items: [
      { key: "profile", label: "My profile", icon: "🙂" },
      { key: "history", label: "My history", icon: "🗂️" },
    ] },
  ];

  function body() {
    if (!schoolId && ["dashboard", "search", "students", "attendance", "behaviour", "reports", "import", "timetable", "calendar", "trips", "history", "assistant"].includes(active)) {
      return schools.length === 0 ? <div className="panel"><p className="muted">You don&apos;t have a teacher role in any school yet. Ask your school administrator to assign you.</p></div> : <div className="panel">Loading…</div>;
    }
    switch (active) {
      case "assistant": return <TAssistant schoolId={schoolId} />;
      case "search": return <ScopedSearch endpoint={`/api/teacher/search?school=${encodeURIComponent(schoolId)}`} title="Search" blurb="Search across your assigned pupils, classes, timetable, trips, reports and behaviour. Only pupils in your scope are searched." onNavigate={nav} />;
      case "dashboard": return <TDashboard schoolId={schoolId} onNavigate={nav} />;
      case "students": return <TStudents schoolId={schoolId} />;
      case "attendance": return <TAttendance schoolId={schoolId} />;
      case "behaviour": return <TBehaviour schoolId={schoolId} />;
      case "reports": return <TReports schoolId={schoolId} />;
      case "import": return <TImport schoolId={schoolId} />;
      case "timetable": return <TTimetable schoolId={schoolId} />;
      case "calendar": return <TCalendar schoolId={schoolId} />;
      case "trips": return <TTrips schoolId={schoolId} />;
      case "notifications": return <TNotifications />;
      case "history": return <THistory schoolId={schoolId} />;
      case "profile": return <AccountProfile />;
      case "dm": return <Messaging />;
      case "help": return <HelpSupport />;
      default: return <TDashboard schoolId={schoolId} onNavigate={nav} />;
    }
  }

  return (
    <AppShell brandSub="Teacher" nav={gate(NAV)} active={active} onNavigate={nav} title={TITLES[active] || "Teacher"} email={email} role="Teacher">
      {schools.length > 1 && (
        <div className="panel flex-between" style={{ alignItems: "center" }}>
          <div className="muted" style={{ fontSize: 13 }}>School</div>
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} style={{ width: "auto" }}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
      )}
      {body()}
    </AppShell>
  );
}
