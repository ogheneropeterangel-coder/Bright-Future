import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, Mail, Lock, Loader2, School, Sparkles } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion } from 'motion/react';

export default function Login() {
  const { settings } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const schoolName = settings?.school_name || 'School Portal';
  const schoolMotto = settings?.school_motto || 'Welcome';
  const logoUrl = settings?.school_logo_url || null;

  useEffect(() => {
    if (settings?.school_name) {
      document.title = `${settings.school_name} | Login`;
    }
  }, [settings?.school_name]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      let loginEmail = identifier;
      let isStudentLogin = false;
      
      // If identifier doesn't look like an email, try to find the email by username
      if (!identifier.includes('@')) {
        // Find if it's a student in the students table first
        const { data: studentData, error: studentFetchError } = await supabase
          .from('students')
          .select('id, admission_number, last_name, first_name')
          .eq('admission_number', identifier)
          .maybeSingle();
        
        if (studentFetchError) throw studentFetchError;
        
        if (studentData) {
          // If student exists and password matches surname (case-insensitive check for surname)
          if (studentData.last_name.toLowerCase() === password.toLowerCase()) {
            loginEmail = `${studentData.admission_number}@school.com`;
            isStudentLogin = true;
            
            // Use admission number as the actual authentication password
            const authPassword = studentData.admission_number;
            
            // Attempt to sign up this student if they don't have an auth account
            // This is idempotent; if they exist, it returns an "already registered" error we catch
            const { error: signUpError } = await supabase.auth.signUp({
              email: loginEmail,
              password: authPassword,
              options: {
                data: {
                  name: studentData.first_name + ' ' + studentData.last_name,
                  role: 'student',
                  username: studentData.admission_number
                }
              }
            });
            
            if (signUpError && !signUpError.message.includes('already registered')) {
              throw signUpError;
            }

            // Perform the actual sign in using admission number as password
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: loginEmail,
              password: authPassword,
            });

            if (signInError) throw signInError;
            
            navigate('/student');
            toast.success('Logged in successfully');
            return;
          } else {
            throw new Error('Invalid credentials. Please check your admission number and surname.');
          }
        } else {
          // If not a student, check if it's a staff username in profiles
          const { data: profileData, error: profileFetchError } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', identifier)
            .maybeSingle();
          
          if (profileFetchError) throw profileFetchError;
          
          if (profileData) {
            loginEmail = profileData.email;
          } else {
            throw new Error('Username not found. Please use your email or a valid admission number.');
          }
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) throw error;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        // BOOTSTRAP: If this is the primary admin email and no profile exists, create it.
        if (loginEmail === 'peteroghenero24@gmail.com') {
          const { error: insertError } = await supabase.from('profiles').insert([{
            id: data.user.id,
            name: 'Primary Admin',
            username: 'admin',
            email: loginEmail,
            role: 'admin'
          }]);
          
          if (insertError) throw insertError;
          
          // Re-fetch or just navigate
          navigate('/admin');
          toast.success('Admin profile bootstrapped successfully');
          return;
        }

        // If no profile exists and not bootstrap email, sign them out
        await supabase.auth.signOut();
        throw new Error('Your account was authenticated, but no profile was found. Please contact the administrator.');
      }

      if (profile.role === 'admin') {
        navigate('/admin');
      } else if (profile.role === 'teacher') {
        navigate('/teacher');
      } else if (profile.role === 'cashier') {
        navigate('/cashier');
      } else if (profile.role === 'exam_officer') {
        navigate('/exam_officer');
      } else {
        navigate('/student');
      }
      toast.success('Logged in successfully');
    } catch (error: any) {
      console.error('Login error details:', error);
      toast.error(error.message || 'Failed to login. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden font-sans text-white">
      {/* Background Image of Student with opacity & brand color blend */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop" 
          alt="Student Background" 
          className="w-full h-full object-cover opacity-40 mix-blend-overlay"
        />
        {/* Brand color overlay and dark gradient for depth */}
        <div className="absolute inset-0 bg-brand-purple/20 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1128]/90 via-[#0a1128]/80 to-brand-purple/40 backdrop-blur-[4px]" />
      </div>

      <Toaster position="top-right" theme="dark" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-[380px] relative z-10"
      >
        {/* The Glassmorphism Card */}
        <div className="relative bg-white/[0.03] backdrop-blur-[16px] border border-white/[0.15] rounded-[2rem] p-10 pb-8 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {/* Neo glowing edges (simulating the side lighting from the image) */}
          <div className="absolute top-1/3 -left-[1px] w-[2px] h-24 bg-gradient-to-b from-transparent via-cyan-400/90 to-transparent shadow-[0_0_15px_rgba(34,211,238,0.9)]" />
          <div className="absolute bottom-[10%] -right-[1px] w-[2px] h-20 bg-gradient-to-b from-transparent via-cyan-400/60 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.6)]" />
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-brand-purple/30 rounded-full blur-[60px]" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-[60px]" />

          <div className="flex flex-col items-center mb-8 relative z-10 text-center">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-24 h-24 rounded-full border border-cyan-400/50 flex items-center justify-center p-2 mb-6 shadow-[0_0_15px_rgba(34,211,238,0.1)] bg-white/5"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
              ) : (
                <School className="w-10 h-10 text-cyan-200 opacity-80" strokeWidth={1} />
              )}
            </motion.div>
            
            <h1 className="text-xl font-medium tracking-wide text-white/90 mb-1">
              {schoolName}
            </h1>
            <p className="text-[10px] font-light text-cyan-200/70 tracking-[0.2em]">{schoolMotto}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 relative z-10 w-full mb-8">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-white/70 group-focus-within:text-cyan-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-black/20 border-none rounded-sm focus:ring-1 focus:ring-cyan-400/50 focus:bg-black/30 outline-none transition-all text-white font-medium text-[13px] placeholder:text-white/60"
                placeholder="Username"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                 <svg className="w-4 h-4 text-white/70 group-focus-within:text-cyan-300 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0110 0v4"></path>
                </svg>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-black/20 border-none rounded-sm focus:ring-1 focus:ring-cyan-400/50 focus:bg-black/30 outline-none transition-all text-white text-[13px] tracking-widest placeholder:text-white/60 placeholder:tracking-widest"
                placeholder="************"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer group">
                <div className="w-3.5 h-3.5 rounded-sm bg-black/30 border border-white/20 flex items-center justify-center group-hover:border-cyan-400/50 overflow-hidden">
                   <div className="w-2.5 h-2.5 bg-white/80 rounded-sm opacity-100" />
                </div>
                <span className="text-[11px] text-white/70 group-hover:text-white/90 transition-colors">Remember me</span>
              </label>
              <a href="#" className="text-[11px] text-white/70 hover:text-cyan-300 transition-colors italic">
                Forgot Password?
              </a>
            </div>

            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full mt-8 bg-gradient-to-r from-[#064275] to-[#0c66b8] hover:from-[#0a5290] hover:to-[#1777ce] text-white border border-[#1a7ad4]/30 font-medium py-3.5 rounded-md shadow-[0_4px_15px_rgba(12,102,184,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-70 text-xs tracking-widest"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>LOGIN</span>
              )}
            </motion.button>
          </form>
          
          <div className="text-center pt-6">
            <p className="text-[11px] text-white/40">
              New faculty member? <Link to="/register" className="text-white/70 hover:text-cyan-300 transition-colors">Create Account</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
