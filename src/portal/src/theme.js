// Soft-neumorphism design tokens for YouTutorAI.
//
// Aesthetic guardrails — based on the uupm.cc "Serenity" mental-wellness demo:
//   * Calming cool-grey background (#f0f4f8) with paired light/dark shadows
//     for the neumorphism "pressed into the surface" feel.
//   * Sage-blue primary (#7c9eb2), mauve secondary (#b8a9c9), peach accent
//     (#f0b7a4), with mint / lavender / peach utility tints.
//   * No hard outlines — depth comes entirely from the shadow pair, not from
//     borders. Borders are an invisible 1px in the surface tone for input
//     hit-targets only.
//   * Generous border radii: 16px buttons, 20–24px cards, 50px pills.
//   * Quicksand for display, Nunito for body — both loaded in index.html.
//
// `theme` is consumed by ConfigProvider. `palette`, `stickerShadow`, and
// `radius` are exported for direct use in JSX. CSS classes (.sticker-card,
// .sticker-press, …) live in styles/clay.css and own the hover behavior.
// The "sticker" prefix is historical — these are now neumorphic.

const PRIMARY = '#7C9EB2';       // sage blue-grey — Serenity primary
const PRIMARY_DARK = '#6A8DA1';
const SECONDARY = '#B8A9C9';     // mauve / dusty lavender
const SECONDARY_DARK = '#A595B8';
const CTA = '#7C9EB2';           // CTA shares the calming primary — gradient handles emphasis
const CTA_DARK = '#5F8298';
const ACCENT_MINT = '#A8D5BA';   // soft sage mint
const ACCENT_PURPLE = '#E6E6FA'; // pale lavender
const ACCENT_YELLOW = '#FFE8C5'; // warm cream-peach (no harsh sunshine)
const ACCENT_PEACH = '#F0B7A4';  // peachy coral
const SUCCESS = '#7BB59A';       // muted sage green — semantic "got it"
const ERROR = '#E57373';         // soft coral red

const BG = '#F0F4F8';            // cool pale grey-blue — page bg, neumorphism base
const BG_PAPER = '#F7FAFD';      // very faint cooler bg for paper / ruled hero
const BG_PANEL = '#E8EEF4';      // bg-alt — chat surface, recessed panels
const BG_BUBBLE = '#E6EBF3';     // assistant chat bubbles (slightly deeper)
const SURFACE = '#FFFFFF';
const SURFACE_OAT = '#E8EEF4';   // recessed surface — menu hover, table header
const SURFACE_OAT_DARK = '#D8E1EC';
const TEXT = '#2D3748';          // dark slate ink
const TEXT_MUTED = '#718096';    // slate gray
const TEXT_INK_SOFT = '#1A202C'; // deeper ink for high-emphasis text
const TEXT_HINT = '#A0AEC0';     // mid slate — captions, small labels
const TEXT_DISABLED = '#CBD5E0';
const BORDER = '#D6DEE9';        // soft cool-grey hairline (visible only when needed)
const BORDER_SOFT = '#E2E8F0';   // even softer hairline for dividers

// Semantic state colors used in stats panels, validation feedback, etc.
const STATE_CORRECT = '#7BB59A'; // sage green for "got it right"
const STATE_WRONG = '#E57373';   // soft coral for "struggled with"

// Sider / dark-mode strip used for the session list.
const SIDER = {
  bg: '#2D3748',
  border: '#3D4A60',
  textPrimary: '#E6EBF3',
  textMuted: '#A0AEC0',
  activeBg: '#3D4A60',
  accent: PRIMARY,
  danger: ERROR
};

// Pen palette for the annotation canvas. NOT brand colors — the box of pens
// the student picks from when drawing on a worksheet. Kept saturated so
// marks read clearly on top of any worksheet color.
const PENS = {
  red: '#E57373',
  green: '#7BB59A',
  orange: '#F0B7A4',
  purple: '#B8A9C9',
  ink: '#1A202C',
  yellow: '#F5D67D',
  cyan: '#8FC3D6'
};
const PEN_PRESETS = [PENS.red, PENS.green, PENS.orange, PENS.purple, PENS.ink, PENS.yellow, PENS.cyan];
const AI_ANNOTATION_DEFAULT = PRIMARY;     // sage-blue, default fill for AI annotations
const CANVAS_VOID = '#2D3748';              // dark slate behind the worksheet on the canvas

