import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  School, 
  UserRound, 
  ClipboardList, 
  Settings, 
  LogOut,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Wallet,
  Receipt
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { profile, signOut, settings } = useAuth();
  const role = profile?.role;

  const adminLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/students', icon: Users, label: 'Students' },
    { to: '/admin/teachers', icon: UserRound, label: 'Teachers' },
    { to: '/admin/classes', icon: School, label: 'Classes' },
    { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
    { to: '/admin/scores', icon: ClipboardList, label: 'Manage Scores' },
    { to: '/admin/results', icon: ClipboardList, label: 'Results' },
    { to: '/admin/attendance', icon: ClipboardList, label: 'Attendance' },
    { to: '/admin/idcards', icon: UserRound, label: 'Student ID Cards' },
    { to: '/admin/permits', icon: ClipboardList, label: 'Exam Permits' },
    { to: '/admin/promotion', icon: TrendingUp, label: 'Promotion' },
    { to: '/admin/transcript', icon: GraduationCap, label: 'Transcript' },
    { to: '/admin/fees', icon: Wallet, label: 'Fee Status Checker' },
    { to: '/admin/fee-standards', icon: Receipt, label: 'Fee Standards' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  const cashierLinks = [
    { to: '/cashier', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/cashier/fees', icon: Wallet, label: 'Fee Management' },
    { to: '/cashier/debt', icon: TrendingUp, label: 'Debt Management' },
    { to: '/cashier/fee-standards', icon: Receipt, label: 'Fee Standards' },
    { to: '/cashier/students', icon: Users, label: 'Students List' },
  ];

  const teacherLinks = [
    { to: '/teacher', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/teacher/attendance', icon: ClipboardList, label: 'Daily Attendance' },
    { to: '/teacher/scores', icon: ClipboardList, label: 'Manage Scores' },
    { to: '/teacher/students', icon: Users, label: 'My Students' },
    { to: '/teacher/results', icon: ClipboardList, label: 'View Results' },
  ];

  const studentLinks = [
    { to: '/student', icon: LayoutDashboard, label: 'Dashboard' },
  ];

  const examOfficerLinks = [
    { to: '/exam_officer', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/teachers', icon: UserRound, label: 'Teachers' },
    { to: '/admin/classes', icon: School, label: 'Classes' },
    { to: '/admin/subjects', icon: BookOpen, label: 'Subjects' },
    { to: '/admin/scores', icon: ClipboardList, label: 'Manage Scores' },
    { to: '/admin/results', icon: ClipboardList, label: 'Results' },
    { to: '/admin/attendance', icon: ClipboardList, label: 'Attendance' },
    { to: '/admin/idcards', icon: UserRound, label: 'Student ID Cards' },
    { to: '/admin/permits', icon: ClipboardList, label: 'Exam Permits' },
    { to: '/admin/promotion', icon: TrendingUp, label: 'Promotion' },
    { to: '/admin/transcript', icon: GraduationCap, label: 'Transcript' },
  ];

  const links = role === 'admin' ? adminLinks : 
                role === 'teacher' ? teacherLinks : 
                role === 'cashier' ? cashierLinks : 
                role === 'exam_officer' ? examOfficerLinks : 
                studentLinks;

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1110] text-[#f8f8f8] border-r border-[#BD8E84]/20">
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#BD8E84] rounded-xl flex items-center justify-center shadow-lg shadow-[#BD8E84]/20 overflow-hidden">
          {settings?.school_logo_url ? (
            <img src={settings.school_logo_url} alt="Logo" className="w-full h-full object-contain filter drop-shadow-sm" />
          ) : (
            <GraduationCap className="w-6 h-6 text-[#f8f8f8]" />
          )}
        </div>
        <span className="text-xl font-bold tracking-tight truncate text-[#f8f8f8]">{settings?.school_name || 'School Portal'}</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            end={['/admin', '/teacher', '/student', '/exam_officer'].includes(link.to)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive 
                  ? "bg-[#BD8E84] text-[#f8f8f8] shadow-lg shadow-[#BD8E84]/20" 
                  : "text-[#BD8E84]/70 hover:bg-[#BD8E84]/10 hover:text-[#f8f8f8]"
              )
            }
          >
            <link.icon className="w-5 h-5" />
            <span className="font-medium">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-[#BD8E84]/20">
        <div className="flex items-center gap-3 px-4 py-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#BD8E84] flex items-center justify-center text-sm font-bold text-[#f8f8f8]">
            {profile?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-[#f8f8f8]">{profile?.name}</p>
            <p className="text-xs text-[#BD8E84]/70 truncate capitalize">{profile?.role}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 w-full px-4 py-3 text-[#BD8E84]/70 hover:bg-[#BD8E84]/10 hover:text-[#f8f8f8] rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
