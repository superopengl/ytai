// Sticker-claymorphism design tokens for YouTutorAI.
//
// Aesthetic guardrails — based on the uupm.cc educational-platform demo:
//   * Soft pastel palette (peach primary, sky secondary, vibrant green CTA,
//     mint + lavender accents) on a warm cream background.
//   * Hard 3px slate borders on cards / buttons / chips — neo-brutalist
//     foundation gives the soft pastels weight.
//   * Offset solid drop shadows (no blur), e.g. `6px 6px 0 #2d3748`. The press
//     interaction shifts the element +2/+2 and reduces the shadow to 4px 4px,
//     producing a tactile "press-down" feel.
//   * Inset bottom shadow `inset 0 -4px 0 rgba(0,0,0,0.1)` gives the
//     claymorphism foot — soft 3D under the sticker outline.
//   * Nunito for body, Fredoka for display (both loaded in index.html).
//
// `theme` is consumed by ConfigProvider. `palette`, `stickerShadow`, and
// `radius` are exported for direct use in JSX. CSS classes (.sticker-card,
// .sticker-press) live in styles/clay.css and own the hover behavior.

const PRIMARY = '#ADD8E6';       // sky blue — rgb(173, 216, 230)
const PRIMARY_DARK = '#8BC4D6';
const SECONDARY = '#FDBCB4';     // peach — moved from primary to keep brand palette intact
const SECONDARY_DARK = '#F5A69D';
const CTA = '#22C55E';           // vibrant green — primary call-to-action
const CTA_DARK = '#16A34A';
const ACCENT_MINT = '#98FF98';   // saturated mint accent
const ACCENT_PURPLE = '#E6E6FA'; // lavender
const ACCENT_YELLOW = '#FFF4A3'; // pale sunshine
const SUCCESS = CTA;             // same as CTA — semantic alias
const ERROR = '#EF4444';         // tomato red (semantic only)

const BG = '#FFF9F5';            // warm cream — page bg
const BG_PAPER = '#FEFCF6';      // ruled-paper bg (slightly paler cream) — landing-page hero
const BG_PANEL = '#F7F8FC';      // light gray panel — chat surface, page chrome
const BG_BUBBLE = '#F0F2F7';     // slightly darker gray — assistant chat bubbles
const SURFACE = '#FFFFFF';
const SURFACE_OAT = '#F4F1EA';   // oat tint — menu hover, table header, segmented track
const SURFACE_OAT_DARK = '#EDE7DA';
const TEXT = '#2D3748';          // dark slate — the "ink" of the design
const TEXT_MUTED = '#64748B';
const TEXT_INK_SOFT = '#1d2233'; // even darker ink for chat bubbles + heavy text
const TEXT_HINT = '#5d6478';     // softer muted — caption text, small labels
const TEXT_DISABLED = '#8c8c9a';
const BORDER = TEXT;             // 3px sticker outlines use the ink color
const BORDER_SOFT = '#ececf3';   // light gray hairline border (non-sticker chrome)

// Semantic state colors used in stats panels, validation feedback, etc.
const STATE_CORRECT = '#3EC28F'; // softer green for "got it right"
const STATE_WRONG = '#FF6B6B';   // softer red for "struggled with"

// Sider / dark-mode strip used for the session list.
const SIDER = {
  bg: '#1F2330',
  border: '#2D3344',
  textPrimary: '#E5E8F0',
  textMuted: '#8B93A8',
  activeBg: '#2A3148',
  accent: '#5B8DEF',
  danger: '#FF6B6B'
};

