import React from "react";
import { RoleKey } from "@/data/mock";
import { parentScreens } from "@/app/parent";
import { teacherScreens } from "@/app/teacher";
import { driverScreens } from "@/app/driver";
import { adminScreens } from "@/app/admin";
import { studentScreens } from "@/app/student";
import { Assistant, Inbox, Account } from "@/app/shared";
import { DirectMessages } from "@/app/dm";
import ParentCalendarScreen from "@/app/calendar";
import ParentClubsScreen from "@/app/clubs";

/* Map of role → tab key → screen component. Shared screens (assistant, alerts,
 * account) are bound to the role so each renders the right data/scope. */
export const SCREENS: Record<RoleKey, Record<string, React.FC>> = {
  parent: {
    ...parentScreens,
    calendar: () => <ParentCalendarScreen />,
    clubs: () => <ParentClubsScreen />,
    assistant: () => <Assistant roleKey="parent" />,
    alerts: () => <Inbox />,
    account: () => <Account roleKey="parent" />,
  },
  teacher: {
    ...teacherScreens,
    messages: () => <DirectMessages />,
    assistant: () => <Assistant roleKey="teacher" />,
    account: () => <Account roleKey="teacher" />,
  },
  driver: {
    ...driverScreens,
    messages: () => <DirectMessages />,
    assistant: () => <Assistant roleKey="driver" />,
    account: () => <Account roleKey="driver" />,
  },
  admin: {
    ...adminScreens,
    messages: () => <DirectMessages />,
    assistant: () => <Assistant roleKey="admin" />,
    account: () => <Account roleKey="admin" />,
  },
  student: {
    ...studentScreens,
    account: () => <Account roleKey="student" />,
  },
};