// Subject palette — math/thinking/reading/writing each have a swatch + a
// pale tint. Tuned to the Serenity palette so subjects still feel calming.
const SUBJECTS = {
  math: { color: '#7C9EB2', tint: '#E2EBF1' },
  thinking: { color: '#B8A9C9', tint: '#EFEAF4' },
  reading: { color: '#7BB59A', tint: '#E4F0E9' },
  writing: { color: '#F0B7A4', tint: '#FBE9E1' }
};

// Text colors used on dark surfaces (footer, sider, scrim ribbons).
const ON_DARK = {
  text: 'rgba(255, 255, 255, 0.92)',
  textMuted: 'rgba(255, 255, 255, 0.62)'
};

// Common overlays — kept as named constants so call sites don't sprinkle
// rgba() literals.
const OVERLAY = {
  // Dark scrim used over photos / canvas for caption ribbons.
  scrim: 'rgba(45, 55, 72, 0.78)',
  inkSheen: 'rgba(0, 0, 0, 0.03)',
  inkVeil: 'rgba(0, 0, 0, 0.05)',
  inkRule: 'rgba(0, 0, 0, 0.10)',
  inkQuote: 'rgba(0, 0, 0, 0.15)',
  // Ruled-paper hero accent.
  paperRule: 'rgba(124, 158, 178, 0.18)',
  // Subtle ink shadow used inside stickerShadow.
  inkSoft: 'rgba(163, 177, 198, 0.40)'
};

// Neumorphism shadow pairs. The signature interaction of this style: a soft
// white highlight on the top-left + a soft cool-grey shadow on the
// bottom-right makes the element look gently raised from the page. The
// "press" state inverts both into insets, so the element looks pushed in.
//
// "Sticker" naming is preserved for API compatibility — the values now
// describe a softer, calmer language.
const SHADOW_LIGHT = '-8px -8px 20px rgba(255, 255, 255, 0.85)';
const SHADOW_DARK = '8px 8px 20px rgba(163, 177, 198, 0.45)';
const SHADOW_LIGHT_SM = '-4px -4px 10px rgba(255, 255, 255, 0.80)';
const SHADOW_DARK_SM = '4px 4px 10px rgba(163, 177, 198, 0.35)';
const SHADOW_LIGHT_XS = '-2px -2px 6px rgba(255, 255, 255, 0.85)';
const SHADOW_DARK_XS = '2px 2px 6px rgba(163, 177, 198, 0.40)';
const SHADOW_INSET_LIGHT = 'inset -4px -4px 10px rgba(255, 255, 255, 0.85)';
const SHADOW_INSET_DARK = 'inset 4px 4px 10px rgba(163, 177, 198, 0.45)';

const stickerShadow = {
  card: `${SHADOW_LIGHT}, ${SHADOW_DARK}`,
  cardHover: `-10px -10px 25px rgba(255,255,255,0.95), 10px 10px 25px rgba(163,177,198,0.55)`,
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
    primary: '#E2EBF1',
    secondary: '#EFEAF4',
    cta: '#E2EBF1',
    mint: '#E4F0E9',
    purple: '#EFEAF4',
    yellow: '#FFF6E5'
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
    primary: `linear-gradient(135deg, ${PRIMARY} 0%, #8FAFC4 100%)`,
    surface: `linear-gradient(135deg, ${BG} 0%, ${BG_PANEL} 100%)`
  }
};

const theme = {
  token: {
    // Ant's "primary" is mapped to the sage-blue PRIMARY since the neumorphism
    // language wants one calm hue across click-targets, with shadow depth
    // doing the emphasis work rather than a contrasting accent.
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

    // Neumorphism: depth comes from paired shadows, not from hard outlines.
    // Borders are kept hair-thin so input fields still have a hit-target.
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

    // Every floating Ant component (Dropdown, Popover, Notification, …)
    // picks up the neumorphism card shadow by default. Per-component
    // overrides below tighten this further for buttons vs cards vs chips.
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
      // Buttons own a tighter shadow pair than cards. The .sticker-btn class
      // in clay.css handles the inset press-down on :active.
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
      activeShadow: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}, 0 0 0 3px ${PRIMARY}33`
    },
    InputNumber: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `${SHADOW_INSET_LIGHT}, ${SHADOW_INSET_DARK}, 0 0 0 3px ${PRIMARY}33`
    },
    Select: {
      borderRadius: radius.md,
      controlHeight: 48,
      boxShadowSecondary: stickerShadow.card
    },
    DatePicker: {
      borderRadius: radius.md,
      controlHeight: 48,
      activeShadow: `0 0 0 3px ${PRIMARY}33`,
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
      itemSelectedBg: `${PRIMARY}1A`,
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
