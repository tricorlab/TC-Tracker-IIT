import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type AuthUser,
  fetchCurrentUser,
  loginWithGoogleApi,
  loginWithPasswordApi,
  changePasswordApi,
  logoutApi,
} from '../services/api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  loginWithGoogle: (idToken: string) => Promise<AuthUser>;
  loginWithPassword: (email: string, password: string) => Promise<AuthUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const loginWithGoogle = async (idToken: string): Promise<AuthUser> => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithGoogleApi(idToken);
      if (result.user) {
        setUser(result.user);
        return result.user;
      } else {
        throw new Error('Authentication succeeded but user profile was not returned.');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = async (email: string, password: string): Promise<AuthUser> => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginWithPasswordApi(email, password);
      if (result.user) {
        setUser(result.user);
        return result.user;
      } else {
        throw new Error('Authentication succeeded but user profile was not returned.');
      }
    } catch (err: any) {
      setError(err?.message || 'Login failed');
      setUser(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    await changePasswordApi(currentPassword, newPassword);
    if (user) {
      setUser({ ...user, mustChangePassword: false });
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await logoutApi();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        loginWithGoogle,
        loginWithPassword,
        changePassword,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
