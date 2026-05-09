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
  TrendingUp
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

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

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Student Report Cards</h1>
          <p className="text-slate-500">Generate and print terminal and annual academic summaries.</p>
        </div>
        {selectedStudent && (
          <div className="flex gap-2">
             {settings?.current_term?.toLowerCase().includes('3rd') && (
               <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
                 <button
                   onClick={() => setActiveReport('terminal')}
                   className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                     activeReport === 'terminal' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Terminal Report
                 </button>
                 <button
                   onClick={() => setActiveReport('annual')}
                   className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                     activeReport === 'annual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                   }`}
                 >
                   Annual Summary
                 </button>
               </div>
             )}
            <button 
              onClick={() => handlePrint()}
              className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl shadow-lg transition-all font-bold ${
                activeReport === 'annual' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              <Printer className="w-5 h-5" />
              Print {activeReport === 'terminal' ? 'Report Card' : 'Annual Summary'}
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Selection Panel */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select Class</label>
              <select
                value={selectedClass}
                onChange={(e) => fetchStudents(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Choose Class</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </select>
            </div>

            {selectedClass && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Select Student</label>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {students.map(student => (
                    <button
                      key={student.id}
                      onClick={() => fetchStudentResults(student)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                        selectedStudent?.id === student.id 
                          ? 'bg-blue-600 text-white shadow-md' 
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <div className="font-bold">{student.first_name} {student.last_name}</div>
                      <div className={`text-[10px] ${selectedStudent?.id === student.id ? 'text-blue-100' : 'text-slate-400'}`}>
                        {student.admission_number}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Report Card Preview */}
        <div className="md:col-span-3">
          {fetchingResults ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : selectedStudent ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                    {activeReport === 'terminal' ? 'Terminal Report Card' : 'Annual Summary Report'}
                  </span>
                  {activeReport === 'annual' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">3rd Term Exclusive</span>}
                </div>
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
              </div>
              
              <div className="p-8 overflow-x-auto">
                {/* Printable Area */}
                <div ref={reportRef} id="printable-report" className="min-w-[800px] bg-white p-10 relative print:p-0 print:shadow-none print:m-0">
                  {activeReport === 'terminal' ? (
                    <>
                      {/* Watermark */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
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
                      <div className="flex items-center justify-between border-b-4 border-blue-600 pb-6 mb-8 relative z-10">
                        <div className="flex items-center gap-6">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center">
                              <GraduationCap className="w-14 h-14 text-white" />
                            </div>
                          )}
                          <div>
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{settings?.school_name}</h1>
                            <p className="text-blue-600 font-bold italic">{settings?.school_motto}</p>
                            <div className="mt-2 flex gap-4 text-sm text-slate-600 font-bold">
                              <span className="bg-slate-100 px-3 py-1 rounded-full">{settings?.current_term} Term</span>
                              <span className="bg-slate-100 px-3 py-1 rounded-full">{settings?.current_session} Session</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-4xl font-black text-slate-200 uppercase tracking-tighter">Report Card</div>
                          <div className="text-slate-400 font-mono text-sm mt-1">ID: {selectedStudent.admission_number}</div>
                        </div>
                      </div>

                      {/* Student Info Grid */}
                      <div className="grid grid-cols-5 gap-4 mb-8 relative z-10">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> Name
                          </div>
                          <div className="font-bold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> Class
                          </div>
                          <div className="font-bold text-slate-900">{classes.find(c => c.id === parseInt(selectedClass))?.class_name}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Trophy className="w-3 h-3" /> Position
                          </div>
                          <div className="font-bold text-slate-900">
                            {calculatePosition().rank} <span className="text-[10px] text-slate-400 font-medium">out of {calculatePosition().total}</span>
                          </div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Attendance
                          </div>
                          <div className="font-bold text-slate-900">
                            {attendanceStats.present} / {attendanceStats.total} Days
                          </div>
                        </div>
                        <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200">
                          <div className="text-[10px] font-black text-blue-200 uppercase mb-1">Average</div>
                          <div className="text-2xl font-black text-white">{calculateAverage()}%</div>
                        </div>
                      </div>

                      <div className="flex gap-8 relative z-10">
                        {/* Left Side: Psychomotor & Affective */}
                        <div className="w-1/3 space-y-6">
                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-slate-900 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                              <Activity className="w-3 h-3" /> Psychomotor Skills
                            </div>
                            <div className="p-4 space-y-2">
                              {[
                                { key: 'handwriting', label: 'Handwriting' },
                                { key: 'fluency', label: 'Fluency' },
                                { key: 'games', label: 'Games' },
                                { key: 'sports', label: 'Sports' },
                                { key: 'gymnastics', label: 'Gymnastics' },
                                { key: 'handling_tools', label: 'Handling Tools' },
                                { key: 'drawing_painting', label: 'Drawing & Painting' },
                                { key: 'crafts', label: 'Crafts' },
                                { key: 'musical_skills', label: 'Musical Skills' },
                              ].map(skill => (
                                <div key={skill.key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{skill.label}</span>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-300'
                                      }`}>
                                        {v}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="bg-slate-900 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                              <Heart className="w-3 h-3" /> Affective Domain
                            </div>
                            <div className="p-4 space-y-2">
                              {[
                                { key: 'punctuality', label: 'Punctuality' },
                                { key: 'neatness', label: 'Neatness' },
                                { key: 'politeness', label: 'Politeness' },
                                { key: 'honesty', label: 'Honesty' },
                                { key: 'relationship_with_others', label: 'Relationship' },
                                { key: 'leadership', label: 'Leadership' },
                                { key: 'emotional_stability', label: 'Emotional Stability' },
                                { key: 'health', label: 'Health' },
                                { key: 'self_control', label: 'Self Control' },
                                { key: 'attentiveness', label: 'Attentiveness' },
                                { key: 'perseverance', label: 'Perseverance' },
                              ].map(skill => (
                                <div key={skill.key} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-600">{skill.label}</span>
                                  <div className="flex gap-1">
                                    {[1,2,3,4,5].map(v => (
                                      <div key={v} className={`w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold ${
                                        (psychomotor?.[skill.key] || 0) >= v ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-300'
                                      }`}>
                                        {v}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right Side: Academic Results */}
                        <div className="flex-1">
                          <table className="w-full border-collapse border border-slate-200 rounded-2xl overflow-hidden">
                            <thead>
                              <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest">
                                <th className="px-4 py-3 text-left border border-slate-800">Subject</th>
                                <th className="px-2 py-3 text-center border border-slate-800">CA1 (20)</th>
                                <th className="px-2 py-3 text-center border border-slate-800">CA2 (20)</th>
                                <th className="px-2 py-3 text-center border border-slate-800">Exam (60)</th>
                                <th className="px-2 py-3 text-center border border-slate-800">Total (100)</th>
                                <th className="px-2 py-3 text-center border border-slate-800">Pos</th>
                                <th className="px-4 py-3 text-center border border-slate-800">Grade</th>
                                <th className="px-4 py-3 text-center border border-slate-800">Remark</th>
                              </tr>
                            </thead>
                            <tbody className="text-sm">
                              {results.map((r, idx) => {
                                const total = r.total_score;
                                let grade = '-';
                                let color = 'text-slate-400';
                                let pos = '-';
                                let remark = '-';
                                
                                if (r.has_result) {
                                  if (total >= 70) { grade = 'A'; color = 'text-emerald-600'; }
                                  else if (total >= 60) { grade = 'B'; color = 'text-blue-600'; }
                                  else if (total >= 50) { grade = 'C'; color = 'text-amber-600'; }
                                  else if (total >= 45) { grade = 'D'; color = 'text-orange-600'; }
                                  else if (total >= 40) { grade = 'E'; color = 'text-orange-400'; }
                                  else { grade = 'F'; color = 'text-red-600'; }
                                  
                                  pos = calculateSubjectPosition(r.subject_id, total);
                                  remark = getRemark(total);
                                }

                                return (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="px-4 py-3 border border-slate-200 font-bold text-slate-900">
                                      {r.subject_name}
                                    </td>
                                    <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                      {r.has_result ? r.ca1_score : '-'}
                                    </td>
                                    <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                      {r.has_result ? r.ca2_score : '-'}
                                    </td>
                                    <td className="px-2 py-3 border border-slate-200 text-center font-medium">
                                      {r.has_result ? r.exam_score : '-'}
                                    </td>
                                    <td className="px-2 py-3 border border-slate-200 text-center font-black">
                                      {r.has_result ? total : '-'}
                                    </td>
                                    <td className="px-2 py-3 border border-slate-200 text-center font-bold text-blue-600 text-xs">
                                      {pos}
                                    </td>
                                    <td className={`px-4 py-3 border border-slate-200 text-center font-black ${color}`}>{grade}</td>
                                    <td className="px-4 py-3 border border-slate-200 text-center text-[10px] font-bold text-slate-500">
                                      {remark}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-900 text-white">
                                <td className="px-4 py-3 font-bold border border-slate-800">Grand Total</td>
                                <td colSpan={3} className="border border-slate-800"></td>
                                <td className="px-4 py-3 text-center font-black border border-slate-800">{calculateTotal()}</td>
                                <td colSpan={2} className="border border-slate-800"></td>
                              </tr>
                            </tfoot>
                          </table>

                          {/* Remarks Section */}
                          <div className="mt-8 grid grid-cols-1 gap-6">
                            <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl">
                              <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase mb-2">
                                <MessageSquare className="w-3 h-3" /> Class Teacher's Remark
                              </div>
                              <p className="text-sm text-slate-700 italic min-h-[40px]">
                                {psychomotor?.teacher_remark || 'No remark provided.'}
                              </p>
                            </div>
                            <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl">
                              <div className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase mb-2">
                                <MessageSquare className="w-3 h-3" /> Principal's Remark
                              </div>
                              <p className="text-sm text-slate-700 italic min-h-[40px]">
                                {psychomotor?.principal_remark || 'No remark provided.'}
                              </p>
                            </div>
                          </div>

                          {/* Signatures */}
                          <div className="mt-12 flex justify-between items-end px-4">
                            <div className="text-center">
                              <div className="w-40 border-b-2 border-slate-900 mb-2"></div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Class Teacher</div>
                            </div>
                            <div className="text-center">
                              <div className="mb-4">
                                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Next Term Begins</div>
                                <input 
                                  type="text"
                                  value={nextTermBegins}
                                  onChange={(e) => updateNextTermBegins(e.target.value)}
                                  className="w-40 px-2 py-1 text-xs border border-slate-200 rounded text-center font-bold print:border-none print:bg-transparent"
                                  placeholder="Enter date..."
                                />
                              </div>
                              <div className="h-12 flex items-center justify-center mb-1">
                                {settings?.principal_signature_url && (
                                  <img src={settings.principal_signature_url} alt="Signature" className="h-12 object-contain" />
                                )}
                              </div>
                              <div className="w-40 border-b-2 border-slate-900 mb-2"></div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase">Principal's Signature</div>
                            </div>
                            <div className="text-center">
                              <div className="font-mono text-xs text-slate-900 font-bold">{new Date().toLocaleDateString()}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">Date Issued</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
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
                      <div className="flex items-center justify-between border-b-4 border-emerald-600 pb-6 mb-8">
                        <div className="flex items-center gap-6">
                          {settings?.school_logo_url ? (
                            <img src={settings.school_logo_url} alt="Logo" className="w-24 h-24 object-contain" />
                          ) : (
                            <div className="w-24 h-24 bg-emerald-600 rounded-2xl flex items-center justify-center">
                              <TrendingUp className="w-14 h-14 text-white" />
                            </div>
                          )}
                          <div>
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{settings?.school_name}</h1>
                            <p className="text-emerald-600 font-bold italic">{settings?.school_motto}</p>
                            <div className="mt-2 flex gap-4 text-sm text-slate-600 font-bold">
                              <span className="bg-slate-100 px-3 py-1 rounded-full">Annual Session Summary (Cumulative)</span>
                              <span className="bg-slate-100 px-3 py-1 rounded-full">{settings?.current_session} Session</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-black text-slate-200 uppercase tracking-tighter leading-none">Annual<br/>Summary</div>
                          <div className="text-slate-400 font-mono text-sm mt-2">ADMISSION NO: {selectedStudent.admission_number}</div>
                        </div>
                      </div>

                      {/* Student Info Summary */}
                      <div className="grid grid-cols-4 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Student Name</div>
                            <div className="font-bold text-slate-900">{selectedStudent.first_name} {selectedStudent.last_name}</div>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Class</div>
                            <div className="font-bold text-slate-900">{classes.find(c => c.id === parseInt(selectedClass || '0'))?.class_name}</div>
                        </div>
                        <div className="bg-emerald-600 p-4 rounded-2xl shadow-lg shadow-emerald-100">
                            <div className="text-[10px] font-black text-emerald-200 uppercase mb-1">Cumulative Avg</div>
                            <div className="text-2xl font-black text-white">{calculateCumulativeAverage()}%</div>
                        </div>
                        <div className="bg-slate-900 p-4 rounded-2xl shadow-lg shadow-slate-200">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Final Status</div>
                            <div className="text-lg font-black text-white uppercase tracking-tighter">
                              {parseFloat(calculateCumulativeAverage()) >= 45 ? 'Promoted' : 'Decision Pending'}
                            </div>
                        </div>
                      </div>

                      {/* Cumulative Table */}
                      <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-sm mb-8">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-slate-900 text-white text-[10px] uppercase font-black tracking-widest text-center">
                              <th className="px-6 py-4 text-left border border-slate-800">Academic Subject</th>
                              <th className="px-2 py-4 border border-slate-800">1st (30%)</th>
                              <th className="px-2 py-4 border border-slate-800">2nd (30%)</th>
                              <th className="px-2 py-4 border border-slate-800">3rd (40%)</th>
                              <th className="px-4 py-4 border border-slate-800 bg-emerald-700">Cumulative / 100</th>
                              <th className="px-4 py-4 border border-slate-800">Remark</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {cumulativeResults.map((r, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-6 py-4 border border-slate-200 font-bold text-slate-900 uppercase tracking-tight">{r.subject_name}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.first_term || '-'}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.second_term || '-'}</td>
                                <td className="px-2 py-4 border border-slate-200 text-center font-medium text-slate-600">{r.third_term || '-'}</td>
                                <td className="px-4 py-4 border border-slate-200 text-center font-black text-emerald-600 text-base">{r.cumulative.toFixed(1)}</td>
                                <td className="px-4 py-4 border border-slate-200 text-center">
                                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                                    r.cumulative >= 45 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {getRemark(r.cumulative)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-900 text-white">
                              <td className="px-6 py-4 font-black uppercase text-xs tracking-widest border border-slate-800">Annual Average Score</td>
                              <td colSpan={3} className="border border-slate-800"></td>
                              <td className="px-4 py-4 text-center font-black text-xl border border-slate-800 text-emerald-400">{calculateCumulativeAverage()}%</td>
                              <td className="border border-slate-800"></td>
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
                  )}
                </div>
              </div>
                </div>
              ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 h-[600px] flex flex-col items-center justify-center text-slate-400 space-y-4">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                  <BookOpen className="w-10 h-10" />
                </div>
                <p className="font-medium">Select a student to view their report card</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
