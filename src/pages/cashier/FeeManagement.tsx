import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Filter, 
  Wallet,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ExternalLink,
  Plus,
  CreditCard,
  Banknote,
  Navigation,
  FileText,
  X,
  AlertTriangle,
  AlertCircle,
  History,
  Receipt,
  Calendar,
  UserRound
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Student, Class, FeeRecord, FeeTransaction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function FeeManagement() {
  const { settings, profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [feeStandards, setFeeStandards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  
  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [transactions, setTransactions] = useState<FeeTransaction[]>([]);
  
  const [paymentData, setPaymentData] = useState({
    amount: '',
    total_amount: '',
    term: settings?.current_term || '',
    session: settings?.current_session || '',
    method: 'Cash' as 'Cash' | 'Bank Transfer' | 'POS' | 'Online',
    notes: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previousDebt, setPreviousDebt] = useState(0);

  useEffect(() => {
    if (settings) {
      setSelectedSession(settings.current_session);
      setSelectedTerm(settings.current_term);
      fetchInitialData();
    }
  }, [settings]);

  useEffect(() => {
    if (selectedSession && selectedTerm) {
      fetchStudents();
    }
  }, [selectedClass, filterStatus, selectedSession, selectedTerm]);

  async function fetchInitialData() {
    try {
      const [
        { data: classesData },
        { data: standardsData }
      ] = await Promise.all([
        supabase.from('classes').select('*').order('class_name'),
        supabase.from('fee_standards').select('*').eq('term', selectedTerm).eq('session', selectedSession)
      ]);
      setClasses(classesData || []);
      setFeeStandards(standardsData || []);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function fetchStudents() {
    setLoading(true);
    try {
      let query = supabase
        .from('students')
        .select(`
          *,
          class:classes(class_name),
          fee_records!left(*)
        `);

      if (selectedClass !== 'all') {
        query = query.eq('class_id', selectedClass);
      }

      const { data, error } = await query.order('last_name');
      if (error) throw error;

      // Enhance students with previous debt information
      const studentsWithDebt = (data || []).map(student => {
        const records = student.fee_records || [];
        const currentRecord = records.find((f: any) => 
          f.term === selectedTerm && f.session === selectedSession
        );
        
        // Prioritize expected amount from standards
        const standard = feeStandards.find((s: any) => s.class_id === student.class_id);
        const expected = standard?.amount || (currentRecord ? Number(currentRecord.total_amount) : 0);
        const paid = currentRecord ? Number(currentRecord.amount_paid) : 0;
        const currentBalance = expected - Number(paid);

        // Calculate debt from OTHER terms/sessions
        const previousDebt = records
          .filter((r: any) => !(r.term === selectedTerm && r.session === selectedSession))
          .reduce((sum: number, r: any) => sum + (Number(r.total_amount) - Number(r.amount_paid)), 0);

        return {
          ...student,
          current_record: currentRecord,
          expected_amount: expected,
          amount_paid: paid,
          previous_debt: previousDebt,
          total_owing: currentBalance + previousDebt
        };
      });

      let filteredData = studentsWithDebt;
      if (filterStatus !== 'all') {
        filteredData = filteredData.filter(student => {
          const expected = student.expected_amount;
          const paid = student.amount_paid;
          
          if (filterStatus === 'Paid') return expected > 0 && paid >= expected;
          if (filterStatus === 'Partial') return paid > 0 && paid < expected;
          if (filterStatus === 'Not Paid') return paid === 0;
          return true;
        });
      }

      setStudents(filteredData);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function calculateDebt(studentId: number) {
    try {
      const { data, error } = await supabase
        .from('fee_records')
        .select('*')
        .eq('student_id', studentId);
      
      if (error) throw error;
      
      // Calculate debt from all terms EXCEPT the one being selected in the modal (initially current)
      const debt = (data || []).reduce((acc, rec) => {
        // Only count as debt if it's NOT the current term/session we are looking at
        if (rec.term === settings?.current_term && rec.session === settings?.current_session) return acc;
        return acc + Number(rec.balance || 0);
      }, 0);
      
      setPreviousDebt(debt);
    } catch (error: any) {
      console.error('Error calculating debt:', error);
    }
  }

  async function openPaymentModal(student: any) {
    const record = student.fee_records?.find((f: any) => 
      f.term === settings?.current_term && f.session === settings?.current_session
    );
    
    // Prioritize expected amount from standards
    const standard = feeStandards.find(s => s.class_id === student.class_id);
    const expectedFromStandard = standard?.amount || 0;
    const currentPaid = record?.amount_paid || 0;
    const totalAmount = expectedFromStandard || record?.total_amount || 0;
    const balance = Number(totalAmount) - Number(currentPaid);

    setSelectedStudent(student);
    setPaymentData({
      amount: balance > 0 ? balance.toString() : '',
      total_amount: totalAmount.toString(),
      term: selectedTerm,
      session: selectedSession,
      method: 'Cash',
      notes: ''
    });
    
    calculateDebt(student.id);
    setIsPaymentModalOpen(true);
  }

  // Update total amount when term/session changes in modal
  useEffect(() => {
    if (isPaymentModalOpen && selectedStudent) {
      updateModalTotals();
    }
  }, [paymentData.term, paymentData.session]);

  async function updateModalTotals() {
    try {
      // Try getting from standard first (admin source of truth)
      const { data: standard } = await supabase
        .from('fee_standards')
        .select('amount')
        .eq('class_id', selectedStudent.class_id)
        .eq('term', paymentData.term)
        .eq('session', paymentData.session)
        .maybeSingle();

      const { data: record } = await supabase
        .from('fee_records')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('term', paymentData.term)
        .eq('session', paymentData.session)
        .maybeSingle();

      const totalAmount = standard?.amount || record?.total_amount || 0;
      const amountPaid = record?.amount_paid || 0;

      setPaymentData(prev => ({
        ...prev,
        total_amount: totalAmount.toString(),
        amount: (Number(totalAmount) - Number(amountPaid)).toString()
      }));

      // Re-calculate previous debt excluding the newly selected term/session
      const { data: allRecords } = await supabase
        .from('fee_records')
        .select('balance, term, session')
        .eq('student_id', selectedStudent.id);

      const debt = (allRecords || []).reduce((acc, rec) => {
        if (rec.term === paymentData.term && rec.session === paymentData.session) return acc;
        return acc + Number(rec.balance || 0);
      }, 0);
      setPreviousDebt(debt);

    } catch (error: any) {
      toast.error('Failed to update term totals');
    }
  }

  async function fetchHistory(feeRecordId: number) {
    try {
      const { data, error } = await supabase
        .from('fee_transactions')
        .select('*, cashier:profiles!fee_transactions_received_by_fkey(name)')
        .eq('fee_record_id', feeRecordId)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      setTransactions(data || []);
      setIsHistoryModalOpen(true);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function processPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudent || isSubmitting) return;

    const amount = Number(paymentData.amount);
    const totalAmount = Number(paymentData.total_amount);

    if (amount <= 0 && !recordExistsForTotalChange) {
      toast.error('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Get current record for the selected term/session
      const { data: record, error: fetchError } = await supabase
        .from('fee_records')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('term', paymentData.term)
        .eq('session', paymentData.session)
        .maybeSingle();

      if (fetchError) throw fetchError;

      let currentPaid = Number(record?.amount_paid || 0);
      let newPaid = currentPaid + amount;
      
      let status: 'Paid' | 'Partial' | 'Not Paid' = 'Not Paid';
      if (newPaid >= totalAmount) status = 'Paid';
      else if (newPaid > 0) status = 'Partial';

      const upsertData: any = {
        student_id: selectedStudent.id,
        term: paymentData.term,
        session: paymentData.session,
        total_amount: totalAmount,
        amount_paid: newPaid,
        status: status,
        results_locked: status !== 'Paid',
        last_updated_by: profile?.id,
        updated_at: new Date().toISOString()
      };

      const { data: updatedRecord, error: recordError } = await supabase
        .from('fee_records')
        .upsert(upsertData, { onConflict: 'student_id,term,session' })
        .select()
        .single();

      if (recordError) throw recordError;
      
      // 2. Log Transaction if amount > 0
      if (amount > 0) {
        const { error: txError } = await supabase
          .from('fee_transactions')
          .insert({
            student_id: selectedStudent.id,
            fee_record_id: updatedRecord.id,
            amount: amount,
            payment_method: paymentData.method,
            received_by: profile?.id,
            term: paymentData.term,
            session: paymentData.session,
            notes: paymentData.notes
          });
        if (txError) throw txError;
      }

      toast.success('Payment processed successfully');
      setIsPaymentModalOpen(false);
      fetchStudents();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleLock(studentId: number, record: any) {
    try {
      const { error } = await supabase
        .from('fee_records')
        .update({ results_locked: !record.results_locked })
        .eq('id', record.id);
      
      if (error) throw error;
      toast.success(`Results ${record.results_locked ? 'unlocked' : 'locked'}`);
      fetchStudents();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const recordExistsForTotalChange = selectedStudent?.fee_records?.find((f: any) => 
    f.term === settings?.current_term && f.session === settings?.current_session
  );

  const filteredStudents = students.filter(student => 
    `${student.first_name} ${student.last_name} ${student.admission_number}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Fee Management</h1>
          <p className="text-slate-500 font-medium tracking-tight">Process payments for {selectedTerm} Term {selectedSession}.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-3 py-1.5 bg-transparent border-none outline-none text-xs font-black text-slate-900"
          >
            {['2024/2025', '2025/2026', '2026/2027'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="w-px h-4 bg-slate-100 my-auto mx-1" />
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-3 py-1.5 bg-transparent border-none outline-none text-xs font-black text-slate-900"
          >
            {['1st', '2nd', '3rd'].map(t => (
              <option key={t} value={t}>{t} Term</option>
            ))}
          </select>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search student by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none shadow-sm transition-all"
          />
        </div>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none shadow-sm font-bold text-sm text-slate-700"
        >
          <option value="all">All Classes</option>
          {classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.class_name}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none shadow-sm font-bold text-sm text-slate-700"
        >
          <option value="all">Any Status</option>
          <option value="Paid">Fully Paid</option>
          <option value="Partial">Partially Paid</option>
          <option value="Not Paid">Not Paid</option>
        </select>
      </div>

      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-[0.2em] font-black">
              <tr>
                <th className="px-8 py-6">Student</th>
                <th className="px-8 py-6">Financial Balance</th>
                <th className="px-8 py-6">Status</th>
                <th className="px-8 py-6">Portal Access</th>
                <th className="px-8 py-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6">
                      <div className="h-12 bg-slate-50 rounded-2xl"></div>
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center">
                        <div className="max-w-xs mx-auto">
                          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <Users className="w-8 h-8 text-slate-300" />
                          </div>
                          <p className="text-slate-900 font-bold mb-1">No students found</p>
                          <p className="text-sm text-slate-400">Try adjusting your filters or search term.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => {
                      const expected = student.expected_amount;
                      const paid = student.amount_paid;
                      
                      const isPaid = expected > 0 && paid >= expected;
                      const isPartial = paid > 0 && paid < expected;
                      const isNotPaid = paid === 0;
                      
                      const totalBalance = student.total_owing || 0;
                      const isLocked = student.current_record ? student.current_record.results_locked : true;

                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${
                                isPaid ? 'bg-emerald-100 text-emerald-600' : 
                                isPartial ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
                              }`}>
                                {student.first_name[0]}{student.last_name[0]}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-slate-900 uppercase tracking-tight text-sm">
                                    {student.first_name} {student.last_name}
                                  </p>
                                  {(expected - paid) > 0 && (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[8px] font-black rounded uppercase">
                                      Term Debt ₦{(expected - paid).toLocaleString()}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                                  {student.admission_number} • {student.class?.class_name}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight leading-none">Expected</p>
                                    <span className="text-[10px] font-black text-slate-900 leading-none">₦{expected.toLocaleString()}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight leading-none">Paid</p>
                                    <span className="text-[10px] font-black text-emerald-600 leading-none">₦{paid.toLocaleString()}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  {totalBalance > 0 ? (
                                    <div className="flex flex-col items-end">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[8px] text-rose-400 font-bold uppercase tracking-tight leading-none">Term Balance</p>
                                        <span className="text-[10px] font-black text-rose-600 leading-none">₦{(expected - paid).toLocaleString()}</span>
                                      </div>
                                      {student.previous_debt > 0 && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                          <p className="text-[8px] text-amber-400 font-bold uppercase tracking-tight leading-none">Prev Debt</p>
                                          <span className="text-[10px] font-black text-amber-600 leading-none">₦{student.previous_debt.toLocaleString()}</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="bg-emerald-50 px-2 py-1 rounded-lg">
                                      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tight">Status: Settled</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex items-center shadow-inner mt-2">
                                <div 
                                  className={`h-full transition-all duration-700 ease-out ${
                                    totalBalance <= 0 ? 'bg-emerald-500' : 
                                    (paid / expected) > 0.5 ? 'bg-amber-500' : 'bg-rose-400'
                                  }`} 
                                  style={{ width: `${expected > 0 ? Math.min((paid / expected) * 100, 100) : 0}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                      <td className="px-8 py-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] border w-fit ${
                            isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                            isPartial ? 'bg-amber-50 text-amber-600 border-amber-100' :
                            'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                            {isPaid ? 'Fully Paid' : isPartial ? 'Partial Payment' : 'Not Paid'}
                          </span>
                          {totalBalance > 0 && (
                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-tight">
                              ₦{totalBalance.toLocaleString()} Due
                            </span>
                          )}
                        </div>
                      </td>
                          <td className="px-8 py-4">
                            <button
                              onClick={() => student.current_record && toggleLock(student.id, student.current_record)}
                              disabled={!student.current_record}
                              className={`flex items-center gap-2 group transition-all ${
                                isLocked ? 'text-slate-400' : 'text-brand-purple'
                              }`}
                            >
                              {isLocked ? (
                                <>
                                  <Lock className="w-4 h-4" />
                                  <span className="text-[10px] font-black uppercase">Restricted</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-4 h-4" />
                                  <span className="text-[10px] font-black uppercase">Full Access</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openPaymentModal(student)}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-brand-purple transition-all shadow-lg shadow-slate-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add Payment
                              </button>
                              <button
                                onClick={() => student.current_record && fetchHistory(student.current_record.id)}
                                disabled={!student.current_record}
                                className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-brand-purple hover:text-white transition-all shadow-sm disabled:opacity-30"
                                title="View History"
                              >
                                <History className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                    );
                  })
                )}
              </>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-200">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Process Payment</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-2 text-slate-400 hover:bg-white hover:text-slate-900 rounded-xl transition-all border border-transparent hover:border-slate-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={processPayment} className="p-8 space-y-6">
                {previousDebt > 0 && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                      <div>
                        <p className="text-[10px] font-black text-rose-900 uppercase tracking-widest leading-none">Historical Debt</p>
                        <p className="text-xl font-black text-rose-600">₦{previousDebt.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-rose-400 uppercase tracking-tight">Owed from previous terms</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Academic Session</label>
                    <select
                      value={paymentData.session}
                      onChange={(e) => setPaymentData({...paymentData, session: e.target.value})}
                      className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-purple-100 outline-none font-bold text-slate-900 transition-all text-sm"
                    >
                      {['2023/2024', '2024/2025', '2025/2026', '2026/2027'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Term</label>
                    <select
                      value={paymentData.term}
                      onChange={(e) => setPaymentData({...paymentData, term: e.target.value})}
                      className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-purple-100 outline-none font-bold text-slate-900 transition-all text-sm"
                    >
                      <option value="1st">1st Term</option>
                      <option value="2nd">2nd Term</option>
                      <option value="3rd">3rd Term</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Term Total Fee</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">₦</div>
                      <input
                        type="number"
                        required
                        value={paymentData.total_amount}
                        onChange={(e) => setPaymentData({...paymentData, total_amount: e.target.value})}
                        className="w-full pl-8 pr-4 py-4 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-purple-100 outline-none font-black text-slate-900 transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Term Balance Due</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-400 font-black">₦</div>
                      <div className="w-full pl-8 pr-4 py-4 bg-rose-50 border-none rounded-2xl font-black text-rose-700">
                        {(() => {
                          const currentPaid = selectedStudent?.fee_records?.find((f: any) => 
                            f.term === paymentData.term && f.session === paymentData.session
                          )?.amount_paid || 0;
                          return (Number(paymentData.total_amount) - Number(currentPaid)).toLocaleString();
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm font-black text-[10px]">FIXED</div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Admin Set Fee (Standard)</p>
                      <p className="text-base font-black text-slate-900">
                        {(() => {
                          const standard = feeStandards.find(s => s.class_id === selectedStudent?.class_id && s.term === paymentData.term && s.session === paymentData.session);
                          return standard ? `₦${Number(standard.amount).toLocaleString()}` : "Not Set";
                        })()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1">Amount Paying Now</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black">₦</div>
                    <input
                      type="number"
                      value={paymentData.amount}
                      onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full pl-8 pr-4 py-4 bg-emerald-50 border-2 border-emerald-100 rounded-2xl focus:ring-4 focus:ring-emerald-100 outline-none font-black text-emerald-900 placeholder:text-emerald-300 transition-all text-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Payment Method</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Cash', 'Bank Transfer', 'POS', 'Online'].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentData({...paymentData, method: method as any})}
                        className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight border transition-all ${
                          paymentData.method === method 
                            ? 'bg-brand-purple border-brand-purple text-white shadow-lg shadow-purple-200' 
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Notes / Remarks</label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
                    placeholder="Optional transaction reference or note..."
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-4 focus:ring-purple-100 outline-none font-medium text-slate-900 transition-all text-sm h-20 resize-none"
                  />
                </div>

                <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-[10px] text-amber-900 font-bold leading-relaxed uppercase">
                    Payment will be applied to <span className="text-brand-purple underline">{paymentData.term} Term, {paymentData.session} Session</span>.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-brand-purple text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-100 disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm Payment
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-purple rounded-2xl shadow-lg shadow-purple-100">
                    <History className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Invoice History</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 max-h-[60vh] overflow-y-auto">
                {transactions.length > 0 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                          <div className="p-2 bg-white rounded-xl shadow-sm">
                            <Receipt className="w-5 h-5 text-brand-purple" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-lg font-black text-slate-900">₦{Number(tx.amount).toLocaleString()}</p>
                              <span className="px-2 py-0.5 bg-purple-100 text-brand-purple rounded-md text-[9px] font-black uppercase">
                                {tx.payment_method}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-slate-500">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <p className="text-[10px] font-bold tracking-tight uppercase">
                                  {new Date(tx.transaction_date).toLocaleDateString(undefined, { 
                                    day: 'numeric', 
                                    month: 'long', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <div className="flex items-center gap-1">
                                  <ChevronDown className="w-3 h-3 text-slate-400" />
                                  <p className="text-[9px] font-black tracking-tight uppercase text-brand-purple">{tx.term} Term | {tx.session}</p>
                                </div>
                              </div>
                              {tx.cashier && (
                                <div className="flex items-center gap-2 text-slate-500">
                                  <UserRound className="w-3 h-3 text-slate-400" />
                                  <p className="text-[10px] font-bold tracking-tight uppercase">Cashier: {tx.cashier.name}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-6 bg-indigo-900 rounded-3xl text-white flex items-center gap-4 shadow-xl shadow-purple-100">
                        <div className="p-2 bg-white/10 rounded-xl">
                          <Wallet className="w-5 h-5 text-white/70" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Paid</p>
                          <p className="text-xl font-black tracking-tight">₦{transactions.reduce((sum, tx) => sum + Number(tx.amount), 0).toLocaleString()}</p>
                        </div>
                      </div>
                      
                      {(() => {
                        const record = selectedStudent?.fee_records?.find((f: any) => 
                          f.term === settings?.current_term && f.session === settings?.current_session
                        );
                        const balance = record ? Number(record.total_amount) - Number(record.amount_paid) : 0;
                        
                        return (
                          <div className={`p-6 rounded-3xl flex items-center gap-4 shadow-xl ${
                            balance > 0 ? 'bg-rose-600 text-white shadow-rose-100' : 'bg-emerald-600 text-white shadow-emerald-100'
                          }`}>
                            <div className="p-2 bg-white/10 rounded-xl">
                              <AlertCircle className="w-5 h-5 text-white/70" />
                            </div>
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                {balance > 0 ? 'Balance Owing' : 'Fully Paid'}
                              </p>
                              <p className="text-xl font-black tracking-tight">
                                {balance > 0 ? `₦${balance.toLocaleString()} Due` : 'FULLY PAID'}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                      <Receipt className="w-10 h-10 text-slate-200" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-900 tracking-tight">No Transactions Found</p>
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No payments recorded for this period.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="px-8 py-3 bg-brand-purple text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-100"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
