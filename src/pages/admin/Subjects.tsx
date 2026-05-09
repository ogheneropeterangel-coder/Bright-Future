import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Subject } from '../../types';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  X,
  Loader2,
  BookOpen
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

export default function Subjects() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isExamOfficer = profile?.role === 'exam_officer';
  const canManage = isAdmin || isExamOfficer;

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  const [formData, setFormData] = useState({
    subject_name: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const { data, error } = await supabase.from('subjects').select('*').order('subject_name');
      if (error) throw error;
      setSubjects(data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) {
      toast.error('Only administrators and exam officers can manage subjects');
      return;
    }
    setIsSubmitting(true);

    try {
      if (editingSubject) {
        const { error } = await supabase
          .from('subjects')
          .update({ subject_name: formData.subject_name })
          .eq('id', editingSubject.id);
        if (error) throw error;
        toast.success('Subject updated successfully');
      } else {
        const { error } = await supabase.from('subjects').insert([{
          subject_name: formData.subject_name,
        }]);
        if (error) throw error;
        toast.success('Subject added successfully');
      }

      setIsModalOpen(false);
      setEditingSubject(null);
      setFormData({ subject_name: '' });
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<number | null>(null);

  async function handleDelete(id: number) {
    if (!canManage) {
      toast.error('Only administrators and exam officers can delete subjects');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('subjects').delete().eq('id', id);
      if (error) throw error;
      toast.success('Subject deleted');
      if (editingSubject?.id === id) {
        setIsModalOpen(false);
        setEditingSubject(null);
      }
      setIsDeleteModalOpen(false);
      setSubjectToDelete(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({ subject_name: subject.subject_name });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingSubject(null);
    setFormData({ subject_name: '' });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subjects Management</h1>
          <p className="text-slate-500">Define the curriculum for your school.</p>
        </div>
        {canManage && (
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse border border-slate-100"></div>)
        ) : subjects.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-100">No subjects defined yet.</div>
        ) : (
          subjects.map((subject) => (
            <div key={subject.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-orange-600">
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="font-semibold text-slate-900">{subject.subject_name}</span>
              </div>
              <div className="flex items-center gap-1">
                {canManage && (
                  <>
                    <button 
                      onClick={() => handleEdit(subject)}
                      className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Edit Subject"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setSubjectToDelete(subject.id);
                        setIsDeleteModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                      title="Delete Subject"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Subject Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">
                {editingSubject ? 'Edit Subject' : 'Add New Subject'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject Name</label>
                <input
                  required
                  type="text"
                  value={formData.subject_name}
                  onChange={(e) => setFormData({...formData, subject_name: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Mathematics"
                />
              </div>
              <div className="flex justify-between items-center mt-6">
                {editingSubject && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubjectToDelete(editingSubject.id);
                      setIsDeleteModalOpen(true);
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2 text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Subject
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center gap-2 font-bold">
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingSubject ? 'Update Subject' : 'Save Subject'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Subject?</h3>
              <p className="text-slate-500 mb-6">
                This action will permanently delete this subject. This cannot be undone. Are you absolutely sure you want to proceed?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setSubjectToDelete(null);
                  }}
                  className="flex-1 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => subjectToDelete && handleDelete(subjectToDelete)}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 disabled:opacity-70 flex items-center justify-center gap-2 font-bold"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
