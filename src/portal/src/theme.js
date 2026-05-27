// AntDesign default light theme palette for YouTutorAI.
//
// Color tokens follow Ant Design's seed + derived defaults:
//   * Soft Daybreak Blue primary (#4096ff), Polar Green success (#52c41a),
//     Calendula Gold warning (#faad14), Dust Red error (#ff4d4f).
//   * Neutral surfaces use Ant's grey ramp (#fff / #fafafa / #f5f5f5 /
//     #f0f0f0 / #d9d9d9) so panels read as Ant Design out of the box.
//   * Text uses Ant's black-alpha scale (88/65/45/25%).
//   * Borders are #d9d9d9 (primary hairline) and #f0f0f0 (secondary).
//
// `theme` is consumed by ConfigProvider. `palette`, `stickerShadow`, and
// `radius` are exported for direct use in JSX. CSS classes (.sticker-card,
// .sticker-press, …) live in styles/clay.css and own the hover behavior.
// The "sticker" prefix is historical and preserved for API compatibility.

const PRIMARY = '#4096FF';       // Daybreak Blue 5 — softer Ant primary
const PRIMARY_DARK = '#1677FF';  // Daybreak Blue 6 — hover/active
const SECONDARY = '#722ED1';     // Golden Purple 6 — complementary accent
const SECONDARY_DARK = '#531DAB'; // Golden Purple 7
const CTA = '#4096FF';           // CTA shares primary
const CTA_DARK = '#1677FF';
const ACCENT_MINT = '#B7EB8F';   // Polar Green 3 — soft success tint
const ACCENT_PURPLE = '#F9F0FF'; // Golden Purple 1 — pale lavender tint
const ACCENT_YELLOW = '#FFFBE6'; // Calendula Gold 1 — pale yellow tint
const ACCENT_PEACH = '#FFD591';  // Sunset Orange 3 — soft warm tint
const SUCCESS = '#52C41A';       // Polar Green 6
const ERROR = '#FF4D4F';         // Dust Red 5

const BG = '#F5F5F5';            // Ant grey-3 — page bg / colorBgLayout
const BG_PAPER = '#FAFAFA';      // Ant grey-2 — paper-like surface
const BG_PANEL = '#F0F0F0';      // Ant grey-4 — recessed panel
const BG_BUBBLE = '#F5F5F5';     // assistant chat bubbles
const SURFACE = '#FFFFFF';
const SURFACE_OAT = '#FAFAFA';   // Ant grey-2 — menu hover, table header
const SURFACE_OAT_DARK = '#F0F0F0';
const TEXT = 'rgba(0, 0, 0, 0.88)';        // colorText
const TEXT_MUTED = 'rgba(0, 0, 0, 0.65)';  // colorTextSecondary
const TEXT_INK_SOFT = 'rgba(0, 0, 0, 0.88)';
const TEXT_HINT = 'rgba(0, 0, 0, 0.45)';   // colorTextTertiary
const TEXT_DISABLED = 'rgba(0, 0, 0, 0.25)'; // colorTextQuaternary
const BORDER = '#D9D9D9';        // colorBorder — Ant grey-5
const BORDER_SOFT = '#F0F0F0';   // colorBorderSecondary — Ant grey-4

// Semantic state colors used in stats panels, validation feedback, etc.
const STATE_CORRECT = '#52C41A'; // Polar Green 6 — "got it right"
const STATE_WRONG = '#FF4D4F';   // Dust Red 5 — "struggled with"

// Sider / dark-mode strip used for the session list.
const SIDER = {
  bg: '#001529',
  border: '#1F1F1F',
  textPrimary: 'rgba(255, 255, 255, 0.85)',
  textMuted: 'rgba(255, 255, 255, 0.45)',
  activeBg: '#4096FF',
  accent: PRIMARY,
  danger: ERROR
};

