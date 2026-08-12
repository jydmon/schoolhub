"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import { TDashboard, TTimetable, TCalendar, TStudents, TAttendance, TBehaviour, TReports, TTrips, TNotifications, THistory, TProfile, TAssistant } from "./TeacherPages";

const TITLES: Record<string, string> = {
  assistant: "Ask AI Assistant", dashboard: "Dashboard", students: "My pupils", attendance: "Attendance",
  behaviour: "Behaviour", reports: "Pupil reports", timetable: "Timetable", calendar: "Calendar",
  trips: "My trips", notifications: "Notifications", history: "My history", profile: "My profile", dm: "Messages", help: "Help & support",
};

export default function TeacherShell({ email = "" }: { email?: string }) {
  const [active, setActive] = useState("dashboard");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch(`/api/teacher/context`).then((r) => r.json()).then((d) => {
      setSchools(d.schools ?? []);
      if ((d.schools ?? []).length) setSchoolId(d.schools[0].id);
    }).catch(() => {});
  }, []);
  const loadUnread = useCallback(() => { fetch(`/api/me/notifications`).then((r) => r.json()).then((d) => setUnread(d.unread ?? 0)).catch(() => {}); }, []);
  useEffect(() => { loadUnread(); }, [loadUnread]);
  useEffect(() => { if (active !== "notifications") loadUnread(); }, [active, loadUnread]);

  function nav(k: string) { setActive(k); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }

  const NAV: NavGroup[] = [
    { label: "Assistant", items: [{ key: "assistant", label: "Ask AI Assistant", icon: "🤖" }] },
    { label: "Teaching", items: [
      { key: "dashboard", label: "Dashboard", icon: "📊" },
      { key: "students", label: "My pupils", icon: "🎓" },
      { key: "attendance", label: "Attendance", icon: "✅" },
      { key: "behaviour", label: "Behaviour", icon: "⭐" },
      { key: "reports", label: "Pupil reports", icon: "📄" },
    ] },
    { label: "Schedule", items: [
      { key: "timetable", label: "Timetable", icon: "🗓️" },
      { key: "calendar", label: "Calendar", icon: "📅" },
      { key: "trips", label: "My trips", icon: "🧳" },
    ] },
    { label: "Account", items: [
      { key: "dm", label: "Messages", icon: "💬" },
      { key: "notifications", label: "Notifications", icon: "🔔", badge: unread },
      { key: "history", label: "My history", icon: "🗂️" },
      { key: "profile", label: "My profile", icon: "🙂" },
      { key: "help", label: "Help & support", icon: "🆘" },
    ] },
  ];

  function body() {
    if (!schoolId && ["dashboard", "students", "attendance", "behaviour", "reports", "timetable", "calendar", "trips", "history", "assistant"].includes(active)) {
      return schools.length === 0 ? <div className="panel"><p className="muted">You don&apos;t have a teacher role in any school yet. Ask your school administrator to assign you.</p></div> : <div className="panel">Loading…</div>;
    }
    switch (active) {
      case "assistant": return <TAssistant schoolId={schoolId} />;
      case "dashboard": return <TDashboard schoolId={schoolId} onNavigate={nav} />;
      case "students": return <TStudents schoolId={schoolId} />;
      case "attendance": return <TAttendance schoolId={schoolId} />;
      case "behaviour": return <TBehaviour schoolId={schoolId} />;
      case "reports": return <TReports schoolId={schoolId} />;
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
    <AppShell brandSub="Teacher" nav={NAV} active={active} onNavigate={nav} title={TITLES[active] || "Teacher"} email={email} role="Teacher">
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
