import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import theme from './theme.js';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import TutorPage from './pages/TutorPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          {/* <Route path="/" element={<HomePage />} /> */}
          <Route path="/" element={<TutorPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tutor/:sessionId" element={<TutorPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
