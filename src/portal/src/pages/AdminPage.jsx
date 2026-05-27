import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import {
  DeleteOutlined,
  LockOutlined,
  LogoutOutlined,
  MoreOutlined,
  UserOutlined
} from '@ant-design/icons';
import Logo from '../components/Logo.jsx';
import apiFetch from '../lib/apiFetch.js';
import authSession from '../lib/authSession.js';
import { palette, radius } from '../theme.js';

const { Title, Paragraph } = Typography;
const MIN_PASSWORD_LENGTH = 8;

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

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleColor(role) {
  if (role === 'admin') return 'magenta';
  if (role === 'teacher') return 'geekblue';
  if (role === 'parent') return 'gold';
  return 'green';
}

function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/users');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setUsers(json.users || []);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleClearData = useCallback(
    (row) => {
      Modal.confirm({
        title: `Clear all data for ${row.name || 'this student'}?`,
        content: (
          <div>
            <p style={{ marginTop: 0 }}>
              Every tutoring session, image, message, OCR/vision row, and analysis
              report tied to this student will be permanently deleted. The student's
              account will stay so they can sign back in to a fresh slate.
            </p>
            <p style={{ marginBottom: 0, color: palette.textMuted }}>
              This cannot be undone.
            </p>
          </div>
        ),
        okText: 'Clear data',
        okButtonProps: { danger: true },
        cancelText: 'Cancel',
        centered: true,
        async onOk() {
          try {
            const res = await apiFetch(`/api/admin/user/${row.id}/data`, {
              method: 'DELETE'
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
            const { sessions = 0, images = 0, subjectReports = 0 } = json.deleted || {};
            message.success(
              `Cleared data: ${sessions} session(s), ${images} image(s), ${subjectReports} report(s).`
            );
            load();
          } catch (e) {
            message.error(e.message || 'Failed to clear data');
            throw e;
          }
        }
      });
    },
    [load]
  );

  const columns = useMemo(
    () => [
      {
        title: 'Username',
        dataIndex: 'name',
        key: 'name',
        render: (_, row) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              src={row.picture || undefined}
              size={36}
              style={{
                background: row.picture ? 'transparent' : palette.tint.primary,
                color: palette.primary,
                fontWeight: 700
              }}
            >
              {!row.picture && initialsOf(row.name)}
            </Avatar>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: palette.text, fontWeight: 600 }}>
                {row.name || '—'}
              </span>
              <Tag color={roleColor(row.role)} style={{ marginTop: 2, alignSelf: 'flex-start' }}>
                {row.role}
              </Tag>
            </div>
          </div>
        )
      },
      {
        title: 'Email',
        dataIndex: 'email',
        key: 'email',
        render: (email) => (
          <span style={{ color: email ? palette.text : palette.textMuted }}>
            {email || '—'}
          </span>
        )
      },
      {
        title: 'Created at',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 220,
        sorter: (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        defaultSortOrder: 'descend',
        render: (iso) => (
          <span style={{ color: palette.textMuted }}>{formatDateTime(iso)}</span>
        )
      },
      {
        title: '',
        key: 'actions',
        width: 56,
        align: 'center',
        render: (_, row) => {
          const isStudent = row.role === 'student';
          const items = [
            {
              key: 'clear-data',
              danger: true,
              icon: <DeleteOutlined />,
              label: 'Clear data',
              disabled: !isStudent
            }
          ];
          const trigger = (
            <Button
              type="text"
              icon={<MoreOutlined />}
              aria-label="Row actions"
              onClick={(e) => e.stopPropagation()}
            />
          );
          return (
            <Dropdown
              trigger={['click']}
              menu={{
                items,
                onClick: ({ key }) => {
                  if (key === 'clear-data' && isStudent) handleClearData(row);
                }
              }}
            >
              {isStudent ? (
                trigger
              ) : (
                <Tooltip title="Only available for students">{trigger}</Tooltip>
              )}
            </Dropdown>
          );
        }
      }
    ],
    [handleClearData]
  );

  return (
    <div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={load}>
              Retry
            </Button>
          }
        />
      )}
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={users}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setError(null);
      setSubmitting(false);
    }
  }, [open, form]);

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      message.success('Password updated');
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Change password"
      centered
      onCancel={submitting ? undefined : onClose}
      maskClosable={!submitting}
      keyboard={!submitting}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={submitting} onClick={submit}>
          Update password
        </Button>
      ]}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark={false} preserve={false}>
        <Form.Item
          label="Current password"
          name="currentPassword"
          rules={[{ required: true, message: 'Enter your current password' }]}
        >
          <Input.Password
            autoComplete="current-password"
            prefix={<LockOutlined style={{ color: palette.textMuted }} />}
          />
        </Form.Item>
        <Form.Item
          label="New password"
          name="newPassword"
          rules={[
            { required: true, message: 'Enter a new password' },
            {
              min: MIN_PASSWORD_LENGTH,
              message: `Must be at least ${MIN_PASSWORD_LENGTH} characters`
            }
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            prefix={<LockOutlined style={{ color: palette.textMuted }} />}
          />
        </Form.Item>
        <Form.Item
          label="Confirm new password"
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Confirm the new password' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                return Promise.reject(new Error('Passwords do not match'));
              }
            })
          ]}
        >
          <Input.Password
            autoComplete="new-password"
            prefix={<LockOutlined style={{ color: palette.textMuted }} />}
            onPressEnter={submit}
          />
        </Form.Item>
        {error && <Alert type="error" showIcon message={error} style={{ marginTop: 4 }} />}
      </Form>
    </Modal>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => authSession().user);
  const isAdmin = currentUser?.role === 'admin';

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  useEffect(() => {
    document.title = 'Admin · YouTutorAI';
  }, []);

  const handleSignOut = () => {
    Modal.confirm({
      title: 'Sign out?',
      content: 'You will need to sign in again to manage users.',
      okText: 'Sign out',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      centered: true,
      onOk: () => {
        authSession().clear();
        setCurrentUser(null);
        navigate('/');
      }
    });
  };

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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '4px 0',
              marginBottom: 16
            }}
          >
            <Logo height={24} />
            <Space size={8}>
              <Button
                icon={<LockOutlined />}
                onClick={() => setChangePasswordOpen(true)}
              >
                Change password
              </Button>
              <Button
                danger
                type="primary"
                icon={<LogoutOutlined />}
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </Space>
          </div>
          <Tabs
            defaultActiveKey="users"
            type="card"
            items={[
              {
                key: 'users',
                label: 'Users',
                children: <UsersPanel />
              }
            ]}
          />
          <ChangePasswordModal
            open={changePasswordOpen}
            onClose={() => setChangePasswordOpen(false)}
          />
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
