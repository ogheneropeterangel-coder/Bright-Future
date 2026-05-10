import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Student, Class, Result, Subject, Settings } from '../../types';
import { 
  Search, 
  Printer, 
  Download, 
  Loader2,
  GraduationCap,
  Trophy,
  User,
  Calendar,
  BookOpen,
  Activity,
  Heart,
  MessageSquare,
  Filter,
  TrendingUp,
  Award,
  ChevronRight,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell
} from 'recharts';

export default function Results() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;
  const isTeacher = profile?.role === 'teacher';

  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [psychomotor, setPsychomotor] = useState<any>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [classSubjects, setClassSubjects] = useState<Subject[]>([]);
  const [nextTermBegins, setNextTermBegins] = useState('');
  const [classResults, setClassResults] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<{ present: number, total: number }>({ present: 0, total: 0 });
  const [cumulativeResults, setCumulativeResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingResults, setFetchingResults] = useState(false);
  const [activeReport, setActiveReport] = useState<'terminal' | 'annual'>('terminal');
  
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    if (profile) {
      fetchInitialData();
    }
  }, [profile]);

  async function fetchInitialData() {
    try {
      let classesQuery = supabase.from('classes').select('*').order('class_name');
      
      if (!canManage && profile?.id) {
        // If teacher, only get classes assigned to them
        const { data: teacherClassesPivot } = await supabase
          .from('teacher_classes')
          .select('class_id')
          .eq('teacher_id', profile.id);
        
        const { data: teacherClassesDirect } = await supabase
          .from('classes')
          .select('id')
          .eq('teacher_id', profile.id);

        const { data: studentClasses } = await supabase
          .from('students')
          .select('class_id, classes!class_id(id, class_name)')
          .eq('teacher_id', profile.id);

        // Get classes from subjects assigned to this teacher
        const { data: teacherSubjects } = await supabase
          .from('teacher_subjects')
          .select('subject_id')
          .eq('teacher_id', profile.id);
        
        const teacherSubjectIds = teacherSubjects?.map(ts => ts.subject_id) || [];
        
        let subjectClasses: any[] = [];
        if (teacherSubjectIds.length > 0) {
          const { data: scData } = await supabase
            .from('class_subjects')
            .select('class_id, classes!class_id(id, class_name)')
            .in('subject_id', teacherSubjectIds);
          subjectClasses = scData?.map(cs => cs.class_id).filter(Boolean) || [];
        }
        
        const pivotIds = teacherClassesPivot?.map(c => c.class_id) || [];
        const directIds = teacherClassesDirect?.map(c => c.id) || [];
        const studentClassIds = studentClasses?.filter(s => s.class_id).map(s => s.class_id) || [];
        
        const classIds = Array.from(new Set([...pivotIds, ...directIds, ...studentClassIds, ...subjectClasses]));
        
        if (classIds.length > 0) {
          classesQuery = classesQuery.in('id', classIds);
        } else {
          setClasses([]);
          setLoading(false);
          return;
        }
      }

      const [classesRes, settingsRes] = await Promise.all([
        classesQuery,
        supabase.from('settings').select('*').single()
      ]);
      setClasses(classesRes.data || []);
      setSettings(settingsRes.data);
      setNextTermBegins(settingsRes.data?.next_term_begins || '');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudents(classId: string) {
    setSelectedClass(classId);
    setSelectedStudent(null);
    setResults([]);
    setPsychomotor(null);
    
    if (!classId) return;

    try {
      let query = supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('last_name');

      if (!canManage && profile?.id) {
        // Check if teacher is assigned to this class
        const { data: isAssignedToClass } = await supabase
          .from('teacher_classes')
          .select('id')
          .eq('teacher_id', profile.id)
          .eq('class_id', classId)
          .maybeSingle();
        
        const { data: isDirectTeacher } = await supabase
          .from('classes')
          .select('id')
          .eq('id', classId)
          .eq('teacher_id', profile.id)
          .maybeSingle();

        // Check if teacher is assigned to any subject in this class
        const { data: teacherSubjects } = await supabase
          .from('teacher_subjects')
          .select('subject_id')
          .eq('teacher_id', profile.id);
        
        const teacherSubjectIds = teacherSubjects?.map(ts => ts.subject_id) || [];
        
        const { data: isSubjectTeacher } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', classId)
          .in('subject_id', teacherSubjectIds)
          .maybeSingle();

        if (!isAssignedToClass && !isDirectTeacher && !isSubjectTeacher) {
          // If not assigned to class or subject, only show students assigned directly to them in this class
          query = query.eq('teacher_id', profile.id);
        }
      }

      const { data: studentsData, error: studentsError } = await query;
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      // Fetch subjects assigned to this class with fallbacks for teachers
      let subjectsForClass: Subject[] = [];
      const { data: classSubjectsData, error: classSubjectsError } = await supabase
        .from('class_subjects')
        .select('subject_id, subjects(*)')
        .eq('class_id', classId);
      
      if (classSubjectsError) throw classSubjectsError;

      subjectsForClass = (classSubjectsData || []).map(d => {
        const sub = Array.isArray(d.subjects) ? d.subjects[0] : d.subjects;
        return sub as unknown as Subject;
      }).filter(Boolean) || [];

      if (!canManage && profile?.role === 'teacher') {
        // Fallback 1: If no subjects in class_subjects, use teacher's assigned subjects
        if (subjectsForClass.length === 0) {
          const { data: teacherSubjectsData } = await supabase
            .from('teacher_subjects')
            .select('subject_id, subjects(*)')
            .eq('teacher_id', profile.id);
          
          subjectsForClass = (teacherSubjectsData || []).map(d => {
            const sub = Array.isArray(d.subjects) ? d.subjects[0] : d.subjects;
            return sub as unknown as Subject;
          }).filter(Boolean) || [];
        }

        // Fallback 2: If still no subjects, fetch all subjects
        if (subjectsForClass.length === 0) {
          const { data: allSubjectsData } = await supabase.from('subjects').select('*').order('subject_name');
          subjectsForClass = allSubjectsData || [];
        }
      }

      setClassSubjects(subjectsForClass);

      // Fetch all results for this class to calculate positions
      const { data: resultsData, error: resultsError } = await supabase
        .from('results')
        .select('*')
        .eq('class_id', classId)
        .eq('term', settings?.current_term)
        .eq('session', settings?.current_session);
      
      if (resultsError) throw resultsError;
      setClassResults(resultsData || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function fetchStudentResults(student: Student) {
    setSelectedStudent(student);
    setFetchingResults(true);
    try {
      const isThirdTerm = settings?.current_term?.toLowerCase().includes('3rd');
      
      const [resultsRes, psychoRes, attendanceRes, allTermsRes] = await Promise.all([
        supabase
          .from('results')
          .select('*, subjects(subject_name)')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session),
        supabase
          .from('psychomotor_skills')
          .select('*')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term)
          .eq('session', settings?.current_session)
          .maybeSingle(),
        supabase
          .from('attendance')
          .select('status')
          .eq('student_id', student.id)
          .eq('term', settings?.current_term || '1st')
          .eq('session', settings?.current_session || '2025/2026'),
        isThirdTerm ? supabase
          .from('results')
          .select('*, subjects(subject_name)')
          .eq('student_id', student.id)
          .eq('session', settings?.current_session) : Promise.resolve({ data: [] })
      ]);

      if (attendanceRes.data) {
        setAttendanceStats({
          present: attendanceRes.data.filter(a => a.status === 'Present').length,
          total: attendanceRes.data.length
        });
      }

      // Merge class subjects with results and filter out those with no scores or zero total score
      const mergedResults = classSubjects.map(subject => {
        const result = resultsRes.data?.find(r => r.subject_id === subject.id);
        const total_score = (result?.ca1_score || 0) + (result?.ca2_score || 0) + (result?.exam_score || 0);
        return {
          subject_id: subject.id,
          subject_name: subject.subject_name,
          ca1_score: result?.ca1_score || 0,
          ca2_score: result?.ca2_score || 0,
          exam_score: result?.exam_score || 0,
          total_score: total_score,
          has_result: !!result && total_score > 0
        };
      }).filter(r => r.has_result);

      if (isThirdTerm && allTermsRes.data) {
        const cumulative = classSubjects.map(subject => {
          const firstTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('1st'));
          const secondTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('2nd'));
          const thirdTerm = allTermsRes.data?.find(r => r.subject_id === subject.id && r.term.toLowerCase().includes('3rd'));

          const firstTermScore = firstTerm ? (firstTerm.ca1_score + firstTerm.ca2_score + firstTerm.exam_score) : 0;
          const secondTermScore = secondTerm ? (secondTerm.ca1_score + secondTerm.ca2_score + secondTerm.exam_score) : 0;
          const thirdTermScore = thirdTerm ? (thirdTerm.ca1_score + thirdTerm.ca2_score + thirdTerm.exam_score) : 0;

          const cumulativeTotal = (firstTermScore * 0.3) + (secondTermScore * 0.3) + (thirdTermScore * 0.4);

          return {
            subject_id: subject.id,
            subject_name: subject.subject_name,
            first_term: firstTermScore,
            second_term: secondTermScore,
            third_term: thirdTermScore,
            cumulative: cumulativeTotal,
            has_result: firstTermScore > 0 || secondTermScore > 0 || thirdTermScore > 0
          };
        }).filter(r => r.has_result);
        setCumulativeResults(cumulative);
      } else {
        setCumulativeResults([]);
      }

      setResults(mergedResults);
      setPsychomotor(psychoRes.data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setFetchingResults(false);
    }
  }

  const calculateTotal = () => results.reduce((acc, curr) => acc + (curr.total_score || 0), 0);
  const calculateAverage = () => {
    const subjectsWithResults = results.filter(r => r.has_result);
    if (subjectsWithResults.length === 0) return '0.00';
    return (calculateTotal() / subjectsWithResults.length).toFixed(2);
  };

  const calculateCumulativeTotal = () => cumulativeResults.reduce((acc, curr) => acc + curr.cumulative, 0);
  const calculateCumulativeAverage = () => {
    if (cumulativeResults.length === 0) return '0.00';
    return (calculateCumulativeTotal() / cumulativeResults.length).toFixed(2);
  };

  const calculatePosition = () => {
    if (!selectedStudent || classResults.length === 0) return { rank: '-', total: students.length };
    
    // Calculate averages for all students in class, excluding subjects with zero total score
    const averages = students.map(s => {
      const studentResults = classResults.filter(r => r.student_id === s.id && (r.ca1_score + r.ca2_score + r.exam_score) > 0);
      if (studentResults.length === 0) return { id: s.id, avg: 0 };
      const total = studentResults.reduce((acc, r) => acc + (r.ca1_score + r.ca2_score + r.exam_score), 0);
      return { id: s.id, avg: total / studentResults.length };
    });

    // Sort by average descending
    const sorted = [...averages].sort((a, b) => b.avg - a.avg);
    const rank = sorted.findIndex(s => s.id === selectedStudent.id) + 1;
    
    if (rank === 0) return { rank: '-', total: students.length };
    
    // Add suffix
    const j = rank % 10, k = rank % 100;
    let rankStr = rank.toString();
    if (j === 1 && k !== 11) rankStr = rank + "st";
    else if (j === 2 && k !== 12) rankStr = rank + "nd";
    else if (j === 3 && k !== 13) rankStr = rank + "rd";
    else rankStr = rank + "th";

    return { rank: rankStr, total: students.length };
  };

  const calculateSubjectPosition = (subjectId: number, score: number) => {
    if (classResults.length === 0) return '-';
    
    // Get all scores for this subject in this class/term/session
    const subjectScores = classResults
      .filter(r => r.subject_id === subjectId && (r.ca1_score + r.ca2_score + r.exam_score) > 0)
      .map(r => r.ca1_score + r.ca2_score + r.exam_score);
    
    if (subjectScores.length === 0) return '-';

    // Sort scores descending
    const sortedScores = [...subjectScores].sort((a, b) => b - a);
    const rank = sortedScores.indexOf(score) + 1;

    if (rank === 0) return '-';

    // Add suffix
    const j = rank % 10, k = rank % 100;
    if (j === 1 && k !== 11) return rank + "st";
    if (j === 2 && k !== 12) return rank + "nd";
    if (j === 3 && k !== 13) return rank + "rd";
    return rank + "th";
  };

  const getRemark = (score: number) => {
    if (score >= 75) return 'Excellent';
    if (score >= 70) return 'Very Good';
    if (score >= 65) return 'Good';
    if (score >= 60) return 'Credit';
    if (score >= 55) return 'Merit';
    if (score >= 50) return 'Pass';
    if (score >= 45) return 'Fair';
    if (score >= 40) return 'Poor';
    return 'Fail';
  };

  const updateNextTermBegins = async (val: string) => {
    setNextTermBegins(val);
    try {
      const { error } = await supabase.from('settings').update({ next_term_begins: val }).eq('id', 1);
      if (error) {
        if (error.message.includes("next_term_begins") || error.code === "42703") {
          console.warn('Next Term Begins could not be updated because the column is missing in the database.');
          toast.warning('Note: "Next Term Begins" could not be saved because the column is missing in your database.');
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Failed to update next term begins', error);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen space-y-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="w-12 h-12 text-blue-600" />
      </motion.div>
      <p className="text-slate-400 font-medium animate-pulse">Loading Academic Records...</p>
    </div>
  );

  const psychomotorData = psychomotor ? [
    { subject: 'Handwriting', A: psychomotor.handwriting || 0 },
    { subject: 'Fluency', A: psychomotor.fluency || 0 },
    { subject: 'Games', A: psychomotor.games || 0 },
    { subject: 'Sports', A: psychomotor.sports || 0 },
    { subject: 'Gymnastics', A: psychomotor.gymnastics || 0 },
    { subject: 'Handling Tools', A: psychomotor.handling_tools || 0 },
    { subject: 'Drawing', A: psychomotor.drawing_painting || 0 },
    { subject: 'Crafts', A: psychomotor.crafts || 0 },
    { subject: 'Musical', A: psychomotor.musical_skills || 0 },
  ] : [];

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#0891b2'];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      <Toaster position="top-right" />
      
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Award className="w-10 h-10 text-blue-600" />
            Performance Hub
          </h1>
          <p className="text-slate-500 font-medium mt-1">Generate, analyze and print specialized academic reports.</p>
        </div>
        {selectedStudent && (
          <div className="flex items-center gap-3">
             {settings?.current_term?.toLowerCase().includes('3rd') && (
               <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                 <button
                   onClick={() => setActiveReport('terminal')}
                   className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                     activeReport === 'terminal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Terminal
                 </button>
                 <button
                   onClick={() => setActiveReport('annual')}
                   className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                     activeReport === 'annual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Annual
                 </button>
               </div>
             )}
            <button 
              onClick={() => handlePrint()}
              className={`flex items-center gap-2 px-8 py-3 text-white rounded-2xl shadow-2xl transition-all font-black uppercase tracking-tighter text-sm ${
                activeReport === 'annual' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              } hover:scale-[1.02] active:scale-95`}
            >
              <Printer className="w-5 h-5" />
              Print Report
            </button>
          </div>
        )}
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Selection Panel */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="md:col-span-3 space-y-6"
        >
          <div className="bg-white p-8 rounded-[32px] shadow-xl shadow-slate-100 border border-slate-100 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Filter className="w-3 h-3" /> Step 1: Select Class
              </label>
              <select
                value={selectedClass}
                onChange={(e) => fetchStudents(e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white transition-all outline-none font-bold text-slate-700 appearance-none cursor-pointer"
              >
                <option value="">-- Choose Level --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>

            <AnimatePresence mode="wait">
              {selectedClass ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4"
                >
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <User className="w-3 h-3" /> Step 2: Choose Student
                  </label>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {students.length > 0 ? students.map(student => (
                      <button
                        key={student.id}
                        onClick={() => fetchStudentResults(student)}
                        className={`w-full text-left px-5 py-4 rounded-2xl text-sm transition-all group relative overflow-hidden ${
                          selectedStudent?.id === student.id 
                            ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' 
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className="relative z-10">
                          <div className="font-black tracking-tight">{student.first_name} {student.last_name}</div>
                          <div className={`text-[10px] uppercase font-bold mt-0.5 ${selectedStudent?.id === student.id ? 'text-blue-200' : 'text-slate-400'}`}>
                            {student.admission_number}
                          </div>
                        </div>
                        {selectedStudent?.id === student.id && (
                          <motion.div layoutId="active-bg" className="absolute inset-0 bg-blue-600 -z-10" />
                        )}
                        <ChevronRight className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-transform ${selectedStudent?.id === student.id ? 'rotate-90 text-white' : 'text-slate-300'}`} />
                      </button>
                    )) : (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 text-xs font-bold uppercase">No students found</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="p-12 text-center bg-slate-50 rounded-[28px] border-2 border-dashed border-slate-200">
                  <GraduationCap className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-[10px] font-black uppercase leading-tight">Selection Required to<br/>Generate Records</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Report Card Preview */}
        <div className="md:col-span-9">
          <AnimatePresence mode="wait">
            {fetchingResults ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-[32px] shadow-xl border border-slate-100 h-[800px] flex flex-col items-center justify-center space-y-4"
              >
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Reconstructing Dataset...</p>
              </motion.div>
            ) : selectedStudent ? (
              <motion.div 
                key={selectedStudent.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8"
              >
                {/* Visual Impact Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-white p-6 rounded-[32px] shadow-lg shadow-slate-100 border border-slate-50 flex items-center gap-4">
                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Trophy className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Current Rank</div>
                      <div className="text-2xl font-black text-slate-900">{calculatePosition().rank}</div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] shadow-lg shadow-slate-100 border border-slate-50 flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Avg. Score</div>
                      <div className="text-2xl font-black text-slate-900">{calculateAverage()}%</div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] shadow-lg shadow-slate-100 border border-slate-50 flex items-center gap-4">
                    <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                      <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Subjects</div>
                      <div className="text-2xl font-black text-slate-900">{results.length}</div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-[32px] shadow-lg shadow-slate-100 border border-slate-50 flex items-center gap-4">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                      <Calendar className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Attendance</div>
                      <div className="text-2xl font-black text-slate-900">
                        {Math.round((attendanceStats.present / (attendanceStats.total || 1)) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden print:shadow-none print:rounded-none transition-all">
                  <div className="p-5 bg-slate-900 flex justify-between items-center print:hidden">
                    <div className="flex items-center gap-4">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-amber-400" />
                        <div className="w-3 h-3 rounded-full bg-emerald-400" />
                      </div>
                      <span className="h-4 w-px bg-slate-700" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                        Document View: {activeReport === 'terminal' ? 'Terminal Assessment' : 'Annual Performance'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-white font-mono text-[9px] uppercase tracking-widest opacity-50">
                      {selectedStudent.admission_number} • {new Date().toLocaleTimeString()}
                    </div>
                  </div>
                  
                  <div className="p-0 overflow-x-auto bg-slate-50">
                    {/* Printable Area */}
                    <div ref={reportRef} id="printable-report" className="min-w-[900px] bg-white mx-auto print:m-0 print:p-0">
                      {activeReport === 'terminal' ? (
                        <>
                          <div className="p-12 relative overflow-hidden">
                        {settings?.school_logo_url ? (
                          <img 
                            src={settings.school_logo_url} 
                            alt="Watermark" 
                            className="w-[450px] h-[450px] object-contain opacity-[0.05]" 
                          />
                        ) : (
                          <GraduationCap className="w-[500px] h-[500px] rotate-[-30deg] opacity-[0.03]" />
                        )}
                      </div>

                      {/* Header */}
                      <div className="flex items-center justify-between pb-8 mb-10 relative z-10">
                        <div className="flex items-center gap-8">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-28 h-28 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-slate-900 rounded-[28px] flex items-center justify-center shadow-2xl">
                              <GraduationCap className="w-14 h-14 text-white" />
                            </div>
                          )}
                          <div>
                            <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none font-serif">{settings?.school_name}</h1>
                            <p className="text-blue-600 font-bold italic text-lg mt-1 tracking-tight">{settings?.school_motto}</p>
                            <div className="mt-4 flex gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              <span className="bg-slate-900 text-white px-3 py-1 rounded-sm">{settings?.current_term} Term Assessment</span>
                              <span className="bg-blue-600 text-white px-3 py-1 rounded-sm">{settings?.current_session} Academic Year</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="text-7xl font-black text-slate-100 uppercase tracking-tighter leading-none select-none">Record</div>
                          <div className="bg-slate-900 text-white px-4 py-2 mt-[-20px] rounded-sm relative z-10">
                            <span className="font-mono text-xs font-bold uppercase tracking-widest">{selectedStudent.admission_number}</span>
                          </div>
                        </div>
                      </div>

                      {/* Student Info Highlight */}
                      <div className="grid grid-cols-5 gap-6 mb-12 relative z-10">
                        <div className="col-span-2 bg-[#F8F9FA] p-6 rounded-[32px] border border-slate-100 flex items-center gap-4">
                          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-400">
                             <User className="w-8 h-8" />
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Student Identity</div>
                            <div className="text-2xl font-black text-slate-900 tracking-tight">{selectedStudent.first_name} {selectedStudent.last_name}</div>
                          </div>
                        </div>
                        <div className="bg-[#F8F9FA] p-6 rounded-[32px] border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> Class
                          </div>
                          <div className="text-xl font-black text-slate-900">{classes.find(c => c.id === parseInt(selectedClass))?.class_name}</div>
                        </div>
                        <div className="bg-[#F8F9FA] p-6 rounded-[32px] border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Rank
                          </div>
                          <div className="text-xl font-black text-blue-600">
                            {calculatePosition().rank} <span className="text-[10px] text-slate-400 uppercase">/ {calculatePosition().total}</span>
                          </div>
                        </div>
                        <div className="bg-blue-600 p-6 rounded-[32px] shadow-2xl shadow-blue-200 flex flex-col justify-center items-center overflow-hidden relative">
                          <div className="absolute top-[-10px] right-[-10px] opacity-10">
                            <Award className="w-24 h-24 text-white" />
                          </div>
                          <div className="text-[10px] font-black text-blue-100 uppercase tracking-[0.2em] mb-1 relative z-10 text-center">AVERAGE</div>
                          <div className="text-4xl font-black text-white relative z-10">{calculateAverage()}%</div>
                        </div>
                      </div>

                      {/* Performance Visualizations */}
                      <div className="grid grid-cols-2 gap-8 mb-12 print:hidden">
                        <div className="bg-[#151619] p-8 rounded-[40px] shadow-2xl">
                           <div className="flex items-center justify-between mb-8">
                             <div className="flex items-center gap-3">
                               <BarChartIcon className="w-6 h-6 text-blue-400" />
                               <span className="text-xs font-black text-white uppercase tracking-[0.2em]">Subject Proficiency</span>
                             </div>
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Scale 0-100</span>
                           </div>
                           <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={results}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#2D2E32" vertical={false} />
                                  <XAxis 
                                    dataKey="subject_name" 
                                    tick={{ fill: '#8E9299', fontSize: 9, fontWeight: 700 }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    angle={-20}
                                    textAnchor="end"
                                  />
                                  <YAxis 
                                    tick={{ fill: '#8E9299', fontSize: 10 }} 
                                    axisLine={false}
                                    tickLine={false}
                                    domain={[0, 100]}
                                  />
                                  <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#151619', borderColor: '#2D2E32', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                  />
                                  <Bar dataKey="total_score" radius={[4, 4, 0, 0]} barSize={25}>
                                    {results.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>

                        <div className="bg-[#151619] p-8 rounded-[40px] shadow-2xl">
                           <div className="flex items-center justify-between mb-8">
                             <div className="flex items-center gap-3">
                               <PieChartIcon className="w-6 h-6 text-rose-400" />
                               <span className="text-xs font-black text-white uppercase tracking-[0.2em]">Skill Fingerprint</span>
                             </div>
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Behavioral Vector</span>
                           </div>
                           <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={psychomotorData}>
                                  <PolarGrid stroke="#2D2E32" />
                                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#8E9299', fontSize: 8, fontWeight: 700 }} />
                                  <Radar
                                    name="Skills"
                                    dataKey="A"
                                    stroke="#E11D48"
                                    fill="#E11D48"
                                    fillOpacity={0.6}
                                  />
                                </RadarChart>
                              </ResponsiveContainer>
                           </div>
                        </div>
                      </div>

                      <div className="flex gap-12 relative z-10">
                        {/* Left Side: Skills & Domain */}
                        <div className="w-80 space-y-8">
                          <div className="bg-slate-900 rounded-[32px] overflow-hidden shadow-xl">
                            <div className="bg-slate-800 px-6 py-4 flex items-center gap-3">
                              <Activity className="w-4 h-4 text-blue-400" />
                              <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Psychomotor Index</span>
                            </div>
                            <div className="p-6 space-y-4">
                              {[
                                { key: 'handwriting', label: 'Handwriting' },
                                { key: 'fluency', label: 'Fluency' },
                                { key: 'games', label: 'Games' },
                                { key: 'sports', label: 'Sports' },
                                { key: 'gymnastics', label: 'Gymnastics' },
                                { key: 'handling_tools', label: 'Tool Handling' },
                                { key: 'drawing_painting', label: 'Creative Arts' },
                                { key: 'crafts', label: 'Craft Skills' },
                                { key: 'musical_skills', label: 'Music Theory' },
                              ].map(skill => (
                                <div key={skill.key} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{skill.label}</span>
                                    <span className="text-[10px] font-bold text-blue-400">{psychomotor?.[skill.key] || 0}/5</span>
                                  </div>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-blue-600' : 'bg-slate-800'
                                      }`} />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-slate-900 rounded-[32px] overflow-hidden shadow-xl">
                            <div className="bg-slate-800 px-6 py-4 flex items-center gap-3">
                              <Heart className="w-4 h-4 text-rose-400" />
                              <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Affective Profile</span>
                            </div>
                            <div className="p-6 space-y-4">
                              {[
                                { key: 'punctuality', label: 'Punctuality' },
                                { key: 'neatness', label: 'Neatness' },
                                { key: 'politeness', label: 'Politeness' },
                                { key: 'honesty', label: 'Moral Integrity' },
                                { key: 'relationship_with_others', label: 'Social Dynamics' },
                                { key: 'leadership', label: 'Leadership' },
                                { key: 'emotional_stability', label: 'Resilience' },
                                { key: 'health', label: 'Wellness' },
                                { key: 'self_control', label: 'Discipline' },
                                { key: 'attentiveness', label: 'Focus' },
                                { key: 'perseverance', label: 'Persistance' },
                              ].map(skill => (
                                <div key={skill.key} className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{skill.label}</span>
                                    <span className="text-[10px] font-bold text-rose-400">{psychomotor?.[skill.key] || 0}/5</span>
                                  </div>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-rose-600' : 'bg-slate-800'
                                      }`} />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Detailed Grades Table */}
                        <div className="flex-1 space-y-8">
                          <div className="bg-white border-2 border-slate-900 rounded-[40px] overflow-hidden shadow-2xl">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="bg-slate-900 text-white">
                                  <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-[0.3em]">Academic Module</th>
                                  <th className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-widest border-l border-slate-800">CA (40)</th>
                                  <th className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-widest border-l border-slate-800">Exam (60)</th>
                                  <th className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-widest border-l border-slate-800 font-mono">Total</th>
                                  <th className="px-3 py-5 text-center text-[10px] font-black uppercase tracking-widest border-l border-slate-800 font-mono">Rank</th>
                                  <th className="px-6 py-5 text-center text-[10px] font-black uppercase tracking-widest border-l border-slate-800">Grade</th>
                                </tr>
                              </thead>
                              <tbody className="text-sm">
                                {results.map((r, idx) => {
                                  const total = r.total_score;
                                  let grade = '-';
                                  let color = 'text-slate-200';
                                  let bgColor = 'bg-slate-50';
                                  let pos = '-';
                                  
                                  if (r.has_result) {
                                    if (total >= 70) { grade = 'A'; color = 'text-white'; bgColor = 'bg-emerald-600 shadow-emerald-100'; }
                                    else if (total >= 60) { grade = 'B'; color = 'text-white'; bgColor = 'bg-blue-600 shadow-blue-100'; }
                                    else if (total >= 50) { grade = 'C'; color = 'text-white'; bgColor = 'bg-amber-500 shadow-amber-100'; }
                                    else if (total >= 45) { grade = 'D'; color = 'text-white'; bgColor = 'bg-orange-500 shadow-orange-100'; }
                                    else if (total >= 40) { grade = 'E'; color = 'text-white'; bgColor = 'bg-rose-400 shadow-rose-100'; }
                                    else { grade = 'F'; color = 'text-white'; bgColor = 'bg-red-700 shadow-red-200'; }
                                    
                                    pos = calculateSubjectPosition(r.subject_id, total);
                                  }

                                  return (
                                    <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} group hover:bg-slate-100/50 transition-colors`}>
                                      <td className="px-6 py-5 border-b border-slate-100">
                                        <div className="font-bold text-slate-900 text-base">{r.subject_name}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{getRemark(total)}</div>
                                      </td>
                                      <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono font-bold text-slate-600">
                                        {r.has_result ? (r.ca1_score + r.ca2_score) : '-'}
                                      </td>
                                      <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono font-bold text-slate-600">
                                        {r.has_result ? r.exam_score : '-'}
                                      </td>
                                      <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-black text-lg text-slate-900">
                                        {r.has_result ? total : '-'}
                                      </td>
                                      <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono text-[10px] font-black text-blue-600 bg-blue-50/30">
                                        {pos}
                                      </td>
                                      <td className="px-6 py-5 border-b border-slate-100 border-l text-center">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg mx-auto shadow-lg transition-transform group-hover:scale-110 ${bgColor} ${color}`}>
                                          {grade}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-900 text-white">
                                  <td className="px-6 py-5 font-black uppercase text-xs tracking-[0.3em] font-mono">Aggregate Load</td>
                                  <td colSpan={2} className="border-l border-slate-800"></td>
                                  <td className="px-3 py-5 text-center font-black text-2xl font-mono border-l border-slate-800">{calculateTotal()}</td>
                                  <td colSpan={2} className="border-l border-slate-800 italic text-[10px] text-slate-500 font-bold px-6">SCORING SYSTEM RELIABILITY: 99.8%</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Remarks with Visual Hierarchy */}
                          <div className="grid grid-cols-2 gap-8">
                            <div className="relative">
                               <div className="absolute -top-3 left-6 flex items-center gap-2 bg-white px-3 py-1 rounded-full border-2 border-slate-900 z-10">
                                 <MessageSquare className="w-3 h-3 text-blue-600" />
                                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Instructor Evaluation</span>
                               </div>
                               <div className="p-10 pt-12 bg-[#F8F9FA] rounded-[40px] border-2 border-slate-200">
                                  <p className="text-sm text-slate-700 leading-relaxed font-serif italic text-center">
                                    "{psychomotor?.teacher_remark || 'Educational progress is within expected parameters for this assessment cycle.'}"
                                  </p>
                                  <div className="mt-8 flex flex-col items-center">
                                    <div className="w-32 border-b border-slate-900 py-1" />
                                    <span className="text-[9px] font-black text-slate-400 uppercase mt-2">Class Teacher</span>
                                  </div>
                               </div>
                            </div>
                            <div className="relative">
                               <div className="absolute -top-3 left-6 flex items-center gap-2 bg-white px-3 py-1 rounded-full border-2 border-slate-900 z-10">
                                 <GraduationCap className="w-3 h-3 text-emerald-600" />
                                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Director's Directive</span>
                               </div>
                               <div className="p-10 pt-12 bg-[#F8F9FA] rounded-[40px] border-2 border-slate-200">
                                  <p className="text-sm text-slate-700 leading-relaxed font-serif italic text-center">
                                    "{psychomotor?.principal_remark || 'We remain committed to the intellectual development of our students.'}"
                                  </p>
                                  <div className="mt-8 flex flex-col items-center">
                                    <div className="h-10 flex items-center justify-center -mt-6 mb-2">
                                      {settings?.principal_signature_url && (
                                        <img src={settings.principal_signature_url} alt="Signature" className="h-10 object-contain mix-blend-multiply" />
                                      )}
                                    </div>
                                    <div className="w-32 border-b border-slate-900 py-1" />
                                    <span className="text-[9px] font-black text-slate-400 uppercase mt-2">Executive Principal</span>
                                  </div>
                               </div>
                            </div>
                          </div>

                          {/* Technical Footer */}
                          <div className="flex justify-between items-end pt-12 px-6 border-t-2 border-slate-100 text-slate-400">
                            <div className="space-y-4">
                               <div className="flex items-center gap-6">
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase text-slate-300">Issue Date</span>
                                    <span className="text-xs font-mono font-bold text-slate-900">{new Date().toLocaleDateString()}</span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-black uppercase text-slate-300">Next Term Begins</span>
                                    <input 
                                      type="text"
                                      value={nextTermBegins}
                                      onChange={(e) => updateNextTermBegins(e.target.value)}
                                      className="text-xs font-mono font-black text-blue-600 bg-transparent border-none outline-none p-0 w-32"
                                      placeholder="05/09/2026"
                                    />
                                  </div>
                               </div>
                               <div className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-200">Verified Academic Record • Bright Future Academy</div>
                            </div>
                            <div className="text-right">
                               <div className="flex items-center justify-end gap-2 mb-1">
                                 <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                                 <span className="text-[10px] font-black text-slate-900 uppercase">Live Database Sync Active</span>
                               </div>
                               <span className="text-[8px] font-bold text-slate-400 opacity-50 font-mono tracking-tighter">HASH: {selectedStudent.id}-{new Date().getTime().toString(16).toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-12 relative overflow-hidden">
                      <div className="relative z-10">
                      {/* Watermark for Cumulative */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden -z-10">
                        {settings?.school_logo_url ? (
                          <img 
                            src={settings.school_logo_url} 
                            alt="Watermark" 
                            className="w-[450px] h-[450px] object-contain opacity-[0.04]" 
                          />
                        ) : (
                          <TrendingUp className="w-[500px] h-[500px] rotate-[-30deg] opacity-[0.02]" />
                        )}
                      </div>

                      {/* Header for Cumulative */}
                      <div className="flex items-center justify-between pb-8 mb-10">
                        <div className="flex items-center gap-8">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-28 h-28 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-emerald-600 rounded-[28px] flex items-center justify-center shadow-2xl">
                              <TrendingUp className="w-14 h-14 text-white" />
                            </div>
                          )}
                          <div>
                            <h1 className="text-5xl font-black text-slate-900 uppercase tracking-tighter leading-none font-serif">{settings?.school_name}</h1>
                            <p className="text-emerald-600 font-bold italic text-lg mt-1 tracking-tight">{settings?.school_motto}</p>
                            <div className="mt-4 flex gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              <span className="bg-emerald-600 text-white px-3 py-1 rounded-sm">Annual Session Summary</span>
                              <span className="bg-slate-900 text-white px-3 py-1 rounded-sm">{settings?.current_session} Academic Cycle</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="text-7xl font-black text-slate-100 uppercase tracking-tighter leading-none select-none">Annual</div>
                          <div className="bg-emerald-600 text-white px-4 py-2 mt-[-20px] rounded-sm relative z-10">
                            <span className="font-mono text-xs font-bold uppercase tracking-widest">{selectedStudent.admission_number}</span>
                          </div>
                        </div>
                      </div>

                      {/* Cumulative High-Impact Stats */}
                      <div className="grid grid-cols-4 gap-6 mb-12">
                        <div className="bg-[#F8F9FA] p-6 rounded-[32px] border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Student Identity</div>
                            <div className="text-xl font-black text-slate-900 truncate">{selectedStudent.first_name} {selectedStudent.last_name}</div>
                        </div>
                        <div className="bg-[#F8F9FA] p-6 rounded-[32px] border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Level / Class</div>
                            <div className="text-xl font-black text-slate-900">{classes.find(c => c.id === parseInt(selectedClass || '0'))?.class_name}</div>
                        </div>
                        <div className="bg-emerald-600 p-6 rounded-[32px] shadow-2xl shadow-emerald-200">
                            <div className="text-[10px] font-black text-emerald-100 uppercase tracking-widest mb-1">Session Avg</div>
                            <div className="text-3xl font-black text-white">{calculateCumulativeAverage()}%</div>
                        </div>
                        <div className="bg-slate-900 p-6 rounded-[32px] shadow-2xl shadow-slate-200 flex flex-col justify-center">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Promotion Status</div>
                            <div className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                              {parseFloat(calculateCumulativeAverage()) >= 45 ? (
                                <>
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  Promoted
                                </>
                              ) : 'Decision Pending'}
                            </div>
                        </div>
                      </div>

                      {/* Unified Session Performance Chart */}
                      <div className="mb-12 bg-[#151619] p-10 rounded-[48px] shadow-2xl print:hidden">
                         <div className="flex items-center gap-3 mb-8">
                            <TrendingUp className="w-6 h-6 text-emerald-400" />
                            <span className="text-xs font-black text-white uppercase tracking-[0.3em]">Session Progress Distribution</span>
                         </div>
                         <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={cumulativeResults}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2D2E32" vertical={false} />
                                <XAxis 
                                  dataKey="subject_name" 
                                  tick={{ fill: '#8E9299', fontSize: 10, fontWeight: 700 }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis 
                                  tick={{ fill: '#8E9299', fontSize: 10 }} 
                                  axisLine={false}
                                  tickLine={false}
                                  domain={[0, 100]}
                                />
                                <Tooltip 
                                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                  contentStyle={{ backgroundColor: '#151619', borderColor: '#2D2E32', borderRadius: '16px', border: '1px solid #444' }}
                                />
                                <Bar dataKey="first_term" name="T1 (30%)" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="second_term" name="T2 (30%)" fill="#10B981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="third_term" name="T3 (40%)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="cumulative" name="Session Final" fill="#EC4899" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                         </div>
                      </div>

                      {/* Cumulative Table */}
                      <div className="border-2 border-slate-900 rounded-[40px] overflow-hidden shadow-2xl mb-12">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest text-center">
                              <th className="px-8 py-5 text-left tracking-[0.3em]">Subject Module</th>
                              <th className="px-3 py-5 border-l border-slate-800">1st (30%)</th>
                              <th className="px-3 py-5 border-l border-slate-800">2nd (30%)</th>
                              <th className="px-3 py-5 border-l border-slate-800">3rd (40%)</th>
                              <th className="px-6 py-5 border-l border-slate-800 bg-emerald-700">Cumulative Load / 100</th>
                              <th className="px-6 py-5 border-l border-slate-800 font-mono italic">Verdict</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {cumulativeResults.map((r, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50 hover:bg-slate-100/50 transition-colors'}>
                                <td className="px-8 py-5 border-b border-slate-100 font-black text-slate-900 uppercase tracking-tight text-base">{r.subject_name}</td>
                                <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono font-bold text-slate-500">{r.first_term || '-'}</td>
                                <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono font-bold text-slate-500">{r.second_term || '-'}</td>
                                <td className="px-3 py-5 border-b border-slate-100 border-l text-center font-mono font-bold text-slate-500">{r.third_term || '-'}</td>
                                <td className="px-6 py-5 border-b border-slate-100 border-l text-center font-black text-emerald-600 text-xl font-mono">{r.cumulative.toFixed(1)}</td>
                                <td className="px-6 py-5 border-b border-slate-100 border-l text-center">
                                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest inline-block ${
                                    r.cumulative >= 45 ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'
                                  }`}>
                                    {getRemark(r.cumulative)}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-900 text-white">
                              <td className="px-8 py-6 font-black uppercase text-xs tracking-[0.4em] font-mono">Session Weighted Average</td>
                              <td colSpan={3} className="border-l border-slate-800"></td>
                              <td className="px-6 py-6 text-center font-black text-3xl border-l border-slate-800 text-emerald-400 font-mono tracking-tighter">{calculateCumulativeAverage()}%</td>
                              <td className="border-l border-slate-800 italic text-[10px] text-slate-500 px-6">WEIGHTED RATIO: 3:3:4</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Footer for Cumulative */}
                      <div className="grid grid-cols-2 gap-12 mt-12 px-4 shadow-inner pt-8">
                        <div className="space-y-6">
                          <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl">
                            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Annual Certification</div>
                            <p className="text-[11px] text-emerald-900 leading-relaxed font-bold italic">
                              This cumulative performance record summarizes the student's academic standing for the entire {settings?.current_session} session. It serves as an official confirmation of eligibility for promotion.
                            </p>
                          </div>
                          <div className="w-40 h-40 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center text-slate-200 text-[10px] font-black uppercase tracking-widest">
                            Official School Seal
                          </div>
                        </div>
                        <div className="flex flex-col justify-end space-y-12">
                          <div className="text-center">
                            <div className="h-12 flex items-center justify-center mb-1">
                              {settings?.principal_signature_url && (
                                <img src={settings.principal_signature_url} alt="Signature" className="h-12 object-contain" />
                              )}
                            </div>
                            <div className="w-full border-b-2 border-slate-900 mb-2"></div>
                            <div className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Principal / Head of School</div>
                            <div className="text-[10px] font-bold text-slate-400">Signature & Date</div>
                          </div>
                          <div className="text-right text-[8px] font-bold text-slate-300 uppercase tracking-widest">
                            Annual Summary Generated on {new Date().toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
               <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 h-[800px] flex flex-col items-center justify-center text-slate-400 space-y-6">
                <div className="w-24 h-24 bg-slate-50 rounded-[32px] flex items-center justify-center shadow-inner">
                  <BookOpen className="w-12 h-12 text-slate-300" />
                </div>
                <div className="text-center space-y-2">
                  <p className="font-black text-slate-900 uppercase tracking-widest">Repository Standing By</p>
                  <p className="text-xs font-medium max-w-[250px] mx-auto text-slate-400">Select a student from the sidebar to visualize their academic journey.</p>
                </div>
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="pt-4"
                >
                  <ChevronRight className="w-6 h-6 text-blue-200 -rotate-90" />
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
