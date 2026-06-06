// Ported from the "Veterinary Clinic" demo (uupm.cc/demo/veterinary-clinic):
// a calm, neumorphic palette of teal-blue, mint, peach, and coral on a pale
// sky background. Plus Jakarta Sans for headings, system font for body.
//
// Color tokens follow the source's semantic scheme:
//   * Primary teal-blue (#4A90A4) drives every click-target.
//   * Secondary mint-teal (#6BB5A2) is the complementary accent + success.
//   * Accent peach (#F4A261) for warm highlights / warning.
//   * Coral (#E76F51) is the high-attention CTA + error.
//   * Lavender + sky round out the soft pastel range used by subject swatches.
//   * Backgrounds are a pale sky ramp (#F8FBFC → #EEF5F7) with #FFFFFF cards.
//   * Text uses a dark teal-ink ramp (#1E3A4C → #5A7A8A → #8BA5B5).
//   * Borders are #D4E5EB hairlines.
//
// Shadows are tinted toward the primary teal (rgba(74,144,164,...)) so the
// neumorphic raise reads cleanly on the sky-pale page background instead of
// the neutral grey it was before.
//
// `theme` is consumed by ConfigProvider. `palette`, `stickerShadow`, `fonts`,
// and `radius` are exported for direct use in JSX. The "sticker" prefix is
// historical and preserved for API compatibility.

const PRIMARY = '#4A90A4';       // Teal-blue — source --color-primary
const PRIMARY_DARK = '#367286';  // Derived darker shade for hover/active
const SECONDARY = '#6BB5A2';     // Mint-teal — source --color-secondary
const SECONDARY_DARK = '#4F9B89';
const CTA = PRIMARY;
const CTA_DARK = PRIMARY_DARK;
const ACCENT_MINT = '#A7E0CF';   // Mint tint, bumped a notch for kid vibrancy
const ACCENT_PURPLE = '#D9CFEE'; // Lavender tint, slightly more saturated
const ACCENT_YELLOW = '#FFE39E'; // Sunshine tint, warmer than peach
const ACCENT_PEACH = '#F4A261';  // Source --color-accent — warm peach
const CORAL = '#E76F51';         // Source --color-coral — emergency/CTA
const LAVENDER = '#9B8EC4';      // Source --color-lavender
const SKY = '#87CEEB';           // Source --color-sky
const SUCCESS = SECONDARY;       // Mint-teal reads as "all good"
const ERROR = CORAL;             // Coral is the natural alarm color in this palette

const BG = '#F8FBFC';            // Source --color-bg — pale sky
const BG_PAPER = '#EEF5F7';      // Source --color-bg-alt
const BG_PANEL = '#EEF5F7';
const BG_BUBBLE = '#EEF5F7';     // assistant chat bubbles
const BG_DEEP = '#07141C';       // Footer / deep dark surface — teal-tinted near-black
const SURFACE = '#FFFFFF';       // Source --color-bg-card
const SURFACE_OAT = '#F0F6F8';
const SURFACE_OAT_DARK = '#E5EEF1';
const TEXT = '#1E3A4C';          // Source --color-text — dark teal ink
const TEXT_MUTED = '#5A7A8A';    // Source --color-text-muted
const TEXT_INK_SOFT = '#1E3A4C';
const TEXT_HINT = '#8BA5B5';     // Source --color-text-subtle
const TEXT_DISABLED = 'rgba(30, 58, 76, 0.35)';
const BORDER = '#D4E5EB';        // Source --color-border
const BORDER_SOFT = '#E2EEF1';

// Semantic state colors used in stats panels, validation feedback, etc.
const STATE_CORRECT = SECONDARY; // mint-teal "got it right"
const STATE_WRONG = CORAL;       // coral "struggled with"

// Sider / dark-mode strip used for the session list — source --color-bg-dark.
const SIDER = {
  bg: '#2C5364',
  border: '#1F3D4A',
  textPrimary: 'rgba(255, 255, 255, 0.92)',
  textMuted: 'rgba(255, 255, 255, 0.58)',
  activeBg: PRIMARY,
  accent: SECONDARY,
  danger: CORAL
};

