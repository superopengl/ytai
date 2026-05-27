import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import authSession from './lib/authSession.js';

// AntdShell carries ConfigProvider — pulling it into its own lazy chunk
// keeps the antd vendor bundle off the public HomePage's critical path.
const AntdShell = lazy(() => import('./AntdShell.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const TutorPage = lazy(() => import('./pages/TutorPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage.jsx'));
const TermsOfUsePage = lazy(() => import('./pages/TermsOfUsePage.jsx'));
const LogoPage = lazy(() => import('./pages/LogoPage.jsx'));

// Every signed-in / antd-using route is wrapped in the lazy AntdShell.
// One Suspense covers both the shell chunk and the page chunk; React
// loads them in parallel and shows the page once both resolve.
function lazyAntdRoute(element) {
  return (
    <Suspense fallback={null}>
      <AntdShell>{element}</AntdShell>
    </Suspense>
  );
}

// /tutor is a student/parent/teacher experience. Admins land here only by
// typing the URL — bounce them back to /admin so the kid-facing flow stays
// out of the admin role's path.
function StudentRoute({ children }) {
  if (authSession().user?.role === 'admin') return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={lazyAntdRoute(<LoginPage />)} />
        <Route
          path="/tutor"
          element={<StudentRoute>{lazyAntdRoute(<TutorPage />)}</StudentRoute>}
        />
        <Route
          path="/tutor/:sessionId"
          element={<StudentRoute>{lazyAntdRoute(<TutorPage />)}</StudentRoute>}
        />
        <Route path="/admin" element={lazyAntdRoute(<AdminPage />)} />
        <Route path="/reports" element={lazyAntdRoute(<ReportsPage />)} />
        <Route path="/privacy_policy" element={lazyAntdRoute(<PrivacyPolicyPage />)} />
        <Route path="/terms_of_use" element={lazyAntdRoute(<TermsOfUsePage />)} />
        <Route path="/logo" element={lazyAntdRoute(<LogoPage />)} />
      </Routes>
    </BrowserRouter>
  );
}
