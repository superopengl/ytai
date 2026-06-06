import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { palette } from '../theme.js';

const { overlay: OVERLAY } = palette;

// Renders an assistant message as markdown with GFM extensions (lists,
// tables, strikethrough) and KaTeX math ($x^2$, $$...$$). Anchor styling
// opens links in a new tab; everything else inherits the bubble's color
// and line-height. The wrapper element trims first/last child margins so
// paragraphs don't add empty space inside the bubble.

// remark-math 6 treats every `$` as a math delimiter and does NOT honor
// `\$` escapes, so currency the LLM emits ("$24.00 ... $206.00") gets
// pair-matched as a math span. We sidestep this by mapping `$` that's
// followed by a digit (currency open) to a private-use Unicode char
// before parsing, and restoring it to `$` in text nodes after remark-math
// has finished — so `$x^2$` still parses as math but `$24.00` renders as
// plain currency.
const CURRENCY_PLACEHOLDER = '';
const CURRENCY_RE = /\\?\$(?=\d)/g;

function escapeCurrency(src) {
  return typeof src === 'string' ? src.replace(CURRENCY_RE, CURRENCY_PLACEHOLDER) : src;
}

function restoreCurrencyInTree(node) {
  if (!node) return;
  if (node.type === 'text' && typeof node.value === 'string' && node.value.includes(CURRENCY_PLACEHOLDER)) {
    node.value = node.value.split(CURRENCY_PLACEHOLDER).join('$');
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) restoreCurrencyInTree(child);
  }
}

function rehypeRestoreCurrency() {
  return (tree) => restoreCurrencyInTree(tree);
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex, rehypeRestoreCurrency];

const components = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }} />
  ),
  // react-markdown v9+ dropped the `inline` flag; instead, fenced blocks
  // come wrapped in <pre><code>. We style the two elements separately:
  // <code> gets inline styling and <pre> overrides it for block context.
  code: ({ className, children, ...props }) => (
    <code
      {...props}
      className={className}
      style={{
        background: OVERLAY.inkVeil,
        padding: '0 4px',
        borderRadius: 4,
        fontSize: '0.9em'
      }}
    >
      {children}
    </code>
  ),
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      style={{
        background: OVERLAY.inkVeil,
        padding: 10,
        borderRadius: 8,
        margin: '6px 0',
        overflowX: 'auto',
        fontSize: '0.9em'
      }}
    >
      {children}
    </pre>
  ),
  p: ({ node, ...props }) => <p {...props} style={{ margin: '0 0 6px' }} />,
  ul: ({ node, ordered, ...props }) => <ul {...props} style={{ margin: '0 0 6px', paddingLeft: 20 }} />,
  ol: ({ node, ordered, ...props }) => <ol {...props} style={{ margin: '0 0 6px', paddingLeft: 20 }} />,
  li: ({ node, ordered, checked, ...props }) => <li {...props} style={{ margin: '2px 0' }} />,
  h1: ({ node, ...props }) => <h3 {...props} style={{ margin: '4px 0 6px', fontSize: '1.05em' }} />,
  h2: ({ node, ...props }) => <h3 {...props} style={{ margin: '4px 0 6px', fontSize: '1.05em' }} />,
  h3: ({ node, ...props }) => <h3 {...props} style={{ margin: '4px 0 6px', fontSize: '1.05em' }} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      {...props}
      style={{
        borderLeft: `3px solid ${OVERLAY.inkQuote}`,
        margin: '4px 0',
        padding: '0 8px',
        opacity: 0.85
      }}
    />
  ),
  table: ({ node, ...props }) => (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table {...props} style={{ borderCollapse: 'collapse', fontSize: '0.95em' }} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th {...props} style={{ border: `1px solid ${OVERLAY.inkRule}`, padding: '4px 8px', background: OVERLAY.inkSheen }} />
  ),
  td: ({ node, ...props }) => (
    <td {...props} style={{ border: `1px solid ${OVERLAY.inkRule}`, padding: '4px 8px' }} />
  )
};

export default function MarkdownMessage({ children }) {
  return (
    <div className="ytai-md">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components}>
        {escapeCurrency(children)}
      </ReactMarkdown>
      <style>{`.ytai-md > :first-child { margin-top: 0; } .ytai-md > :last-child { margin-bottom: 0; }`}</style>
    </div>
  );
}
