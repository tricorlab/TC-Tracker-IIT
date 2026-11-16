import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Manager Portal is consolidated into Admin and Staff Dashboards.
 * Automatically redirects to /dashboard.
 */
export const ManagerPortalPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
};

export default ManagerPortalPage;
