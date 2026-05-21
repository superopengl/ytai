import {
  BulbOutlined,
  CalculatorOutlined,
  EditOutlined,
  ReadOutlined
} from '@ant-design/icons';
import { palette } from '../theme.js';

// Single source of truth for the four subjects (math, thinking, reading,
// writing). TutorPage and ReportsPage render this list — keep their
// chip rows visually in sync by importing from here.
//
// `color` is the saturated swatch (chip border + active fill); `tint` is
// the pale plinth used behind the icon when the subject isn't active.
// Both come from theme.palette.subjects so updating the theme cascades
// to every consumer.
const SUBJECTS = [
  {
    key: 'math',
    label: 'Math',
    color: palette.subjects.math.color,
    tint: palette.subjects.math.tint,
    icon: CalculatorOutlined
  },
  {
    key: 'thinking',
    label: 'Thinking Skill',
    color: palette.subjects.thinking.color,
    tint: palette.subjects.thinking.tint,
    icon: BulbOutlined
  },
  {
    key: 'reading',
    label: 'Reading',
    color: palette.subjects.reading.color,
    tint: palette.subjects.reading.tint,
    icon: ReadOutlined
  },
  {
    key: 'writing',
    label: 'Writing',
    color: palette.subjects.writing.color,
    tint: palette.subjects.writing.tint,
    icon: EditOutlined
  }
];

export default SUBJECTS;