// Pen palette for the annotation canvas. NOT brand colors — the box of pens
// the student picks from when drawing on a worksheet. Mapped to Ant preset
// colors so marks read clearly on top of any worksheet color.
const PENS = {
  red: '#FF4D4F',     // Dust Red 5
  green: '#52C41A',   // Polar Green 6
  orange: '#FA8C16',  // Sunset Orange 6
  purple: '#722ED1',  // Golden Purple 6
  ink: '#000000',
  yellow: '#FADB14',  // Sunrise Yellow 6
  cyan: '#13C2C2'     // Cyan 6
};
const PEN_PRESETS = [PENS.red, PENS.green, PENS.orange, PENS.purple, PENS.ink, PENS.yellow, PENS.cyan];
const AI_ANNOTATION_DEFAULT = PRIMARY;     // Daybreak Blue, default fill for AI annotations
const CANVAS_VOID = '#1F1F1F';              // dark grey behind the worksheet on the canvas

// Subject palette — math/thinking/reading/writing each have a swatch + a
// pale tint. Aligned to Ant Design preset color ramps.
const SUBJECTS = {
  math: { color: '#4096FF', tint: '#E6F4FF' },     // Blue 5 / Blue 1
  thinking: { color: '#722ED1', tint: '#F9F0FF' }, // Purple 6 / Purple 1
  reading: { color: '#52C41A', tint: '#F6FFED' },  // Green 6 / Green 1
  writing: { color: '#FAAD14', tint: '#FFFBE6' }   // Gold 6 / Gold 1
};

// Text colors used on dark surfaces (footer, sider, scrim ribbons).
const ON_DARK = {
  text: 'rgba(255, 255, 255, 0.85)',
  textMuted: 'rgba(255, 255, 255, 0.45)'
};

// Common overlays — kept as named constants so call sites don't sprinkle
// rgba() literals.
const OVERLAY = {
  // Modal-mask scrim, matches Ant colorBgMask.
  scrim: 'rgba(0, 0, 0, 0.45)',
  inkSheen: 'rgba(0, 0, 0, 0.03)',
  inkVeil: 'rgba(0, 0, 0, 0.06)',
  inkRule: 'rgba(0, 0, 0, 0.10)',
  inkQuote: 'rgba(0, 0, 0, 0.15)',
  // Ruled-paper hero accent, in primary blue.
  paperRule: 'rgba(64, 150, 255, 0.12)',
  // Subtle neutral ink shadow used inside stickerShadow.
  inkSoft: 'rgba(0, 0, 0, 0.08)'
};

// Soft drop-shadow pairs. Naming preserved for API compatibility — values
// are tuned to Ant Design's neutral shadow language (light grey diffusion,
// no colored highlight).
const SHADOW_LIGHT = '0 1px 2px -2px rgba(0, 0, 0, 0.16)';
const SHADOW_DARK = '0 3px 6px 0 rgba(0, 0, 0, 0.12)';
const SHADOW_LIGHT_SM = '0 1px 2px 0 rgba(0, 0, 0, 0.03)';
const SHADOW_DARK_SM = '0 1px 6px -1px rgba(0, 0, 0, 0.08)';
const SHADOW_LIGHT_XS = '0 1px 2px 0 rgba(0, 0, 0, 0.03)';
const SHADOW_DARK_XS = '0 1px 4px -1px rgba(0, 0, 0, 0.06)';
const SHADOW_INSET_LIGHT = 'inset 0 0 0 1px rgba(0, 0, 0, 0.04)';
const SHADOW_INSET_DARK = 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.08)';

