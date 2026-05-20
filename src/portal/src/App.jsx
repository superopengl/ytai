import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import theme from './theme.js';
import HomePage from './pages/HomePage.jsx';
import TutorPage from './pages/TutorPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProgressPage from './pages/ProgressPage.jsx';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage.jsx';
import TermsOfUsePage from './pages/TermsOfUsePage.jsx';
import LogoPage from './pages/LogoPage.jsx';

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tutor" element={<TutorPage />} />
          <Route path="/tutor/:sessionId" element={<TutorPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/privacy_policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms_of_use" element={<TermsOfUsePage />} />
          <Route path="/logo" element={<LogoPage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