// Pen palette for the annotation canvas — retuned to the vet-clinic warm/cool
// pastels while keeping enough saturation to read clearly on a photographed
// worksheet. NOT brand colors — the box of pens the student picks from.
const PENS = {
  red: CORAL,           // Coral — alarm / "wrong"
  green: SECONDARY,     // Mint-teal
  orange: ACCENT_PEACH, // Peach
  purple: LAVENDER,
  ink: TEXT,
  yellow: '#F0C26B',    // Warm sand
  cyan: SKY
};
const PEN_PRESETS = [PENS.red, PENS.green, PENS.orange, PENS.purple, PENS.ink, PENS.yellow, PENS.cyan];
const AI_ANNOTATION_DEFAULT = PRIMARY;
const CANVAS_VOID = '#2C5364';   // Dark teal — matches sider for cohesion

// Subject palette — math/thinking/reading/writing each have a swatch + a
// pale tint. Mapped onto the vet-clinic accent quartet so all four sit in
// the same harmonized space.
const SUBJECTS = {
  math: { color: PRIMARY, tint: '#E3EEF2' },        // teal-blue
  thinking: { color: LAVENDER, tint: '#EFEBF7' },   // lavender
  reading: { color: SECONDARY, tint: '#E1EFEB' },   // mint-teal
  writing: { color: ACCENT_PEACH, tint: '#FCE9D4' } // peach
};

// Text colors used on dark surfaces (footer, sider, scrim ribbons).
const ON_DARK = {
  text: 'rgba(255, 255, 255, 0.92)',
  textMuted: 'rgba(255, 255, 255, 0.7)'
};

// Common overlays — kept as named constants so call sites don't sprinkle
// rgba() literals.
const OVERLAY = {
  scrim: 'rgba(30, 58, 76, 0.45)',
  inkSheen: 'rgba(30, 58, 76, 0.03)',
  inkVeil: 'rgba(30, 58, 76, 0.06)',
  inkRule: 'rgba(30, 58, 76, 0.10)',
  inkQuote: 'rgba(30, 58, 76, 0.15)',
  paperRule: 'rgba(74, 144, 164, 0.12)',
  inkSoft: 'rgba(74, 144, 164, 0.08)'
};

// Neumorphic shadow language — black on the dark side, near-white on the
// light side. Alpha values preserve the soft, layered depth from the
// original tinted recipes.
const BLACK_06 = 'rgba(0, 0, 0, 0.06)';
const BLACK_08 = 'rgba(0, 0, 0, 0.08)';
const BLACK_12 = 'rgba(0, 0, 0, 0.12)';
const BLACK_18 = 'rgba(0, 0, 0, 0.18)';
const BLACK_30 = 'rgba(0, 0, 0, 0.30)';

const SHADOW_LIGHT_XS = `0 1px 2px 0 ${BLACK_06}`;
const SHADOW_DARK_XS = `0 1px 4px -1px ${BLACK_08}`;
const SHADOW_INSET_LIGHT = 'inset 0 0 0 1px rgba(255, 255, 255, 0.6)';
const SHADOW_INSET_DARK = `inset 0 2px 4px 0 ${BLACK_08}`;

const stickerShadow = {
  card: `6px 6px 16px ${BLACK_08}, -6px -6px 16px rgba(255, 255, 255, 0.9)`,
  cardHover: `8px 8px 24px ${BLACK_12}, -8px -8px 24px rgba(255, 255, 255, 1)`,
  button: `0 4px 14px ${BLACK_30}`,
  buttonHover: `0 6px 20px ${BLACK_30}`,
  chip: `${SHADOW_LIGHT_XS}, ${SHADOW_DARK_XS}`,
  chipHover: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}`,
  inset: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}`
};

// Source uses 12 for buttons/inputs, 16 for icon plinths, 20 for cards,
// 24 for the emergency block, and pill for badges.
const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999
};

