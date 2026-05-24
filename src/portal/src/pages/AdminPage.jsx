import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input, Modal, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import authSession from '../lib/authSession.js';
import { palette, radius } from '../theme.js';

const { Title, Paragraph } = Typography;

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => authSession().user);
  const isAdmin = currentUser?.role === 'admin';

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Admin · YouTutorAI';
  }, []);

  const submit = async () => {
    if (!userName.trim() || !password) {
      setError('Username and password are required');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const data = await postJson('/api/auth/password', {
        userName: userName.trim(),
        password
      });
      if (data.user.role !== 'admin') {
        setError('Only admin users can sign in here');
        return;
      }
      authSession().save(data);
      setCurrentUser(data.user);
      setUserName('');
      setPassword('');
      message.success(`Welcome, ${data.user.name}!`);
    } catch (e) {
      setError(e.message || 'Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: palette.bg,
        color: palette.text,
        padding: 24
      }}
    >
      {isAdmin && (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Title level={2} style={{ marginTop: 0, color: palette.text }}>
            Admin
          </Title>
          <Paragraph style={{ color: palette.textMuted }}>
            Signed in as <strong style={{ color: palette.text }}>{currentUser.name}</strong>.
          </Paragraph>
        </div>
      )}

      <Modal
        open={!isAdmin}
        title="Admin sign-in"
        centered
        maskClosable={false}
        keyboard={false}
        closable={false}
        footer={[
          <Button key="cancel" onClick={() => navigate('/')}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={submitting}
            onClick={submit}
            disabled={!userName.trim() || !password}
          >
            Sign in
          </Button>
        ]}
      >
        <Paragraph style={{ color: palette.textMuted, marginTop: 0 }}>
          Admin-only area. Other users should sign in from the home page.
        </Paragraph>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input
            size="large"
            autoComplete="username"
            placeholder="Username"
            value={userName}
            onChange={(e) => {
              setUserName(e.target.value);
              setError(null);
            }}
            prefix={<UserOutlined style={{ color: palette.textMuted }} />}
            style={{ height: 48, borderRadius: radius.md }}
            autoFocus
          />
          <Input.Password
            size="large"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            onPressEnter={submit}
            prefix={<LockOutlined style={{ color: palette.textMuted }} />}
            style={{ height: 48, borderRadius: radius.md }}
          />
          {error && <Alert type="error" showIcon message={error} />}
        </div>
      </Modal>
    </div>
  );
}
