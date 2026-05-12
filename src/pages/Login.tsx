import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GraduationCap, Mail, Lock, Loader2, School, Sparkles } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion } from 'motion/react';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [schoolName, setSchoolName] = useState('Bright Future Academy');
  const [schoolMotto, setSchoolMotto] = useState('Knowledge is Power');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSchoolSettings();
  }, []);

  async function fetchSchoolSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('school_name, school_logo_url, school_motto').single();
      if (data) {
        setSchoolName(data.school_name);
        setLogoUrl(data.school_logo_url);
        if (data.school_motto) {
          setSchoolMotto(data.school_motto);
        }
      }
    } catch (e) {
      console.error('Failed to fetch school settings');
    }
  }

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
    <div className="min-h-screen flex items-center justify-center bg-brand-milk p-4 relative overflow-hidden font-sans">
      {/* Futuristic Background Layers */}
      <div className="absolute inset-0 z-0">
        {/* Deep Background Image (Students) */}
        <div className="absolute inset-0 z-[-2] opacity-20">
          <img 
            src="https://images.unsplash.com/photo-1544717297-fa95b9ee9623?q=80&w=2000&auto=format&fit=crop" 
            alt="Students background" 
            className="w-full h-full object-cover object-center grayscale mix-blend-multiply"
          />
        </div>
        
        {/* Animated Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-[0.05]" />
        
        {/* Dynamic Brand Orbs */}
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, 80, 0],
            y: [0, 40, 0],
            rotate: [0, 45, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -left-20 w-[45rem] h-[45rem] bg-brand-purple/15 rounded-full blur-[140px]"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.4, 1],
            x: [0, -80, 0],
            y: [0, -40, 0],
            rotate: [0, -45, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-40 -right-40 w-[50rem] h-[50rem] bg-brand-purple/20 rounded-full blur-[160px]"
        />
        
        {/* Milk Glass Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-milk/40 to-brand-milk" />
      </div>

      <Toaster position="top-right" theme="light" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-white/70 backdrop-blur-3xl rounded-[3.5rem] p-8 md:p-14 border border-white shadow-[0_32px_128px_-16px_rgba(124,58,237,0.15)] relative z-10 mx-auto"
      >
        {/* Mobile Header Image (Visible only on small screens) */}
        <div className="md:hidden w-full h-32 rounded-[2rem] mb-8 overflow-hidden relative border border-white/50">
          <img 
            src="https://images.unsplash.com/photo-1509062522246-3755977927d7?q=80&w=800&auto=format&fit=crop" 
            alt="Learning" 
            className="w-full h-full object-cover grayscale brightness-110"
          />
          <div className="absolute inset-0 bg-brand-purple/20 mix-blend-overlay" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/80 to-transparent" />
        </div>

        <div className="flex flex-col items-center mb-12">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-24 h-24 bg-brand-purple rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-brand-purple/30 relative group overflow-hidden"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-3" />
            ) : (
              <School className="w-12 h-12 text-white" />
            )}
            <div className="absolute -inset-2 bg-brand-purple/20 rounded-[2.2rem] blur animate-pulse group-hover:bg-brand-purple/40 transition-colors" />
          </motion.div>
          
          <div className="text-center">
            <h1 className="text-4xl font-black text-brand-slate tracking-tighter mb-2 uppercase leading-none">
              {schoolName}
            </h1>
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-8 bg-brand-purple/20" />
              <p className="text-[10px] font-black text-brand-purple uppercase tracking-[0.4em] opacity-90">{schoolMotto}</p>
              <div className="h-px w-8 bg-brand-purple/20" />
            </div>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-slate/40 uppercase tracking-[0.2em] ml-2">Access Portal ID</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-slate-300 group-focus-within:text-brand-purple transition-colors" />
              </div>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-14 pr-6 py-4.5 bg-white/40 border border-slate-100/50 rounded-[1.8rem] focus:ring-4 focus:ring-brand-purple/5 focus:border-brand-purple focus:bg-white outline-none transition-all text-brand-slate font-bold text-sm placeholder:text-slate-300 placeholder:font-medium"
                placeholder="Username or Reg No."
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-brand-slate/40 uppercase tracking-[0.2em] ml-2">Security Hash</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-slate-300 group-focus-within:text-brand-purple transition-colors" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-14 pr-6 py-4.5 bg-white/40 border border-slate-100/50 rounded-[1.8rem] focus:ring-4 focus:ring-brand-purple/5 focus:border-brand-purple focus:bg-white outline-none transition-all text-brand-slate font-bold text-sm placeholder:text-slate-300 placeholder:font-medium"
                placeholder="••••••••"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full bg-brand-purple hover:bg-purple-700 text-white font-black py-5 rounded-[2rem] shadow-xl shadow-brand-purple/20 transition-all flex items-center justify-center gap-4 disabled:opacity-50 mt-8 text-[11px] uppercase tracking-[0.3em] group"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Initialize Session</span>
                <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              </>
            )}
          </motion.button>
        </form>

        <div className="mt-12 pt-10 border-t border-brand-purple/5 text-center space-y-8">
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-medium">
              New faculty member? <Link to="/register" className="text-brand-purple font-black hover:text-purple-700 transition-colors border-b-2 border-brand-purple/10 hover:border-brand-purple pb-0.5">Create Account</Link>
            </p>
            <p className="text-[10px] text-slate-400 font-bold group cursor-pointer hover:text-brand-slate transition-colors uppercase tracking-widest">
              Forgotten ID <span className="text-brand-purple/50 mx-2">•</span> <span className="hover:text-brand-purple">Contact Registry</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-brand-purple animate-pulse shadow-[0_0_12px_rgba(124,58,237,0.5)]" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Neural Sync</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">Core Secured</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