// Pen palette for the annotation canvas — saturated marker colors the
// student picks from when drawing on a worksheet. NOT brand colors; this
// is the box of pens, intentionally rainbow. The default-AI color is the
// fallback when Brain hasn't supplied an explicit color for an annotation.
const PENS = {
  red: '#FF1744',
  green: '#22C55E',     // matches CTA
  orange: '#F97316',
  purple: '#A855F7',
  ink: '#1D2233',       // matches TEXT_INK_SOFT
  yellow: '#FFD60A',
  cyan: '#06B6D4'
};
const PEN_PRESETS = [PENS.red, PENS.green, PENS.orange, PENS.purple, PENS.ink, PENS.yellow, PENS.cyan];
const AI_ANNOTATION_DEFAULT = '#3AA0FF';   // sky-blue, default fill for AI annotations
const CANVAS_VOID = '#0F1320';              // dark backdrop behind the worksheet on the canvas

// Subject palette — math/thinking/reading/writing each have a swatch + a
// pale tint used as the icon plinth on the subject selector. Kept apart
// from the brand palette because they encode meaning, not brand identity.
const SUBJECTS = {
  math: { color: '#5B8DEF', tint: '#EEF3FF' },
  thinking: { color: '#9254DE', tint: '#F4ECFF' },
  reading: { color: '#22A06B', tint: '#E6F7EE' },
  writing: { color: '#FA8C16', tint: '#FFF3E6' }
};

// Text colors used on dark surfaces (footer, sider, scrim ribbons). White
// with varying alpha so a single ink underneath shows through consistently.
const ON_DARK = {
  text: 'rgba(255, 255, 255, 0.85)',
  textMuted: 'rgba(255, 255, 255, 0.55)'
};

// Common overlays — kept as named constants so call sites don't sprinkle
// rgba() literals.
const OVERLAY = {
  // Dark scrim used over photos / canvas for caption ribbons.
  scrim: 'rgba(15, 19, 32, 0.78)',
  // Soft black tints used inside markdown bubbles, table borders, etc.
  inkSheen: 'rgba(0, 0, 0, 0.04)',  // very subtle wash — table header background
  inkVeil: 'rgba(0, 0, 0, 0.06)',
  inkRule: 'rgba(0, 0, 0, 0.15)',
  inkQuote: 'rgba(0, 0, 0, 0.18)',
  // Ruled-paper hero gradient on HomePage.
  paperRule: 'rgba(45, 55, 72, 0.10)',
  // Subtle ink shadow used inside stickerShadow.
  inkSoft: 'rgba(45, 55, 72, 0.10)'
};

// Offset solid shadows — the signature interaction of this style. Hover
// shrinks the offset and the JSX adds `transform: translate(2px, 2px)` so
// the element appears to press into the page.
// The claymorphism "foot": a soft black inset sits under the bottom edge
// of the sticker outline. Together with the offset solid drop shadow it
// makes the surface look pressed forward from the page.
const SHADOW_INSET = 'inset 0 -4px 0 rgba(0, 0, 0, 0.10)';
const stickerShadow = {
  card: `6px 6px 0 ${TEXT}, ${SHADOW_INSET}`,
  cardHover: `4px 4px 0 ${TEXT}, ${SHADOW_INSET}`,
  button: `4px 4px 0 ${TEXT}`,
  buttonHover: `2px 2px 0 ${TEXT}`,
  chip: `3px 3px 0 ${TEXT}`,
  chipHover: `1px 1px 0 ${TEXT}`
};

const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
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
    primary: '#DCEFF7',
    secondary: '#FFE4DF',
    cta: '#DCFCE7',
    mint: '#E8FFF0',
    purple: '#F2EFFA',
    yellow: '#FFF8D6'
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
  overlay: OVERLAY
};

