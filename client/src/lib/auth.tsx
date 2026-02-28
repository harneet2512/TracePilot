import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@shared/schema";
import { getCsrfToken } from "./csrf";
import { isDemoMode, demoUser, logDemoMode, shouldFallbackToDemo } from "./demoMode";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    let status: number | null = null;
    let authenticated = false;
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      status = res.status;
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        authenticated = true;
        if (!getCsrfToken()) {
          await fetch("/api/auth/csrf", { credentials: "include" });
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      setUser(null);
      if (shouldFallbackToDemo(status, error)) {
        logDemoMode("AUTH_FALLBACK", { status, error: String(error) });
        setUser(demoUser);
        authenticated = true;
      }
    } finally {
      if (!authenticated && shouldFallbackToDemo(status)) {
        logDemoMode("AUTH_FALLBACK", { status });
        setUser(demoUser);
      }
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message || "Login failed");
      }
      const data = await res.json();
      setUser(data);
    } catch (error) {
      if (shouldFallbackToDemo(null, error)) {
        logDemoMode("LOGIN_FALLBACK", { error: String(error) });
        setUser(demoUser);
        return;
      }
      throw error;
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
