import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = async (data) => {
    const u = await authApi.login(data);
    setUser(u);
    return u;
  };
  const register = async (data) => {
    const u = await authApi.register(data);
    setUser(u);
    return u;
  };
  const logout = async () => { await authApi.logout(); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
