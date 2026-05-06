import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase using environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [dailyLimit, setDailyLimit] = useState(500);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Backup state for Undo functionality
  const [undoBackup, setUndoBackup] = useState(null);

  // Reference for the date picker
  const dateInputRef = useRef(null);

  // Fetch initial data from Supabase
  useEffect(() => {
    async function loadData() {
      const [settingsRes, txnsRes] = await Promise.all([
        supabase.from('budget_settings').select('*').eq('id', 1).single(),
        supabase.from('budget_transactions').select('*')
      ]);

      if (settingsRes.data) {
        setDailyLimit(settingsRes.data.daily_limit);
        setStartDate(settingsRes.data.start_date);
      }
      if (txnsRes.data) {
        setTransactions(txnsRes.data);
      }
      setIsLoading(false);
    }
    loadData();
  }, []);

  // Update Limit in DB
  const updateDailyLimit = async (newLimit) => {
    setDailyLimit(newLimit);
    await supabase.from('budget_settings').update({ daily_limit: newLimit }).eq('id', 1);
  };

  // Date Navigation Helper
  const changeDate = (days) => {
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + days);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const d2 = String(d.getDate()).padStart(2, '0');
    setSelectedDateStr(`${y}-${m}-${d2}`);
  };

  // --- CALCULATIONS ---

  // 1. Selected Day Spend
  const selectedSpend = transactions
    .filter(txn => txn.txn_date === selectedDateStr)
    .reduce((sum, txn) => sum + Number(txn.amount), 0);

  // 2. Global Lifetime Stash
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDateStr === todayStr;

  const [tYear, tMonth, tDay] = todayStr.split('-');
  const todayDate = new Date(tYear, tMonth - 1, tDay);

  const [sYear, sMonth, sDay] = startDate.split('-');
  const start = new Date(sYear, sMonth - 1, sDay);

  const totalDaysElapsed = Math.floor((todayDate - start) / (1000 * 60 * 60 * 24)) + 1;
  const totalLifetimeSpend = transactions.reduce((sum, txn) => sum + Number(txn.amount), 0);

  const accumulatedLeftover = (totalDaysElapsed * dailyLimit) - totalLifetimeSpend;

  // --- ACTIONS ---

  const startEdit = (txn) => {
    setEditingId(txn.id);
    setAmount(txn.amount);
    setDescription(txn.description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAmount('');
    setDescription('');
  };

  const deleteTransaction = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    const { error } = await supabase.from('budget_transactions').delete().eq('id', id);
    if (!error) {
      setTransactions(transactions.filter(t => t.id !== id));
    }
  };

  const handleReset = async () => {
    if (!window.confirm("WARNING: This will wipe out ALL your expenses!")) return;
    setUndoBackup([...transactions]);
    const { error } = await supabase.from('budget_transactions').delete().not('id', 'is', null);
    if (!error) {
      setTransactions([]);
    }
  };

  const handleUndo = async () => {
    if (!undoBackup || undoBackup.length === 0) return;
    const { error } = await supabase.from('budget_transactions').insert(undoBackup);
    if (!error) {
      setTransactions(undoBackup);
      setUndoBackup(null);
    }
  };

  const logTransaction = async (e) => {
    e.preventDefault();
    if (!amount) return;

    if (editingId) {
      const { data, error } = await supabase
        .from('budget_transactions')
        .update({ amount: Number(amount), description: description || 'Miscellaneous' })
        .eq('id', editingId)
        .select();

      if (!error && data) {
        setTransactions(transactions.map(t => t.id === editingId ? data[0] : t));
        cancelEdit();
      }
    } else {
      const newTxn = {
        amount: Number(amount),
        description: description || 'Miscellaneous',
        txn_date: selectedDateStr
      };

      const { data, error } = await supabase.from('budget_transactions').insert([newTxn]).select();
      if (!error && data) {
        setTransactions([...transactions, data[0]]);
        setAmount('');
        setDescription('');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex justify-center items-center">
        <p className="text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          Unlocking Stash...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 transition-colors">
      <div className="max-w-md mx-auto bg-slate-50 rounded-xl shadow-lg space-y-6 p-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800">Pocket Stash</h1>
          <div className="flex items-center space-x-2">
            <label className="text-xs text-slate-500 uppercase font-bold">Limit / Day</label>
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => updateDailyLimit(Number(e.target.value))}
              className="w-20 p-1 border rounded text-right bg-white outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-5 border rounded-xl shadow-sm transition-all duration-300 ${accumulatedLeftover < 0 ? 'bg-rose-100 border-rose-200' : 'bg-emerald-100 border-emerald-200'}`}>
            <p className={`text-xs uppercase font-bold tracking-wider mb-1 ${accumulatedLeftover < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Lifetime Stash</p>
            <p className={`text-3xl font-black ${accumulatedLeftover < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              ₹{accumulatedLeftover}
            </p>
          </div>

          <div className="p-5 bg-slate-200 border border-slate-300 rounded-xl shadow-sm">
            <p className="text-xs text-slate-700 uppercase font-bold tracking-wider mb-1">Day's Spend</p>
            <p className="text-3xl font-black text-slate-800">
              ₹{selectedSpend}
            </p>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={logTransaction} className={`space-y-3 p-5 rounded-xl shadow-sm border transition-all ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
          <div className="flex space-x-3">
            <input
              type="number"
              placeholder="₹ Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-1/3 border-b-2 border-slate-200 focus:border-blue-500 outline-none p-2 bg-transparent font-medium"
              required
            />
            <input
              type="text"
              placeholder="What was it for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-2/3 border-b-2 border-slate-200 focus:border-blue-500 outline-none p-2 bg-transparent"
            />
          </div>

          <button type="submit" className={`w-full mt-4 text-white font-bold py-3 rounded-lg transition-colors ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 hover:bg-slate-700'}`}>
            {editingId ? 'Update Expense' : 'Stash Expense'}
          </button>

          {editingId && (
            <button type="button" onClick={cancelEdit} className="w-full mt-2 bg-slate-200 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-300 transition-colors">
              Cancel
            </button>
          )}
        </form>

        {/* Daily Ledger */}
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-slate-200 p-2 rounded-lg relative">
            <button onClick={() => changeDate(-1)} className="text-slate-600 hover:text-slate-900 font-bold px-3 py-1 bg-white rounded shadow-sm hover:shadow transition-shadow z-10 relative">&lt;</button>

            <div
              className="flex-1 flex justify-center items-center h-full cursor-pointer group"
              onClick={() => dateInputRef.current && dateInputRef.current.showPicker()}
            >
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wider group-hover:text-slate-900 transition-colors">
                {isToday ? "Today" : selectedDateStr}
              </span>
              <input
                type="date"
                ref={dateInputRef}
                value={selectedDateStr}
                onChange={(e) => setSelectedDateStr(e.target.value)}
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
              />
            </div>

            <button onClick={() => changeDate(1)} className="text-slate-600 hover:text-slate-900 font-bold px-3 py-1 bg-white rounded shadow-sm hover:shadow transition-shadow z-10 relative">&gt;</button>
          </div>

          {transactions.filter(t => t.txn_date === selectedDateStr).length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-4">No expenses logged for this date.</p>
          ) : (
            <ul className="space-y-2">
              {transactions.filter(t => t.txn_date === selectedDateStr).map(txn => (
                <li key={txn.id} className={`flex flex-col p-3 bg-white border rounded-lg shadow-sm transition-all ${editingId === txn.id ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-100'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-700 font-medium">{txn.description}</span>
                    <span className="font-bold text-slate-800 text-lg">₹{txn.amount}</span>
                  </div>
                  <div className="flex justify-end space-x-3 mt-2 border-t border-slate-50 pt-2">
                    <button onClick={() => startEdit(txn)} className="text-blue-500 hover:text-blue-700 transition-colors p-1" title="Edit">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                    </button>
                    <button onClick={() => deleteTransaction(txn.id)} className="text-red-400 hover:text-red-600 transition-colors p-1" title="Delete">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reset & Undo Actions */}
        <div className="pt-6 border-t border-slate-200 mt-6 flex justify-between items-center">
          <button
            onClick={handleReset}
            className="text-xs text-rose-500 hover:text-rose-700 font-bold uppercase tracking-wide px-3 py-2 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors">
            Reset Everything
          </button>

          <button
            onClick={handleUndo}
            disabled={!undoBackup}
            title="Undo Reset"
            className={`p-2 rounded-full transition-colors ${undoBackup ? 'text-blue-600 bg-blue-50 hover:bg-blue-100 cursor-pointer shadow-sm' : 'text-slate-400 bg-slate-100 cursor-not-allowed'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>

      </div>
    </div>
  );
}
