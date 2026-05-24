import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import theme from './theme.js';
import HomePage from './pages/HomePage.jsx';

const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const TutorPage = lazy(() => import('./pages/TutorPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage.jsx'));
const TermsOfUsePage = lazy(() => import('./pages/TermsOfUsePage.jsx'));
const LogoPage = lazy(() => import('./pages/LogoPage.jsx'));

// Wrap every lazy route element in a single Suspense — fallback=null avoids
// a flash of placeholder while the chunk loads. HomePage stays eager so the
// landing page paints without an extra round trip.
function lazyRoute(element) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={lazyRoute(<LoginPage />)} />
          <Route path="/tutor" element={lazyRoute(<TutorPage />)} />
          <Route path="/tutor/:sessionId" element={lazyRoute(<TutorPage />)} />
          <Route path="/admin" element={lazyRoute(<AdminPage />)} />
          <Route path="/reports" element={lazyRoute(<ReportsPage />)} />
          <Route path="/privacy_policy" element={lazyRoute(<PrivacyPolicyPage />)} />
          <Route path="/terms_of_use" element={lazyRoute(<TermsOfUsePage />)} />
          <Route path="/logo" element={lazyRoute(<LogoPage />)} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
