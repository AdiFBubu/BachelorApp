import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { UserRole } from '../hooks/useAuth';

export const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('DOCTOR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register(email, password, role);
    } catch (err: any) {
      setError(err.message || 'Registration error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-md border border-slate-800">
      <h2 className="text-xl font-semibold text-white mb-4">Create account</h2>
      <form onSubmit={submit} className="space-y-3">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full p-2 rounded bg-slate-800 text-white" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="w-full p-2 rounded bg-slate-800 text-white" />
        <div className="rounded bg-slate-800/70 p-3 border border-slate-700">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Role</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('DOCTOR')}
              className={`rounded px-3 py-2 text-sm border ${
                role === 'DOCTOR'
                  ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              Doctor
            </button>
            <button
              type="button"
              onClick={() => setRole('ADMIN')}
              className={`rounded px-3 py-2 text-sm border ${
                role === 'ADMIN'
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              Administrative
            </button>
          </div>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex justify-end">
          <button className="px-4 py-2 rounded bg-emerald-500 text-white" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
        </div>
      </form>
    </div>
  );
};

export default Register;
