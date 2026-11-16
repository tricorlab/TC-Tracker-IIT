import { useContext } from 'react';
import { ToastContext } from './ToastContext';
import type { ToastContextType } from './ToastContext';

const noopToast: ToastContextType = {
  toasts: [],
  showToast: () => {},
  removeToast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    return noopToast;
  }
  return context;
};
