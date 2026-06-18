import { useState, useEffect, useCallback } from 'react';
import { login as apiLogin, checkAuth } from '../api';

/** Decode JWT payload without verification (client-side only for expiry check) */
function decodeJWTPayload(token: string): { exp?: number; username?: string; role?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Check JWT expiry locally first — skip network round-trip if valid
      const payload = decodeJWTPayload(token);
      if (payload?.exp && payload.exp > Math.floor(Date.now() / 1000)) {
        setUser(payload.username || null);
        setLoading(false);

        // Periodic ping to check login status (default 5 minutes)
        const pingIntervalStr = localStorage.getItem('authPingInterval');
        const pingInterval = pingIntervalStr ? parseInt(pingIntervalStr, 10) : 300;
        if (pingInterval > 0) {
          const timer = setInterval(() => {
            checkAuth().then((data) => {
              if (!data?.authenticated) {
                // Session expired on server
                localStorage.removeItem('token');
                setUser(null);
              }
            }).catch(() => {}); // Ignore network errors
          }, pingInterval * 1000);
          return () => clearInterval(timer);
        }
        return;
      }
      // Token expired, clean up
      localStorage.removeItem('token');
    }
    // No valid token — check with server (for public browsing state)
    checkAuth().then((data) => {
      if (data?.username) setUser(data.username);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiLogin(username, password);
    if (data.success) setUser(username);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  return { user, loading, login, logout };
}
