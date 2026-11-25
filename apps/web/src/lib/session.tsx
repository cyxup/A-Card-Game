import type { SessionInfo } from "@stacked/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { game } from "./game";

interface SessionContextValue {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<SessionInfo | null>;
  becomeGuest: (name: string) => Promise<SessionInfo>;
  login: (username: string, password: string) => Promise<SessionInfo>;
  register: (username: string, password: string, displayName?: string) => Promise<SessionInfo>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const ANON: SessionInfo = { kind: "anon", user: null, guestName: null, unlocks: [], achievements: [] };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async (): Promise<SessionInfo | null> => {
    try {
      const data = await api.get<SessionInfo>("/api/session");
      if (alive.current) setSession(data);
      return data;
    } catch {
      if (alive.current) setSession(ANON);
      return null;
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("stacked:refresh-session", onRefresh);
    return () => {
      alive.current = false;
      window.removeEventListener("stacked:refresh-session", onRefresh);
    };
  }, [refresh]);

  const becomeGuest = useCallback(async (name: string) => {
    const data = await api.post<SessionInfo>("/api/auth/guest", { name });
    game.reset();
    setSession(data);
    return data;
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<SessionInfo>("/api/auth/login", { username, password });
    game.reset();
    setSession(data);
    return data;
  }, []);

  const register = useCallback(async (username: string, password: string, displayName?: string) => {
    const data = await api.post<SessionInfo>("/api/auth/register", { username, password, displayName });
    game.reset();
    setSession(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    game.reset();
    setSession(ANON);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ session, loading, refresh, becomeGuest, login, register, logout }),
    [session, loading, refresh, becomeGuest, login, register, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
