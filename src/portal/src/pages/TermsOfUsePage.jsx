import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import theme from '../theme.js';
import Logo from '../components/Logo.jsx';

const { Title, Paragraph } = Typography;

export default function TermsOfUsePage() {
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
        <Title level={1}>Terms of Use</Title>
        <Paragraph type="secondary">Last updated: May 20, 2026</Paragraph>

        <Title level={3}>Agreement</Title>
        <Paragraph>
          By using YouTutorAI you agree to these Terms of Use. If you do not agree, please do not
          use the service.
        </Paragraph>

        <Title level={3}>Who can use YouTutorAI</Title>
        <Paragraph>
          YouTutorAI is built for students aged 8–14, and the parents and teachers who help them.
          Users under 13 must have a parent or teacher request access on their behalf.
        </Paragraph>

        <Title level={3}>Acceptable use</Title>
        <Paragraph>
          You agree to use YouTutorAI for learning and tutoring only. Do not upload content that
          is unlawful, harmful, or that you do not have permission to share. Do not attempt to
          reverse-engineer, scrape, or disrupt the service.
        </Paragraph>

        <Title level={3}>AI-generated content</Title>
        <Paragraph>
          YouTutorAI uses AI models to read worksheets and tutor through questions. The AI can
          make mistakes — especially with handwriting, diagrams, or unusual notation. Always
          double-check important answers, and treat the tutor as a study aid rather than a final
          authority.
        </Paragraph>

        <Title level={3}>Your content</Title>
        <Paragraph>
          You keep ownership of the photos and messages you upload. You grant us a limited
          license to process them so the service can read, annotate, and tutor through them.
        </Paragraph>

        <Title level={3}>Service availability</Title>
        <Paragraph>
          YouTutorAI is provided “as is” without warranties of any kind. We may update, suspend,
          or discontinue features at any time. To the maximum extent permitted by law, we are
          not liable for indirect or consequential damages arising from your use of the service.
        </Paragraph>

        <Title level={3}>Changes to these terms</Title>
        <Paragraph>
          We may update these Terms from time to time. Continued use of YouTutorAI after a
          change means you accept the updated Terms.
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
