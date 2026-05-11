import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Filter, 
  Wallet,
  AlertCircle,
  Download,
  AlertTriangle,
  History,
  Receipt,
  Calendar,
  CreditCard,
  UserRound,
  TrendingDown,
  ArrowRight,
  TrendingUp,
  X,
  Loader2
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class } from '../../types';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

export default function DebtManagement() {
  const { settings } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modal State
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [feeTransactions, setFeeTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function fetchTransactions(student: any) {
    setLoadingTransactions(true);
    try {
      // Get all fee records for this student first to get their IDs
      const { data: records } = await supabase
        .from('fee_records')
        .select('id')
        .eq('student_id', student.id);
      
      if (records && records.length > 0) {
        const recordIds = records.map(r => r.id);
        const { data: txData, error } = await supabase
          .from('fee_transactions')
          .select('*, cashier:profiles!fee_transactions_received_by_fkey(name)')
          .in('fee_record_id', recordIds)
          .order('transaction_date', { ascending: false });
        
        if (error) throw error;
        setFeeTransactions(txData || []);
      } else {
        setFeeTransactions([]);
      }
    } catch (error: any) {
      toast.error('Error fetching history: ' + error.message);
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    if (selectedStudent && isModalOpen) {
      fetchTransactions(selectedStudent);
    }
  }, [selectedStudent, isModalOpen]);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (settings) {
      if (!selectedTerm) setSelectedTerm(settings.current_term);
      if (!selectedSession) setSelectedSession(settings.current_session);
    }
  }, [settings]);

  useEffect(() => {
    if (selectedTerm && selectedSession) {
      fetchStudents();
    }
  }, [selectedClass, selectedTerm, selectedSession]);

  async function fetchInitialData() {
    try {
      const { data: classesData } = await supabase.from('classes').select('*').order('class_name');
      setClasses(classesData || []);
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
      setStudents(data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  const processedStudents = students.filter(student => {
    const matchesSearch = `${student.first_name} ${student.last_name} ${student.admission_number}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    const currentRecord = student.fee_records?.find((f: any) => 
      f.term === selectedTerm && f.session === selectedSession
    );

    // If filter status is set, check against current term record
    if (filterStatus !== 'all') {
      if (filterStatus === 'Not Paid') {
        // Not Paid: either no record or record status is 'Not Paid'
        const isNotPaid = !currentRecord || currentRecord.status === 'Not Paid';
        if (!isNotPaid) return false;
      } else if (filterStatus === 'Partial') {
        // Partial: must have a record with status 'Partial'
        const isPartial = currentRecord?.status === 'Partial';
        if (!isPartial) return false;
      }
    }

    // A debtor is someone who has a balance in ANY term or specifically the selected term
    // User wants "View list of debtors", which usually means people who owe SOMETHING.
    const hasCurrentDebt = currentRecord && Number(currentRecord.balance) > 0;
    const hasPreviousDebt = student.fee_records?.some((f: any) => 
      (f.term !== selectedTerm || f.session !== selectedSession) && Number(f.balance) > 0
    );

    return hasCurrentDebt || hasPreviousDebt;
  });

  const exportToExcel = () => {
    const data = processedStudents.map(s => {
      const currentRecord = s.fee_records?.find((f: any) => 
        f.term === selectedTerm && f.session === selectedSession
      );
      const totalPaid = s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.amount_paid), 0) || 0;
      const totalBalance = s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
      const carriedOver = s.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                                     .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;

      return {
        'Admission No': s.admission_number,
        'Full Name': `${s.first_name} ${s.last_name}`,
        'Class': s.class?.class_name,
        'Term Paid': currentRecord?.amount_paid || 0,
        'Term Balance': currentRecord?.balance || 0,
        'Carried Over Debt': carriedOver,
        'Total Outstanding': totalBalance,
        'Total Ever Paid': totalPaid
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Debtors List");
    XLSX.writeFile(wb, `Debtors_Report_${selectedTerm}_${selectedSession}.xlsx`);
    toast.success('Debtor report exported');
  };

  const totals = processedStudents.reduce((acc, s) => {
    const current = s.fee_records?.find((f: any) => f.term === selectedTerm && f.session === selectedSession);
    const carried = s.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                               .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
    
    return {
      currentDebt: acc.currentDebt + (current ? Number(current.balance) : 0),
      carriedOver: acc.carriedOver + carried,
      total: acc.total + (s.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0)
    };
  }, { currentDebt: 0, carriedOver: 0, total: 0 });

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Debt Management</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor and track outstanding student balances across terms.</p>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-purple text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-100 transition-all active:scale-95"
        >
          <Download className="w-4 h-4" />
          Export Debtors (Excel)
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-purple-50 border border-purple-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-brand-purple shadow-sm border border-purple-100">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-brand-purple/80 font-bold tracking-widest uppercase">Term Debt</p>
            <p className="text-2xl font-black text-brand-purple">₦{totals.currentDebt.toLocaleString()}</p>
          </div>
        </div>
        <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100">
            <History className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-amber-600/80 font-bold tracking-widest uppercase">Carried Over</p>
            <p className="text-2xl font-black text-amber-900">₦{totals.carriedOver.toLocaleString()}</p>
          </div>
        </div>
        <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-rose-600/80 font-bold tracking-widest uppercase">Total Debt</p>
            <p className="text-2xl font-black text-rose-900">₦{totals.total.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search debtor name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none transition-all font-medium"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none font-bold text-sm"
          >
            <option value="all">All Classes</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none font-bold text-sm text-rose-600"
          >
            <option value="all" className="text-slate-900">All Debtors</option>
            <option value="Not Paid" className="text-rose-600">No Payment</option>
            <option value="Partial" className="text-amber-600">Partial Payment</option>
          </select>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none font-bold text-sm"
          >
            <option value="1st Term">1st Term</option>
            <option value="2nd Term">2nd Term</option>
            <option value="3rd Term">3rd Term</option>
          </select>
          <input
            type="text"
            placeholder="Session (e.g. 2023/2024)"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-purple outline-none font-bold text-sm w-32"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Term Paid</th>
                <th className="px-6 py-4">Term Balance</th>
                <th className="px-6 py-4">Carried Over</th>
                <th className="px-6 py-4 text-right">Total Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : processedStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                        <TrendingDown className="w-8 h-8" />
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No debtors found matching criteria</p>
                    </div>
                  </td>
                </tr>
              ) : processedStudents.map((student) => {
                const currentRecord = student.fee_records?.find((f: any) => 
                  f.term === selectedTerm && f.session === selectedSession
                );
                const totalBalance = student.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;
                const carriedOver = student.fee_records?.filter((f: any) => f.term !== selectedTerm || f.session !== selectedSession)
                                               .reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0;

                return (
                  <tr 
                    key={student.id} 
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-600">
                          {student.first_name[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 tracking-tight">{student.first_name} {student.last_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono font-bold tracking-tight uppercase">{student.class?.class_name} • {student.admission_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-emerald-600">₦{(currentRecord?.amount_paid || 0).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-rose-500">
                      ₦{(currentRecord?.balance || 0).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                       <span className={`text-[10px] font-black uppercase tracking-tight py-1 px-2 rounded-lg ${carriedOver > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                         ₦{carriedOver.toLocaleString()}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-lg font-black text-rose-600 tracking-tight">₦{totalBalance.toLocaleString()}</p>
                      <button 
                        onClick={() => {
                          setSelectedStudent(student);
                          setIsModalOpen(true);
                        }}
                        className="text-[9px] font-black uppercase tracking-widest text-brand-purple hover:underline"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* History Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-rose-600 rounded-2xl shadow-lg shadow-rose-100">
                    <AlertCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Debt Breakdown</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-all">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 max-h-[70vh] overflow-y-auto">
                <div className="space-y-8">
                  {/* Term Summaries */}
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Term Summaries</h3>
                    <div className="space-y-4">
                      {selectedStudent?.fee_records?.sort((a: any, b: any) => b.session.localeCompare(a.session)).map((record: any) => (
                        <div key={record.id} className={`p-6 rounded-3xl border border-slate-100 flex items-center justify-between ${Number(record.balance) > 0 ? 'bg-rose-50/50' : 'bg-emerald-50/30'}`}>
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{record.session} • {record.term}</p>
                            <div className="flex items-center gap-4">
                               <div>
                                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Target</p>
                                  <p className="font-bold text-slate-600 text-sm">₦{Number(record.total_amount).toLocaleString()}</p>
                               </div>
                               <div>
                                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Paid</p>
                                  <p className="font-bold text-emerald-600 text-sm">₦{Number(record.amount_paid).toLocaleString()}</p>
                               </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 tracking-widest uppercase mb-1">Balance</p>
                            <p className={`text-xl font-black tracking-tight ${Number(record.balance) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              ₦{Number(record.balance).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Transaction History */}
                  <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Payment Timeline</h3>
                    {loadingTransactions ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 text-slate-200 animate-spin" />
                      </div>
                    ) : feeTransactions.length > 0 ? (
                      <div className="space-y-3">
                        {feeTransactions.map((tx) => (
                          <div key={tx.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-purple-50 rounded-xl text-brand-purple">
                                <Receipt className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">₦{Number(tx.amount).toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                                  {new Date(tx.transaction_date).toLocaleDateString()} • {tx.payment_method}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">ID: {tx.receipt_number}</p>
                              {tx.cashier && (
                                <p className="text-[9px] font-bold text-slate-400 uppercase">by {tx.cashier.name}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No individual payments found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex items-center justify-between">
                <div>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Cumulative Debt</p>
                   <p className="text-2xl font-black text-rose-600 tracking-tight">
                     ₦{(selectedStudent?.fee_records?.reduce((sum: number, f: any) => sum + Number(f.balance), 0) || 0).toLocaleString()}
                   </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-3 bg-brand-purple text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-100"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
