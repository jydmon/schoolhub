import { createContext, useContext } from "react";

export type RoleCtx = {
  setTab: (k: string) => void;
};

export const RoleContext = createContext<RoleCtx>({ setTab: () => {} });
export const useRole = () => useContext(RoleContext);
