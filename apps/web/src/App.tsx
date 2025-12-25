import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router';
import { Layout } from '@/shared/Layout';
import { Home } from '@/features/home/Home';
import { Login } from '@/features/auth/Login';
import { Dashboard } from '@/features/dashboard/Dashboard';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;
