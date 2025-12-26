import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/app/router';
import { Layout } from '@/shared/Layout';
import { Login } from '@/features/auth/Login';
import { Register } from '@/features/auth/Register';
import { RegisterSuccess } from '@/features/auth/RegisterSuccess';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { Dashboard } from '@/features/dashboard/Dashboard';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/register" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register/success" element={<RegisterSuccess />} />
      <Route path="/auth/verify" element={<VerifyEmail />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;