const theme = {
  token: {
    // We map Ant's "primary" to the CTA green because Ant Buttons with
    // type="primary" are the main click targets — the peach is brand, not
    // action. This keeps Ant's semantics aligned with the design.
    colorPrimary: CTA,
    colorSuccess: CTA,
    // colorWarning stays warm (peach is now SECONDARY); colorInfo gets the
    // sky-blue PRIMARY since info messages naturally read as cool/calm.
    colorWarning: SECONDARY,
    colorError: ERROR,
    colorInfo: PRIMARY,

    colorBgLayout: BG,
    colorBgContainer: SURFACE,
    colorTextBase: TEXT,
    colorBorder: TEXT,
    colorBorderSecondary: TEXT,

    // The signature sticker outline — 3px ink border on every bordered
    // component (Card, Modal, Drawer, Input, Select, DatePicker, Alert,
    // Table, Tag w/ bordered, Switch, Checkbox, Radio, Divider, …).
    // Per-component overrides below pin the radius / shadow per shape.
    lineWidth: 3,
    lineWidthBold: 3,

    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    borderRadiusSM: radius.sm,
    borderRadiusXS: 10,

    fontFamily:
      'Nunito, "Baloo 2", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 16,

    controlHeight: 48,
    controlHeightLG: 56,
    controlHeightSM: 40,

    // The three Ant shadow tokens all become the sticker offset shadow so
    // any component that reads the global shadow (Dropdown, Popover,
    // Notification, Message, dropdown panels of Select / DatePicker /
    // Cascader / Mentions, etc.) picks it up automatically. Per-component
    // overrides below tighten this further for cards vs floats vs chips.
    boxShadow: stickerShadow.card,
    boxShadowSecondary: stickerShadow.button,
    boxShadowTertiary: stickerShadow.card
  },
  components: {
    Button: {
      borderRadius: radius.md,
      borderRadiusLG: 20,
      borderRadiusSM: 12,
      controlHeight: 48,
      controlHeightLG: 56,
      controlHeightSM: 40,
      fontWeight: 700,
      // Buttons own a tighter shadow than cards — the offset is smaller so
      // the press-down feels snappy. CSS class .sticker-press handles the
      // hover translate.
      primaryShadow: stickerShadow.button,
      defaultShadow: stickerShadow.button,
      dangerShadow: stickerShadow.button
    },
    Card: {
      borderRadiusLG: radius.lg,
      paddingLG: 24,
      headerFontSize: 18,
      boxShadowTertiary: stickerShadow.card
    },
    Input: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 4px ${PRIMARY}66`
    },
    InputNumber: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 4px ${PRIMARY}66`
    },
    Select: {
      borderRadius: radius.md,
      controlHeight: 48,
      // Sticker shadow on the open dropdown panel.
      boxShadowSecondary: stickerShadow.card
    },
    DatePicker: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 4px ${PRIMARY}66`,
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
      itemSelectedColor: TEXT,
      itemHoverColor: TEXT,
      inkBarColor: CTA,
      titleFontSize: 16
    },
    Tag: {
      borderRadiusSM: radius.pill,
      defaultBg: ACCENT_MINT,
      defaultColor: TEXT,
      lineWidth: 3
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
      activeBarBorderWidth: 0
    },
    Modal: {
      borderRadiusLG: radius.lg,
      // Modal owns its own content shadow.
      boxShadow: stickerShadow.card
    },
    Drawer: {
      // Drawer reads `boxShadow` from the global token, but pin it here
      // explicitly so a side-mounted drawer still has the sticker frame.
      boxShadow: stickerShadow.card,
      colorBgElevated: SURFACE
    },
    Notification: {
      borderRadiusLG: radius.md,
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
      trackBg: SURFACE_OAT,
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
      handleColor: TEXT
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
      headerBg: SURFACE_OAT,
      headerSortHoverBg: SURFACE_OAT_DARK
    },
    Collapse: {
      borderRadiusLG: radius.md,
      headerBg: SURFACE_OAT
    },
    Progress: {
      defaultColor: CTA,
      remainingColor: SURFACE_OAT
    },
    Divider: {
      colorSplit: TEXT,
      lineWidth: 3
    },
    Empty: {
      colorTextDescription: TEXT_MUTED
    },
    Typography: {
      titleMarginBottom: '0.4em',
      fontWeightStrong: 800
    }
  },
  // Non-Ant tokens — read these directly in JSX.
  palette,
  stickerShadow,
  radius
};

export { palette, stickerShadow, radius };
export default theme;