// Centralized font stacks — heading uses Plus Jakarta Sans (the one font we
// still ship over the wire), body falls back to the OS system font so we
// don't pay for a second woff2 download. Imported throughout the app
// instead of redeclaring per-file constants.
const fonts = {
  heading:
    '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  body:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
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
  coral: CORAL,
  lavender: LAVENDER,
  sky: SKY,
  success: SUCCESS,
  error: ERROR,
  // Background surfaces.
  bg: BG,
  bgPaper: BG_PAPER,
  bgPanel: BG_PANEL,
  bgBubble: BG_BUBBLE,
  bgDeep: BG_DEEP,
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
    primary: '#E3EEF2',
    secondary: '#E1EFEB',
    cta: '#E3EEF2',
    mint: '#DDF2EB',
    purple: '#ECE5F7',
    yellow: '#FFF1CF'
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
  // Text colors used on dark surfaces.
  onDark: ON_DARK,
  // Named overlay tints (rgba helpers).
  overlay: OVERLAY,
  // Gradient pair lifted from the source: primary→secondary text gradient,
  // primary→sky-light hero gradient, coral→peach emergency gradient.
  gradient: {
    text: `linear-gradient(135deg, ${PRIMARY} 0%, ${SECONDARY} 100%)`,
    primary: `linear-gradient(135deg, ${PRIMARY} 0%, #5BA3B8 100%)`,
    surface: `linear-gradient(135deg, ${BG} 0%, ${BG_PAPER} 100%)`,
    coral: `linear-gradient(135deg, ${CORAL} 0%, #F07C5F 100%)`
  }
};

const theme = {
  token: {
    colorPrimary: PRIMARY,
    colorSuccess: SUCCESS,
    colorWarning: ACCENT_PEACH,
    colorError: ERROR,
    colorInfo: PRIMARY,

    colorBgLayout: BG,
    colorBgContainer: SURFACE,
    colorTextBase: TEXT,
    colorBorder: BORDER,
    colorBorderSecondary: BORDER_SOFT,

    lineWidth: 1,
    lineWidthBold: 1,

    borderRadius: radius.md,
    borderRadiusLG: radius.lg,
    borderRadiusSM: radius.sm,
    borderRadiusXS: 10,

    fontFamily: fonts.body,
    fontSize: 16,

    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    boxShadow: stickerShadow.card,
    boxShadowSecondary: stickerShadow.button,
    boxShadowTertiary: stickerShadow.card
  },
  components: {
    Button: {
      borderRadius: radius.sm,
      borderRadiusLG: radius.md,
      borderRadiusSM: 10,
      controlHeight: 36,
      controlHeightLG: 44,
      controlHeightSM: 28,
      paddingInline: 14,
      paddingInlineLG: 18,
      paddingInlineSM: 10,
      fontWeight: 600,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none'
    },
    Card: {
      borderRadiusLG: radius.lg,
      paddingLG: 28,
      headerFontSize: 18,
      boxShadowTertiary: stickerShadow.card
    },
    Input: {
      borderRadius: radius.sm,
      controlHeight: 36,
      activeShadow: `0 0 0 4px ${BLACK_18}`
    },
    InputNumber: {
      borderRadius: radius.sm,
      controlHeight: 36,
      activeShadow: `0 0 0 4px ${BLACK_18}`
    },
    Select: {
      borderRadius: radius.sm,
      controlHeight: 36,
      boxShadowSecondary: 'none'
    },
    DatePicker: {
      borderRadius: radius.sm,
      controlHeight: 36,
      activeShadow: `0 0 0 4px ${BLACK_18}`,
      boxShadowSecondary: stickerShadow.button
    },
    Cascader: {
      controlItemBgHover: SURFACE_OAT
    },
    Mentions: {
      borderRadius: radius.sm,
      controlHeight: 36
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
      boxShadowSecondary: stickerShadow.button
    },
    Dropdown: {
      borderRadiusLG: radius.md,
      boxShadowSecondary: stickerShadow.button,
      paddingBlock: 8
    },
    Menu: {
      borderRadiusLG: radius.md,
      itemBorderRadius: radius.sm,
      activeBarBorderWidth: 0,
      itemSelectedBg: '#E3EEF2',
      itemSelectedColor: PRIMARY
    },
    Modal: {
      borderRadiusLG: radius.xl,
      boxShadow: 'none'
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
      controlHeight: 32,
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
      fontWeightStrong: 700,
      fontFamilyHeading: fonts.heading
    }
  },
  // Non-Ant tokens — read these directly in JSX.
  palette,
  stickerShadow,
  radius,
  fonts
};

export { palette, stickerShadow, radius, fonts };
export default theme;
