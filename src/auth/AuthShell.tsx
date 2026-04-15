import { useState } from 'react';
import Login from './Login';
import Register from './Register';

export const AuthShell = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="w-full max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-center space-x-4">
        <button
          onClick={() => setMode('login')}
          className={`px-4 py-2 rounded ${mode === 'login' ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-300'}`}
        >
          Sign in
        </button>
        <button
          onClick={() => setMode('register')}
          className={`px-4 py-2 rounded ${mode === 'register' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-300'}`}
        >
          Create account
        </button>
      </div>

      {mode === 'login' ? <Login /> : <Register />}
    </div>
  );
};

export default AuthShell;
