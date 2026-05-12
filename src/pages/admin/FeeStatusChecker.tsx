import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  Search, 
  Filter, 
  Wallet,
  CheckCircle,
  AlertCircle,
  Download,
  AlertTriangle,
  Lock,
  Unlock,
  X,
  History,
  Receipt,
  Calendar,
  CreditCard,
  UserRound
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { Class } from '../../types';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

export default function FeeStatusChecker() {
  const { settings } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | 'paid' | 'owing'>('all');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('');
  
  // Modal State
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  }, [selectedClass, selectedSession, selectedTerm]);

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

  async function openStudentDetails(student: any) {
    setSelectedStudent(student);
    setIsModalOpen(true);
    setTransactions([]);
    
    // Find the relevant fee record
    const record = student.fee_records?.find((f: any) => 
      f.term === selectedTerm && f.session === selectedSession
    );

    if (record) {
      setLoadingTransactions(true);
      try {
        const { data, error } = await supabase
          .from('fee_transactions')
          .select('*, cashier:profiles!fee_transactions_received_by_fkey(name)')
          .eq('fee_record_id', record.id)
          .order('transaction_date', { ascending: false });

        if (error) throw error;
        setTransactions(data || []);
      } catch (error: any) {
        toast.error('Failed to load payment history');
      } finally {
        setLoadingTransactions(false);
      }
    }
  }

  const processedStudents = students.filter(student => {
    const record = student.fee_records?.find((f: any) => 
      f.term === selectedTerm && f.session === selectedSession
    );
    const matchesSearch = `${student.first_name} ${student.last_name} ${student.admission_number}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filterType === 'paid') {
      return record && Number(record.amount_paid) >= Number(record.total_amount) && Number(record.total_amount) > 0;
    }
    if (filterType === 'owing') {
      const balance = record ? Number(record.total_amount) - Number(record.amount_paid) : 0;
      return !record || balance > 0;
    }
    return true;
  });

  const exportToExcel = () => {
    const data = processedStudents.map(s => {
      const record = s.fee_records?.find((f: any) => 
        f.term === selectedTerm && f.session === selectedSession
      );
      return {
        'Admission No': s.admission_number,
        'First Name': s.first_name,
        'Last Name': s.last_name,
        'Class': s.class?.class_name,
        'Payment Status': record?.status || 'Owing',
        'Result Visibility': record?.results_locked === false ? 'Visible' : 'Restricted',
        'Last Updated': record ? new Date(record.updated_at).toLocaleDateString() : 'N/A'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fee Status");
    XLSX.writeFile(wb, `Fee_Status_${settings?.current_term}_${settings?.current_session}.xlsx`);
    toast.success('Fee status report exported');
  };

  const totals = {
    paid: processedStudents.filter(s => {
      const record = s.fee_records?.find((f: any) => 
        f.term === selectedTerm && f.session === selectedSession
      );
      return record && Number(record.amount_paid) >= Number(record.total_amount) && Number(record.total_amount) > 0;
    }).length,
    owing: processedStudents.filter(s => {
      const record = s.fee_records?.find((f: any) => 
        f.term === selectedTerm && f.session === selectedSession
      );
      const balance = record ? Number(record.total_amount) - Number(record.amount_paid) : 0;
      return !record || balance > 0;
    }).length
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Fee Status Checker</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor fee compliance for {selectedTerm} Term {selectedSession}.</p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-purple text-white rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all active:scale-95 text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-emerald-600/80 font-bold tracking-widest uppercase">Verified Full Payments</p>
            <p className="text-2xl font-black text-emerald-900">{totals.paid} Students</p>
          </div>
        </div>
        <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-100">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-rose-600/80 font-bold tracking-widest uppercase">Total Outstanding / Owing</p>
            <p className="text-2xl font-black text-rose-900">{totals.owing} Students</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Search student..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none shadow-sm font-bold text-sm"
          >
            <option value="all">All Classes</option>
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.class_name}</option>
            ))}
          </select>
          <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filterType === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilterType('paid')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filterType === 'paid' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              PAID
            </button>
            <button
              onClick={() => setFilterType('owing')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filterType === 'owing' ? 'bg-brand-purple text-white shadow-lg shadow-purple-100' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              OWING
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Result Visibility</th>
                <th className="px-6 py-4 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                [1,2,3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-6 py-8"><div className="h-4 bg-slate-100 rounded w-full"></div></td>
                  </tr>
                ))
              ) : processedStudents.map((student) => {
                const record = student.fee_records?.find((f: any) => 
                  f.term === selectedTerm && f.session === selectedSession
                );
                
                const expected = record ? Number(record.total_amount) : 0;
                const paid = record ? Number(record.amount_paid) : 0;
                const currentBalance = expected - paid;
                
                const isPaid = expected > 0 && paid >= expected;
                const isPartial = paid > 0 && paid < expected;
                const isNotPaid = !record || (expected > 0 && paid === 0);
                
                // For "Total Debt" across all terms
                const totalDebt = (student.fee_records || []).reduce((sum: number, r: any) => 
                  sum + (Number(r.total_amount) - Number(r.amount_paid)), 0
                );
                
                const isLocked = record ? record.results_locked : true;

                return (
                  <tr 
                    key={student.id} 
                    onClick={() => openStudentDetails(student)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isPaid ? 'bg-emerald-100 text-emerald-600' : isPartial ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
                          {student.first_name[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <p className="font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">{student.first_name} {student.last_name}</p>
                             {(currentBalance > 0 || totalDebt > 0) && (
                               <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[8px] font-black rounded uppercase">
                                 Owes ₦{(currentBalance || totalDebt).toLocaleString()}
                               </span>
                             )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono font-bold tracking-tight uppercase">{student.class?.class_name} • {student.admission_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 font-black text-[9px] uppercase tracking-widest rounded-full border ${
                          isPaid 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : isPartial ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'
                        }`}>
                          {isPaid ? 'Fully Paid' : isPartial ? 'Partial Payment' : 'Owing / Not Paid'}
                        </span>
                        {currentBalance > 0 && (
                          <span className="text-[10px] font-black text-rose-600 uppercase tracking-tight">
                            ₦{currentBalance.toLocaleString()} Due
                          </span>
                        )}
                        {totalDebt > currentBalance && (
                          <span className="text-[8px] font-bold text-amber-500 uppercase tracking-tight">
                            Total ₦{totalDebt.toLocaleString()} debt
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {isLocked ? (
                          <div className="flex items-center gap-1.5 text-slate-400 group">
                            <Lock className="w-3 h-3 group-hover:animate-bounce" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Restricted</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-blue-600 font-bold">
                            <Unlock className="w-3 h-3" />
                            <span className="text-[10px] font-bold uppercase tracking-tight">Publicly Visible</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2 text-slate-400">
                        <span className="text-[9px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">View Details</span>
                        {isPaid ? (
                          <div className="p-1 px-3 bg-emerald-50 rounded-lg text-emerald-600 text-[10px] font-bold">
                            FULL PAYMENT
                          </div>
                        ) : isPartial ? (
                          <div className="p-1 px-3 bg-amber-50 rounded-lg text-amber-600 text-[10px] font-bold">
                            PARTIAL
                          </div>
                        ) : (
                          <div className="p-1 px-3 bg-rose-50 rounded-lg text-rose-600 text-[10px] font-bold">
                            OWING
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History Modal */}
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
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-900 rounded-2xl shadow-lg">
                    <History className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Payment History</h2>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent?.first_name} {selectedStudent?.last_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-all"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8">
                {loadingTransactions ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Fetching transactions...</p>
                  </div>
                ) : transactions.length > 0 ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {transactions.map((tx) => (
                        <div key={tx.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-start gap-4">
                          <div className="p-2 bg-white rounded-xl shadow-sm">
                            <Receipt className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-lg font-black text-slate-900">₦{Number(tx.amount).toLocaleString()}</p>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[9px] font-black uppercase">
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
                                <CreditCard className="w-3 h-3 text-slate-400" />
                                <p className="text-[10px] font-bold tracking-tight uppercase">REC: {tx.receipt_number}</p>
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
                    
                      {(() => {
                        const record = selectedStudent?.fee_records?.find((f: any) => 
                          f.term === selectedTerm && f.session === selectedSession
                        );
                        const expected = record ? Number(record.total_amount) : 0;
                        const paid = record ? Number(record.amount_paid) : 0;
                        const balance = expected - paid;
                        const totalDebt = (selectedStudent?.fee_records || []).reduce((sum: number, r: any) => 
                          sum + (Number(r.total_amount) - Number(r.amount_paid)), 0
                        );
                        
                        return (
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected (Term)</p>
                              <p className="text-sm font-black text-slate-900">₦{expected.toLocaleString()}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Paid (Term)</p>
                              <p className="text-sm font-black text-emerald-600">₦{paid.toLocaleString()}</p>
                            </div>
                            <div className={`p-4 rounded-2xl border text-center ${balance > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                              <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${balance > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Balance (Term)</p>
                              <p className={`text-sm font-black ${balance > 0 ? 'text-rose-600' : 'text-slate-600'}`}>₦{balance.toLocaleString()}</p>
                            </div>
                          </div>
                        );
                      })()}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-6 bg-blue-900 rounded-3xl text-white flex items-center gap-4 shadow-xl shadow-blue-100">
                          <div className="p-2 bg-white/10 rounded-xl">
                            <Wallet className="w-5 h-5 text-white/70" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Paid (All History)</p>
                            <p className="text-xl font-black tracking-tight">₦{transactions.reduce((sum, tx) => sum + Number(tx.amount), 0).toLocaleString()}</p>
                          </div>
                        </div>
                        
                        {(() => {
                           const totalDebt = (selectedStudent?.fee_records || []).reduce((sum: number, r: any) => 
                             sum + (Number(r.total_amount) - Number(r.amount_paid)), 0
                           );
                        
                          return (
                            <div className={`p-6 rounded-3xl flex items-center gap-4 shadow-xl ${
                              totalDebt > 0 ? 'bg-rose-600 text-white shadow-rose-100' : 'bg-emerald-600 text-white shadow-emerald-100'
                            }`}>
                              <div className="p-2 bg-white/10 rounded-xl">
                                <AlertCircle className="w-5 h-5 text-white/70" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                  {totalDebt > 0 ? 'Total Outstanding' : 'Fully Settled'}
                                </p>
                                <p className="text-xl font-black tracking-tight">
                                  {totalDebt > 0 ? `₦${totalDebt.toLocaleString()}` : 'CLEARED'}
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
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No payments have been recorded for this period.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-50 flex justify-end">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
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
