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
  ChevronRight
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

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
  const [activeReport, setActiveReport] = useState<'terminal' | 'annual'>('terminal');
  const [loading, setLoading] = useState(true);
  const [fetchingResults, setFetchingResults] = useState(false);
  
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
    setCumulativeResults([]);
    setPsychomotor(null);
    
    if (!classId) return;

    try {
      let query = supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('last_name');

      const { data: studentsData, error: studentsError } = await query;
      if (studentsError) throw studentsError;
      setStudents(studentsData || []);

      // Fetch subjects assigned to this class with fallbacks
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

      // Fallback: If no subjects in class_subjects, fetch all subjects
      if (subjectsForClass.length === 0) {
        console.log('Results: No subjects linked to class, fetching all subjects as fallback');
        const { data: allSubjectsData } = await supabase.from('subjects').select('*').order('subject_name');
        subjectsForClass = allSubjectsData || [];
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
        const total_score = result ? (Number(result.ca1_score || 0) + Number(result.ca2_score || 0) + Number(result.exam_score || 0)) : 0;
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

            const firstTermScore = firstTerm ? (Number(firstTerm.ca1_score || 0) + Number(firstTerm.ca2_score || 0) + Number(firstTerm.exam_score || 0)) : 0;
            const secondTermScore = secondTerm ? (Number(secondTerm.ca1_score || 0) + Number(secondTerm.ca2_score || 0) + Number(secondTerm.exam_score || 0)) : 0;
            const thirdTermScore = thirdTerm ? (Number(thirdTerm.ca1_score || 0) + Number(thirdTerm.ca2_score || 0) + Number(thirdTerm.exam_score || 0)) : 0;

          // Mapping scores to match table structure from sample (Assessment/Final/Total)
          // For cumulative representation we use simple totals per term
          const cumulativeTotal = (firstTermScore + secondTermScore + thirdTermScore) / 3;

          return {
            subject_id: subject.id,
            subject_name: subject.subject_name,
            first_term: {
              ca: firstTerm ? (firstTerm.ca1_score + firstTerm.ca2_score) : 0,
              exam: firstTerm?.exam_score || 0,
              total: firstTermScore
            },
            second_term: {
              ca: secondTerm ? (secondTerm.ca1_score + secondTerm.ca2_score) : 0,
              exam: secondTerm?.exam_score || 0,
              total: secondTermScore
            },
            third_term: {
              ca: thirdTerm ? (thirdTerm.ca1_score + thirdTerm.ca2_score) : 0,
              exam: thirdTerm?.exam_score || 0,
              total: thirdTermScore
            },
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
    return (calculateTotal() / subjectsWithResults.length).toFixed(1);
  };

  const calculateAnnualAverage = () => {
    if (cumulativeResults.length === 0) return '0.0';
    const total = cumulativeResults.reduce((acc, curr) => acc + curr.cumulative, 0);
    return (total / cumulativeResults.length).toFixed(1);
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
            Academic Results
          </h1>
          <p className="text-slate-500 font-medium mt-1">Manage and generate student academic report cards.</p>
        </div>
        {selectedStudent && (
          <div className="flex items-center gap-3">
             {settings?.current_term?.toLowerCase().includes('3rd') && (
               <div className="flex bg-slate-100 p-1 rounded-2xl">
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
              className={`flex items-center gap-2 px-8 py-3 text-white rounded-2xl shadow-xl transition-all font-bold uppercase tracking-tight text-sm hover:scale-[1.02] active:scale-95 ${
                activeReport === 'annual' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-50' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-50'
              }`}
            >
              <Printer className="w-5 h-5" />
              Print Report Card
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

                <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden print:shadow-none print:rounded-none">
                  <div className="p-0 overflow-x-auto">
                    {/* Printable Area */}
                    <div ref={reportRef} id="printable-report" className="min-w-[900px] bg-white mx-auto print:m-0 print:p-0 font-serif">
                      <div className="p-8 relative border-8 border-double border-slate-200">
                        {/* Header Section */}
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex-1">
                            {settings?.school_logo_url ? (
                              <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                            ) : (
                              <div className="w-20 h-20 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                                <GraduationCap className="w-10 h-10" />
                              </div>
                            )}
                          </div>
                          <div className="flex-[3] text-center space-y-1">
                            <h1 className="text-4xl font-black text-blue-600 uppercase tracking-tight">{settings?.school_name}</h1>
                            <p className="text-[10px] font-bold text-slate-600">{settings?.school_address}</p>
                            <p className="text-[10px] font-bold text-slate-600 italic uppercase tracking-wider">{settings?.school_motto}</p>
                            <div className="inline-block bg-blue-600 text-white px-8 py-1 rounded-full text-sm font-black uppercase tracking-[0.2em] mt-2">
                               Report Card
                            </div>
                          </div>
                          <div className="flex-1">
                             {/* Empty for balance */}
                          </div>
                        </div>

                        {/* Session Info */}
                        <div className="text-center mb-6 relative">
                           <span className="text-lg font-black text-slate-800 uppercase tracking-widest relative z-10 bg-white px-4">
                             {settings?.current_term} Term {settings?.current_session} Session
                           </span>
                           <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200 -z-0" />
                        </div>

                        {/* Student Profile Grid */}
                        <div className="grid grid-cols-2 gap-x-12 gap-y-4 mb-8 text-sm">
                           {[
                             { label: "Student's Name", value: `${selectedStudent.first_name} ${selectedStudent.last_name}` },
                             { label: "Admission No", value: selectedStudent.admission_number },
                             { label: "Class", value: `${classes.find(c => c.id === parseInt(selectedClass))?.class_name || 'N/A'}` },
                             { label: "Position", value: `${calculatePosition().rank} Out of ${calculatePosition().total}` },
                             { label: "Attendance", value: `${psychomotor?.total_days > 0 ? psychomotor.days_present : attendanceStats.present} / ${psychomotor?.total_days > 0 ? psychomotor.total_days : attendanceStats.total} days present` },
                             { label: "Next Term Begins", value: nextTermBegins || '---' },
                           ].map((item, idx) => (
                             <div key={idx} className="flex items-end gap-2">
                                <span className="text-[11px] font-black text-slate-700 uppercase whitespace-nowrap">{item.label} :</span>
                                <span className="flex-1 border-b-2 border-dotted border-slate-300 text-blue-700 font-bold px-2 truncate min-w-[50px]">{item.value}</span>
                             </div>
                           ))}
                        </div>

                        <div className="flex gap-6 items-start mb-8">
                          {/* Left Column: Domains & Skills */}
                          <div className="w-[250px] space-y-6">
                             {/* Psychomotor Skills */}
                             <div className="border border-slate-900">
                                <div className="bg-slate-900 text-white text-[9px] font-black uppercase py-1 px-2 text-center">
                                   Psychomotor Skills (1-5)
                                </div>
                                <table className="w-full text-center border-collapse">
                                   <tbody className="text-[9px] font-bold">
                                      {[
                                        { key: 'handwriting', label: 'Handwriting' },
                                        { key: 'fluency', label: 'Fluency' },
                                        { key: 'games', label: 'Games' },
                                        { key: 'sports', label: 'Sports' },
                                        { key: 'gymnastics', label: 'Gymnastics' },
                                        { key: 'handling_tools', label: 'Handling Tools' },
                                        { key: 'drawing_painting', label: 'Drawing' },
                                        { key: 'crafts', label: 'Crafts' },
                                        { key: 'musical_skills', label: 'Musical' },
                                      ].map(item => (
                                         <tr key={item.key} className="border-b border-slate-300">
                                            <td className="text-left px-2 border-r border-slate-900 py-0.5">{item.label}</td>
                                            <td className="font-black text-blue-700 w-8">{psychomotor?.[item.key] || '-'}</td>
                                         </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>

                             {/* Affective Domain */}
                             <div className="border border-slate-900">
                                <div className="bg-slate-900 text-white text-[9px] font-black uppercase py-1 px-2 text-center">
                                   Affective Domain (1-5)
                                </div>
                                <table className="w-full text-center border-collapse">
                                   <tbody className="text-[9px] font-bold">
                                      {[
                                        { key: 'punctuality', label: 'Punctuality' },
                                        { key: 'neatness', label: 'Neatness' },
                                        { key: 'politeness', label: 'Politeness' },
                                        { key: 'honesty', label: 'Honesty' },
                                        { key: 'relationship_with_others', label: 'Relationship' },
                                        { key: 'leadership', label: 'Leadership' },
                                        { key: 'emotional_stability', label: 'Stability' },
                                        { key: 'health', label: 'Health' },
                                        { key: 'self_control', label: 'Discipline' },
                                        { key: 'attentiveness', label: 'Attentiveness' },
                                        { key: 'perseverance', label: 'Perseverance' },
                                      ].map(item => (
                                         <tr key={item.key} className="border-b border-slate-300">
                                            <td className="text-left px-2 border-r border-slate-900 py-0.5">{item.label}</td>
                                            <td className="font-black text-blue-700 w-8">{psychomotor?.[item.key] || '-'}</td>
                                         </tr>
                                      ))}
                                   </tbody>
                                </table>
                             </div>
                          </div>

                          {/* Right Column: Academic Results */}
                          <div className="flex-1 space-y-6">
                            {activeReport === 'terminal' ? (
                              <>
                                {/* Terminal Scholastic Table */}
                                <div>
                                   <table className="w-full border-2 border-slate-900 text-center">
                                      <thead>
                                         <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-700">
                                            <th className="border-2 border-slate-900 py-2 px-4 text-left">Scholastic Subject</th>
                                            <th className="border-2 border-slate-900 py-2">CA 1 (20)</th>
                                            <th className="border-2 border-slate-900 py-2">CA 2 (20)</th>
                                            <th className="border-2 border-slate-900 py-2">Exam (60)</th>
                                            <th className="border-2 border-slate-900 py-2 bg-slate-200">Total (100)</th>
                                            <th className="border-2 border-slate-900 py-2">Rank</th>
                                            <th className="border-2 border-slate-900 py-2">Grade</th>
                                            <th className="border-2 border-slate-900 py-2">Remarks</th>
                                         </tr>
                                      </thead>
                                      <tbody className="text-sm font-bold">
                                         {results.map((r, idx) => (
                                             <tr key={idx}>
                                               <td className="border-2 border-slate-900 py-2 px-4 text-left font-black text-slate-900 text-base">{r.subject_name}</td>
                                               <td className="border-2 border-slate-900 py-2">{r.ca1_score}</td>
                                               <td className="border-2 border-slate-900 py-2">{r.ca2_score}</td>
                                               <td className="border-2 border-slate-900 py-2">{r.exam_score}</td>
                                               <td className="border-2 border-slate-900 py-2 font-black text-blue-700 bg-slate-50 text-base">{r.total_score}</td>
                                               <td className="border-2 border-slate-900 py-2 text-[10px] font-black">{calculateSubjectPosition(r.subject_id, r.total_score)}</td>
                                               <td className="border-2 border-slate-900 py-2 font-black text-blue-700 text-base">
                                                  {r.total_score >= 75 ? 'A' : r.total_score >= 65 ? 'B' : r.total_score >= 55 ? 'C' : r.total_score >= 50 ? 'D' : r.total_score >= 45 ? 'E' : 'F'}
                                               </td>
                                               <td className="border-2 border-slate-900 py-2 text-[9px] uppercase font-black text-slate-500">{getRemark(r.total_score)}</td>
                                            </tr>
                                         ))}
                                      </tbody>
                                   </table>
                                   <div className="bg-slate-900 text-white flex justify-between px-6 py-2 text-xs font-black uppercase tracking-widest mt-px">
                                      <span>Total Marks: {calculateTotal()}</span>
                                      <span>Average: {calculateAverage()}%</span>
                                   </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Annual/Cumulative Scholastic Matrix */}
                                 <div>
                                   <table className="w-full border-2 border-slate-900 text-center border-collapse">
                                      <thead>
                                         <tr className="bg-slate-100 text-[9px] font-black uppercase text-slate-700">
                                            <th rowSpan={2} className="border-2 border-slate-900 py-2 px-4 text-left">Subject</th>
                                            <th colSpan={3} className="border-2 border-slate-900 py-1 bg-blue-50 text-blue-600">1st Term</th>
                                            <th colSpan={3} className="border-2 border-slate-900 py-1 bg-slate-50 text-slate-600">2nd Term</th>
                                            <th colSpan={3} className="border-2 border-slate-900 py-1 bg-blue-600 text-white">3rd Term</th>
                                            <th rowSpan={2} className="border-2 border-slate-900 py-2 bg-slate-900 text-white">Annual Avg</th>
                                         </tr>
                                         <tr className="bg-slate-50 text-[8px] font-black uppercase text-slate-500">
                                            <th className="border border-slate-900 py-1 w-12">CA</th><th className="border border-slate-900 py-1 w-12">Exam</th><th className="border border-slate-900 py-1 w-12 bg-slate-100">Tot</th>
                                            <th className="border border-slate-900 py-1 w-12">CA</th><th className="border border-slate-900 py-1 w-12">Exam</th><th className="border border-slate-900 py-1 w-12 bg-slate-100">Tot</th>
                                            <th className="border border-slate-900 py-1 w-12">CA</th><th className="border border-slate-900 py-1 w-12">Exam</th><th className="border border-slate-900 py-1 w-12 bg-slate-100">Tot</th>
                                         </tr>
                                      </thead>
                                      <tbody className="text-[10px] font-bold">
                                         {cumulativeResults.map((r, idx) => (
                                            <tr key={idx}>
                                               <td className="border-2 border-slate-900 text-left px-3 py-1 font-black uppercase">{r.subject_name}</td>
                                               <td className="border border-slate-400">{r.first_term.ca || '-'}</td><td className="border border-slate-400">{r.first_term.exam || '-'}</td><td className="border-2 border-slate-900 bg-slate-50">{r.first_term.total || '-'}</td>
                                               <td className="border border-slate-400">{r.second_term.ca || '-'}</td><td className="border border-slate-400">{r.second_term.exam || '-'}</td><td className="border-2 border-slate-900 bg-slate-50">{r.second_term.total || '-'}</td>
                                               <td className="border border-slate-400">{r.third_term.ca || '-'}</td><td className="border border-slate-400">{r.third_term.exam || '-'}</td><td className="border-2 border-slate-900 bg-slate-50">{r.third_term.total || '-'}</td>
                                               <td className="border-2 border-slate-900 font-black text-blue-700 py-1">{r.cumulative.toFixed(1)}</td>
                                            </tr>
                                         ))}
                                      </tbody>
                                      <tfoot>
                                         <tr className="bg-slate-900 text-white font-black text-xs uppercase tracking-widest">
                                            <td colSpan={10} className="py-2 px-4 text-right">SESSIONAL PERFORMANCE INDEX</td>
                                            <td className="py-2">{calculateAnnualAverage()}%</td>
                                         </tr>
                                      </tfoot>
                                   </table>
                                </div>
                              </>
                            )}

                            {/* Grading Scale Info */}
                            <div className="bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest py-1 px-4 text-center">
                               Grading Scale {`{ A (75-100) Excellent, B (65-74) V. Good, C (55-64) Good, D (50-54) Pass, E (45-49) Fair, F (0-44) Fail }`}
                            </div>
                          </div>
                        </div>

                        {/* Footer & Feedback */}
                        <div className="space-y-6">
                           <div className="grid grid-cols-2 gap-8">
                             <div className="p-4 border-2 border-dotted border-slate-200">
                               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Teacher's Remarks</div>
                               <p className="text-sm text-slate-700 italic min-h-[60px] font-serif leading-relaxed">
                                 "{psychomotor?.teacher_remark || '---------------------------------------------------'}"
                               </p>
                             </div>
                             <div className="p-4 border-2 border-dotted border-slate-200">
                               <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Principal's Remarks</div>
                               <p className="text-sm text-slate-700 italic min-h-[60px] font-serif leading-relaxed">
                                 "{psychomotor?.principal_remark || '---------------------------------------------------'}"
                               </p>
                             </div>
                           </div>

                           <div className="pt-12 flex justify-between items-end border-t-2 border-slate-200">
                               <div className="text-center space-y-2">
                                  <div className="w-40 border-b-2 border-slate-900 mx-auto" />
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Class Teacher</span>
                               </div>
                               <div className="text-center space-y-2">
                                  <div className="text-[10px] font-black text-slate-900 uppercase mb-1">Date: {new Date().toLocaleDateString()}</div>
                                  <div className="w-40 border-b-2 border-slate-900 mx-auto" />
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">School Seal</span>
                               </div>
                               <div className="text-center space-y-2">
                                  <div className="h-10">
                                     {settings?.principal_signature_url && (
                                       <img src={settings.principal_signature_url} alt="Signature" className="h-10 object-contain mx-auto" />
                                     )}
                                  </div>
                                  <div className="w-40 border-b-2 border-slate-900 mx-auto" />
                                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Principal / Headmaster</span>
                               </div>
                           </div>
                        </div>
                      </div>
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
