import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Manager dashboard is deprecated and removed. All administrative oversight
 * is consolidated into AdminDashboardView. Automatically redirects to /dashboard.
 */
export const ManagerDashboardView: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
};

export default ManagerDashboardView;
