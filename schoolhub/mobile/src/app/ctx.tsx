import { createContext, useContext } from "react";
import { RoleKey, InboxItem } from "@/data/mock";

export type RoleCtx = {
  roleKey: RoleKey;
  tab: string;
  setTab: (k: string) => void;
  inbox: InboxItem[];
  unread: number;
  mark: (id: string) => void;
  markAll: () => void;
};

export const RoleContext = createContext<RoleCtx>(null as any);
export const useRole = () => useContext(RoleContext);