const stickerShadow = {
  card: `${SHADOW_LIGHT}, ${SHADOW_DARK}, 0 9px 28px 8px rgba(0, 0, 0, 0.05)`,
  cardHover: `0 6px 16px 0 rgba(0, 0, 0, 0.10), 0 3px 6px -4px rgba(0, 0, 0, 0.14), 0 9px 28px 8px rgba(0, 0, 0, 0.06)`,
  button: `${SHADOW_LIGHT_SM}, ${SHADOW_DARK_SM}`,
  buttonHover: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}`,
  chip: `${SHADOW_LIGHT_XS}, ${SHADOW_DARK_XS}`,
  chipHover: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}`,
  inset: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}`
};

const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999
};

const palette = {
  primary: PRIMARY,
  primaryDark: PRIMARY_DARK,
  secondary: SECONDARY,
  secondaryDark: SECONDARY_DARK,
  cta: CTA,
  ctaDark: CTA_DARK,
  accentMint: ACCENT_MINT,
  accentPurple: ACCENT_PURPLE,
  accentYellow: ACCENT_YELLOW,
  accentPeach: ACCENT_PEACH,
  success: SUCCESS,
  error: ERROR,
  // Background surfaces.
  bg: BG,
  bgPaper: BG_PAPER,
  bgPanel: BG_PANEL,
  bgBubble: BG_BUBBLE,
  surface: SURFACE,
  surfaceOat: SURFACE_OAT,
  surfaceOatDark: SURFACE_OAT_DARK,
  // Text colors.
  text: TEXT,
  textMuted: TEXT_MUTED,
  textInkSoft: TEXT_INK_SOFT,
  textHint: TEXT_HINT,
  textDisabled: TEXT_DISABLED,
  // Borders.
  border: BORDER,
  borderSoft: BORDER_SOFT,
  // Tints used for icon plinths and section-eyebrow chips.
  tint: {
    primary: '#E6F4FF',   // Blue 1
    secondary: '#F9F0FF', // Purple 1
    cta: '#E6F4FF',
    mint: '#F6FFED',      // Green 1
    purple: '#F9F0FF',
    yellow: '#FFFBE6'     // Gold 1
  },
  // Semantic state — distinct from CTA/error which are action colors.
  state: {
    correct: STATE_CORRECT,
    wrong: STATE_WRONG
  },
  // Dark mini-palette used by TutorSessionsSider.
  sider: SIDER,
  // Subject palette — math/thinking/reading/writing.
  subjects: SUBJECTS,
  // Drawing-canvas swatches: pen presets, AI annotation default, canvas void.
  pens: PENS,
  penPresets: PEN_PRESETS,
  aiAnnotationDefault: AI_ANNOTATION_DEFAULT,
  canvasVoid: CANVAS_VOID,
  // Text colors used on dark surfaces (footer, sider, photo scrim ribbons).
  onDark: ON_DARK,
  // Named overlay tints (rgba helpers).
  overlay: OVERLAY,
  // Gradient pair for headline text and the hero CTA button.
  gradient: {
    text: `linear-gradient(135deg, ${PRIMARY} 0%, ${SECONDARY} 100%)`,
    primary: `linear-gradient(135deg, ${PRIMARY} 0%, #69B1FF 100%)`,
    surface: `linear-gradient(135deg, ${BG} 0%, ${BG_PANEL} 100%)`
  }
};

