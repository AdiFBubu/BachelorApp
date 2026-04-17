import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); // helps with the "Enter" key submission and prevents page reload
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-slate-900 rounded-md border border-slate-800">
      <h2 className="text-xl font-semibold text-white mb-4">Login</h2>
      <form onSubmit={submit} className="space-y-3">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full p-2 rounded bg-slate-800 text-white" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" className="w-full p-2 rounded bg-slate-800 text-white" />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex justify-end">
          <button className="px-4 py-2 rounded bg-teal-500 text-white" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
};

export default Login;
