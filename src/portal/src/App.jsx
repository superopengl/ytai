import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import theme from './theme.js';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import TutorPage from './pages/TutorPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx';
import TermsOfUsePage from './pages/TermsOfUsePage.jsx';

const LogoPage = lazy(() => import('./pages/LogoPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/tutor/:sessionId" element={<TutorPage />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={null}>
                <AdminPage />
              </Suspense>
            }
          />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/privacy_policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms_of_use" element={<TermsOfUsePage />} />
          <Route
            path="/logo"
            element={
              <Suspense fallback={null}>
                <LogoPage />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
