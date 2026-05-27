import { ConfigProvider } from 'antd';
import theme from './theme.js';

// Wraps signed-in routes in the AntD ConfigProvider. Lifted into its own
// module so it can be loaded lazily — the public HomePage doesn't import
// antd at all, which lets vendor-antd stay out of the initial bundle and
// only load when the user navigates to a route that actually needs it.
export default function AntdShell({ children }) {
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}
