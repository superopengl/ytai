import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import theme from '../theme.js';
import Logo from '../components/Logo.jsx';

const { Title, Paragraph } = Typography;

export default function PrivacyPolicyPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.token.colorBgLayout,
        padding: '48px 24px',
        color: theme.token.colorTextBase
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link to="/" aria-label="YouTutorAI home" style={{ display: 'inline-block', marginBottom: 32 }}>
          <Logo height={40} />
        </Link>
        <Title level={1}>Privacy Policy</Title>
        <Paragraph type="secondary">Last updated: May 20, 2026</Paragraph>

        <Title level={3}>Who we are</Title>
        <Paragraph>
          YouTutorAI is an AI-powered homework and exam tutor designed for students aged 8–14, and
          the parents and teachers who help them. This Privacy Policy explains what information we
          collect, how we use it, and the choices you have.
        </Paragraph>

        <Title level={3}>What we collect</Title>
        <Paragraph>
          <ul>
            <li>
              <b>Account info.</b> The name and role (student, parent, or teacher) you provide at
              sign-up.
            </li>
            <li>
              <b>Photos you upload.</b> Pictures of worksheets, exams, or notes you snap or upload
              during a tutoring session.
            </li>
            <li>
              <b>Tutoring conversations.</b> The messages you send and the AI tutor’s responses,
              along with any on-photo annotations you draw.
            </li>
            <li>
              <b>Usage data.</b> Aggregated technical info (page views, token usage, error logs)
              we use to keep the service running.
            </li>
          </ul>
        </Paragraph>

        <Title level={3}>How we use it</Title>
        <Paragraph>
          We use your information to power the tutoring experience: reading the worksheet,
          remembering the active session, and generating age-appropriate explanations. We do not
          sell personal data, and we do not use student conversations to train third-party models.
        </Paragraph>

        <Title level={3}>How long we keep it</Title>
        <Paragraph>
          We keep your data indefinitely — the system does not auto-purge sessions, images, or
          transcripts. You stay in control: delete a session yourself and its photos, documents,
          and chat history are permanently removed.
        </Paragraph>
        <Paragraph>
          LLM token-usage records (model, token counts, cost) are kept forever for billing and
          audit purposes. These records contain no personal data — no prompts, no responses, no
          images, just the metering numbers.
        </Paragraph>

        <Title level={3}>Children’s privacy</Title>
        <Paragraph>
          YouTutorAI is intended for students aged 8–14, and accounts for under-13 users require
          a parent or teacher to request access on their behalf. We collect the minimum
          information needed to deliver the service.
        </Paragraph>

        <Title level={3}>Contact</Title>
        <Paragraph>
          Questions? Visit{' '}
          <a href="https://www.techseeding.com.au" target="_blank" rel="noreferrer">
            https://www.techseeding.com.au
          </a>
          .
        </Paragraph>
      </div>
    </div>
  );
}
