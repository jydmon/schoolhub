"use client";

import { useEffect, useState } from "react";
import AssistantChat from "@/components/AssistantChat";
import ParentOverview from "./ParentOverview";
import ParentCalendar from "./ParentCalendar";
import ParentTimetable from "./ParentTimetable";
import ParentChildren from "./ParentChildren";
import ParentMenu from "./ParentMenu";
import ParentClubs from "./ParentClubs";
import ParentTrust from "./ParentTrust";
import ParentReportsCentre from "./ParentReportsCentre";
import ParentSubscription from "./ParentSubscription";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import { ParentNotifications, ParentTransport, ParentTrips, ParentRewards, ParentPreferences, ParentMessaging, ParentProfile } from "./ParentExtra";

const PARENT_EXAMPLES = [
  "What does my child need tomorrow?", "When is Sports Day?", "What is the uniform policy?",
  "How do I report an absence?", "What is my child's attendance this term?", "When is Parents' Evening?",
  "What homework is due this week?", "Are there any trips coming up?",
];

export default function ParentPages({ active, onNavigate }: { active: string; onNavigate?: (k: string) => void }) {
  const [children, setChildren] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`/api/parent/overview?range=today`).then((r) => r.json()).then((d) => {
      setChildren(d.children || []);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const kids = children.map((c: any) => ({ id: c.id, name: c.name, schoolId: c.schoolId }));
  const schools = Array.from(new Map(children.map((c: any) => [c.schoolId, c.schoolName])).entries()).map(([id, name]) => ({ id: id as string, name: name as string }));

  const needsChildren = ["children", "calendar", "timetable", "transport", "reports"].includes(active);
  if (needsChildren && !ready) return <div className="panel">Loading…</div>;

  switch (active) {
    case "assistant":
      return (
        <>
          <div className="panel">
            <h2>Ask AI Assistant</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Ask anything about your children — attendance, homework, reports, trips, timetables, school policies and events. The assistant only sees information for children linked to your account.</p>
          </div>
          <AssistantChat examples={PARENT_EXAMPLES} />
        </>
      );
    case "overview": return <ParentOverview onNavigate={onNavigate} />;
    case "children": return <ParentChildren children={kids} />;
    case "calendar": return <ParentCalendar children={kids} schools={schools} />;
    case "timetable": return <ParentTimetable children={kids} />;
    case "notifications": return <ParentNotifications onNavigate={onNavigate} />;
    case "menu": return <ParentMenu />;
    case "clubs": return <ParentClubs />;
    case "trust": return <ParentTrust />;
    case "transport": return <ParentTransport children={kids} />;
    case "trips": return <ParentTrips />;
    case "rewards": return <ParentRewards />;
    case "reports": return <ParentReportsCentre children={kids} schools={schools} />;
    case "messaging": return <ParentMessaging />;
    case "subscription": return <ParentSubscription />;
    case "profile": return <AccountProfile />;
    case "compliance": return <ParentProfile />;
    case "dm": return <Messaging />;
    case "help": return <HelpSupport contactHint="Your school office can also help with account questions." />;
    case "preferences": return <ParentPreferences />;
    default: return <ParentOverview onNavigate={onNavigate} />;
  }
}