const theme = {
  token: {
    // Ant Design default seed colors. Primary drives every click-target;
    // success/warning/error stay on their canonical hues.
    colorPrimary: PRIMARY,
    colorSuccess: SUCCESS,
    colorWarning: '#FAAD14',
    colorError: ERROR,
    colorInfo: PRIMARY,

    colorBgLayout: BG,
    colorBgContainer: SURFACE,
    colorTextBase: '#000000',
    colorBorder: BORDER,
    colorBorderSecondary: BORDER_SOFT,

    lineWidth: 1,
    lineWidthBold: 1,

    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    borderRadiusSM: radius.sm,
    borderRadiusXS: 10,

    fontFamily:
      '"Nunito", "Quicksand", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 16,

    controlHeight: 48,
    controlHeightLG: 56,
    controlHeightSM: 40,

    boxShadow: stickerShadow.card,
    boxShadowSecondary: stickerShadow.button,
    boxShadowTertiary: stickerShadow.card
  },
  components: {
    Button: {
      borderRadius: radius.md,
      borderRadiusLG: radius.lg,
      borderRadiusSM: 12,
      controlHeight: 48,
      controlHeightLG: 56,
      controlHeightSM: 40,
      fontWeight: 600,
      primaryShadow: stickerShadow.button,
      defaultShadow: stickerShadow.button,
      dangerShadow: stickerShadow.button
    },
    Card: {
      borderRadiusLG: radius.xl,
      paddingLG: 28,
      headerFontSize: 18,
      boxShadowTertiary: stickerShadow.card
    },
    Input: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 2px ${PRIMARY}33`
    },
    InputNumber: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 2px ${PRIMARY}33`
    },
    Select: {
      borderRadius: radius.md,
      controlHeight: 48,
      boxShadowSecondary: stickerShadow.card
    },
    DatePicker: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 2px ${PRIMARY}33`,
      boxShadowSecondary: stickerShadow.card
    },
    Cascader: {
      controlItemBgHover: SURFACE_OAT
    },
    Mentions: {
      borderRadius: radius.md,
      controlHeight: 48
    },
    Tabs: {
      itemColor: TEXT_MUTED,
      itemSelectedColor: PRIMARY,
      itemHoverColor: TEXT,
      inkBarColor: PRIMARY,
      titleFontSize: 16
    },
    Tag: {
      borderRadiusSM: radius.pill,
      defaultBg: BG_PANEL,
      defaultColor: TEXT,
      lineWidth: 0
    },
    Avatar: {
      borderRadius: radius.md,
      borderRadiusLG: 20
    },
    Tooltip: {
      borderRadius: 12,
      boxShadowSecondary: stickerShadow.button
    },
    Popover: {
      borderRadiusLG: radius.md,
      boxShadowSecondary: stickerShadow.card
    },
    Dropdown: {
      borderRadiusLG: radius.md,
      boxShadowSecondary: stickerShadow.card,
      paddingBlock: 8
    },
    Menu: {
      borderRadiusLG: radius.md,
      itemBorderRadius: radius.sm,
      activeBarBorderWidth: 0,
      itemSelectedBg: '#E6F4FF',
      itemSelectedColor: PRIMARY
    },
    Modal: {
      borderRadiusLG: radius.xl,
      boxShadow: stickerShadow.card
    },
    Drawer: {
      boxShadow: stickerShadow.card,
      colorBgElevated: SURFACE
    },
    Notification: {
      borderRadiusLG: radius.lg,
      boxShadow: stickerShadow.card
    },
    Message: {
      borderRadiusLG: radius.md,
      contentPadding: '12px 18px',
      boxShadow: stickerShadow.button
    },
    Alert: {
      borderRadiusLG: radius.md,
      withDescriptionPadding: 16
    },
    Segmented: {
      borderRadius: radius.md,
      controlHeight: 40,
      trackBg: BG_PANEL,
      itemSelectedBg: SURFACE
    },
    Switch: {
      handleShadow: stickerShadow.chip
    },
    Checkbox: {
      borderRadiusSM: 8
    },
    Radio: {
      borderRadius: radius.sm
    },
    Slider: {
      handleSize: 18,
      handleSizeHover: 20,
      handleColor: PRIMARY
    },
    Steps: {
      iconSize: 32,
      iconFontSize: 16
    },
    Pagination: {
      itemSize: 40,
      borderRadius: radius.sm
    },
    Table: {
      borderRadius: radius.md,
      headerBg: BG_PANEL,
      headerSortHoverBg: SURFACE_OAT_DARK
    },
    Collapse: {
      borderRadiusLG: radius.md,
      headerBg: BG_PANEL
    },
    Progress: {
      defaultColor: PRIMARY,
      remainingColor: BG_PANEL
    },
    Divider: {
      colorSplit: BORDER,
      lineWidth: 1
    },
    Empty: {
      colorTextDescription: TEXT_MUTED
    },
    Typography: {
      titleMarginBottom: '0.4em',
      fontWeightStrong: 700
    }
  },
  // Non-Ant tokens — read these directly in JSX.
  palette,
  stickerShadow,
  radius
};

export { palette, stickerShadow, radius };
export default theme;
