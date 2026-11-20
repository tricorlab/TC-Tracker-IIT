import React from 'react';
import {
  Settings,
  FileText,
  Sliders,
  Users,
  Mail,
  FileSpreadsheet,
  Wrench,
  ArrowRight,
  Megaphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';

export const AdminPanelPage: React.FC = () => {
  const tools = [
    {
      to: '/admin/notices',
      title: 'Staff Notices & Email Broadcasts',
      description: 'Publish institutional circulars, announcements, and broadcast emails directly to staff.',
      icon: Megaphone,
    },
    {
      to: '/admin/users',
      title: 'User & Role Management',
      description: 'Onboard staff, edit details, assign roles, and activate/deactivate accounts.',
      icon: Users,
    },
    {
      to: '/admin/leave-balances',
      title: 'Leave Balances & Year Rollover',
      description: 'View employee balances, adjust quotas, and execute 50% year-end transitions.',
      icon: Sliders,
    },
    {
      to: '/admin/leave-policy',
      title: 'Leave Policy Settings',
      description: 'Review monthly 2.5-day accrual rules and carry-forward parameters.',
      icon: Settings,
    },
    {
      to: '/admin/email-logs',
      title: 'Email Audit Inspector',
      description: 'Inspect dispatch history and transmission status for leave notifications.',
      icon: Mail,
    },
    {
      to: '/admin/activity-logs',
      title: 'System Activity Logs',
      description: 'Review audit logs for attendance edits, user changes, and year transitions.',
      icon: FileText,
    },
    {
      to: '/reports',
      title: 'Attendance & Leave Reports',
      description: 'Export monthly working days and annual leave balances to CSV or print view.',
      icon: FileSpreadsheet,
    },
    {
      to: '/admin/database-doctor',
      title: 'Database Doctor & Health',
      description: 'Inspect spreadsheet connectivity, verify worksheet headers, and repair schemas.',
      icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Administrator Tools"
        subtitle="System configuration, user management, audit logs, and policies."
        actions={
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200/80 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 text-xs font-medium transition shadow-2xs"
          >
            &larr; Back to Dashboard
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to}
              className="group relative bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-150 hover:border-slate-300 hover:shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-50 border border-slate-100 text-slate-600 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h4 className="font-semibold text-slate-900 text-xs sm:text-sm tracking-tight group-hover:text-slate-900">
                  {tool.title}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 font-normal leading-relaxed">
                  {tool.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPanelPage;
