import { useState, useEffect, useCallback } from 'react';
import { login as apiLogin, checkAuth } from '../api';

export function useAuth() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
