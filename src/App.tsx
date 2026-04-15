import AuthShell from './auth/AuthShell';
import { useAuth } from './hooks/useAuth';
import DoctorDashboard from './doctor/DoctorDashboard';
import AdminDashboard from './admin/AdminDashboard';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <AuthShell />
      </div>
    );
  }

  if (user.role === 'ADMIN') {
    return <AdminDashboard />;
  }

  return <DoctorDashboard />;
}

export default App;
