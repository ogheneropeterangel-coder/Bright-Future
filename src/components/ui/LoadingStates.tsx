import React from 'react';
import { motion } from 'motion/react';

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full"
    />
  </div>
);

export const DashboardSkeleton = () => (
  <div className="p-8 space-y-8 animate-pulse">
    {/* Page Header Skeleton */}
    <div className="flex justify-between items-center">
      <div className="space-y-3">
        <div className="h-8 w-64 bg-slate-200 rounded-lg"></div>
        <div className="h-4 w-48 bg-slate-100 rounded-lg"></div>
      </div>
      <div className="h-12 w-32 bg-slate-200 rounded-xl"></div>
    </div>

    {/* Stats Grid Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-32 bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
          <div className="flex justify-between">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl"></div>
            <div className="w-20 h-4 bg-slate-100 rounded-lg"></div>
          </div>
          <div className="h-6 w-24 bg-slate-200 rounded-lg"></div>
        </div>
      ))}
    </div>

    {/* Table/Content Area Skeleton */}
    <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-8 border-b border-slate-50 flex justify-between">
        <div className="h-6 w-32 bg-slate-200 rounded-lg"></div>
        <div className="flex space-x-4">
          <div className="h-10 w-48 bg-slate-100 rounded-xl"></div>
          <div className="h-10 w-10 bg-slate-100 rounded-xl"></div>
        </div>
      </div>
      <div className="p-8 space-y-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-slate-100 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-full bg-slate-50 rounded-lg"></div>
              <div className="h-3 w-2/3 bg-slate-50/50 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const LoadingPage = () => (
  <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center space-y-4">
    <LoadingSpinner />
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-slate-500 font-medium animate-pulse"
    >
      Optimizing your dashboard...
    </motion.p>
  </div>
);
