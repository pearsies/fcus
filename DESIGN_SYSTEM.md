# Design Reference Guide: `fcus` (Focus Flow) Design System

This reference guide details the exact aesthetic, color palette, typography, layout hierarchy, component specifications, and animation physics for the **fcus** productivity application. 

Any AI or developer can use this document as a master specification to reproduce or extend the exact same design style across other applications.

---

## 1. Core Visual Philosophy

- **Aesthetic**: Minimalist, high-contrast, tactile, and calm editorial productivity.
- **Canvas Strategy**: Light off-white canvas (`#FAFAFA`) with deep charcoal/black text (`#111111`), subtle 1px border frames (`#E5E5E5`), and generous whitespace.
- **Tactile Elements**: Pill-shaped controls (`rounded-full`), soft floating cards (`rounded-3xl`), and smooth micro-animations (`motion/react`).
- **Dynamic Mode Themes**: Dual state color identity:
  - **Relax / Free Time Mode**: Indigo/Violet accent system (`indigo-600`, `indigo-50`).
  - **Work / Focus Mode**: Emerald/Teal accent system (`emerald-600`, `emerald-50`).
  - **Streak / Level Mode**: Flame Amber accent system (`amber-500`, `amber-50`).

---

## 2. Typography System

### Font Family
- **Primary Body & Display**: `'Open Sauce Sans', 'Open Sauce One', 'Open Sauce'
- **Fallback**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

### Type Scale & Hierarchy

| Element | Class Name / CSS Specs | Font Weight | Tracking | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Timer / Massive Metric** | `text-6xl sm:text-7xl font-extrabold` | `800` | `tracking-tight` | Main countdown / timer numbers |
| **Primary Page Title** | `text-2xl sm:text-3xl font-bold` | `700` | `tracking-tight` | Modal titles, screen headers |
| **Section Heading** | `text-lg font-bold` | `700` | `normal` | Card group titles, section names |
| **Card Title / Subheading** | `text-base font-semibold` | `600` | `normal` | Quest title, item name |
| **Body Standard** | `text-sm font-medium` | `500` | `normal` | Standard text, descriptions, options |
| **Small Label / Meta** | `text-xs font-medium text-neutral-500` | `500` | `normal` | Sub-labels, progress text, hints |
| **Uppercase Badge** | `text-[10px] font-bold tracking-wider uppercase` | `700` | `tracking-wider` | Pill tags, status indicators |

---

## 3. Color Tokens & Palette

### Foundation Neutrals
```css
--bg-canvas: #FAFAFA;            /* tailwind: bg-[#fafafa] or bg-neutral-50 */
--bg-surface: #FFFFFF;           /* tailwind: bg-white */
--bg-subtle: #F4F4F5;            /* tailwind: bg-neutral-100 */
--border-subtle: #E5E5E5;        /* tailwind: border-neutral-200 */
--border-strong: #111111;        /* tailwind: border-black */
--text-primary: #111111;         /* tailwind: text-neutral-900 */
--text-secondary: #71717A;       /* tailwind: text-neutral-500 */
--text-tertiary: #A1A1AA;        /* tailwind: text-neutral-400 */
```

### Relax Mode (Indigo)
```css
--relax-primary: #4F46E5;        /* bg-indigo-600 */
--relax-hover: #4338CA;          /* bg-indigo-700 */
--relax-light: #EEF2FF;          /* bg-indigo-50 */
--relax-border: #C7D2FE;         /* border-indigo-200 */
--relax-text: #3730A3;           /* text-indigo-800 */
```

### Work Mode (Emerald)
```css
--work-primary: #059669;         /* bg-emerald-600 */
--work-hover: #047857;           /* bg-emerald-700 */
--work-light: #ECFDF5;           /* bg-emerald-50 */
--work-border: #A7F3D0;          /* border-emerald-200 */
--work-text: #065F46;            /* text-emerald-800 */
```

### Gamification & Status Accents
- **Streak / Flame Accent**: Amber `#F59E0B` (`bg-amber-500`, `text-amber-600`, `bg-amber-50`)
- **Error / Danger Accent**: Red `#EF4444` (`bg-red-500`, `text-red-600`, `bg-red-50`)
- **Dark Pill / Mode Container**: Deep Charcoal `#18181B` (`bg-neutral-900`, `text-white`)

---

## 4. Component Design Patterns

### 1. Main Header & Top Controls
- **Layout**: Centered container max `max-w-md` (mobile-first portrait app wrapper).
- **Structure**: Horizontal flex bar with brand logo (`font-black text-xl tracking-tight`), mode status pill, and action icon buttons (`w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center hover:bg-neutral-100`).

### 2. Mode Toggle Pill (Relax vs Work)
- **Container**: `bg-neutral-900 rounded-full p-1.5 flex items-center gap-1 shadow-inner`
- **Active Tab Pill**: Animated white capsule `bg-white text-neutral-900 shadow-sm rounded-full px-5 py-2 text-xs font-bold`
- **Inactive Tab Pill**: `text-neutral-400 hover:text-white px-5 py-2 text-xs font-medium transition-colors`

### 3. Core Timer Display Card
- **Container**: `bg-white rounded-3xl p-8 shadow-sm border border-neutral-200/80 text-center flex flex-col items-center justify-center gap-6 relative overflow-hidden`
- **Timer Typography**: Monospaced tabular figures (`font-mono font-extrabold text-6xl text-neutral-900 tracking-tight`).
- **Primary Play/Pause CTA**: Large pill button (`w-full py-4 rounded-full text-base font-bold transition-all transform active:scale-[0.98] shadow-md`)
  - **Relax Style**: `bg-indigo-600 text-white hover:bg-indigo-700`
  - **Work Style**: `bg-emerald-600 text-white hover:bg-emerald-700`

### 4. Progress Cards & Quests
- **Card Wrapper**: `bg-white rounded-2xl p-5 border border-neutral-200/80 hover:border-neutral-300 transition-all shadow-2xs`
- **Progress Track**: `w-full h-2 rounded-full bg-neutral-100 overflow-hidden`
- **Progress Fill**: Smooth animated bar `h-full rounded-full transition-all duration-500` (`bg-indigo-600` or `bg-emerald-600`)

### 5. Modal Dialogs & Overlay Drawers
- **Backdrop**: `fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4`
- **Modal Card**: `bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-neutral-100 relative`
- **Close Button**: `w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center`

---

## 5. Motion & Physics Specs

Framework: `motion/react` (Framer Motion)

### Spring Transition Presets
```typescript
// Standard Smooth Pill / Layout Spring
export const springSmooth = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

// Subtle Card Entering Fade & Scale
export const cardEnterVariants = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -10 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

// Modal Backdrop Fade
export const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
```

---

## 6. JSX Code Reference Templates

### Template 1: Header & Navigation
```tsx
<header className="w-full max-w-md mx-auto flex items-center justify-between py-4 px-4">
  <div className="flex items-center gap-2">
    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-black text-sm">
      f
    </div>
    <span className="font-extrabold text-xl tracking-tight text-neutral-900">fcus</span>
  </div>

  <div className="flex items-center gap-2">
    <button className="w-9 h-9 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-100 transition-colors shadow-2xs">
      <Settings className="w-4 h-4" />
    </button>
  </div>
</header>
```

### Template 2: Mode Toggle Pill
```tsx
<div className="bg-neutral-900 p-1.5 rounded-full inline-flex items-center gap-1 shadow-md">
  <button
    onClick={() => setMode('relax')}
    className={`relative px-5 py-2 rounded-full text-xs font-bold transition-colors ${
      mode === 'relax' ? 'text-neutral-900' : 'text-neutral-400 hover:text-white'
    }`}
  >
    {mode === 'relax' && (
      <motion.div
        layoutId="activeMode"
        className="absolute inset-0 bg-white rounded-full shadow-sm"
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    )}
    <span className="relative z-10 flex items-center gap-1.5">
      <Coffee className="w-3.5 h-3.5" /> Relax
    </span>
  </button>

  <button
    onClick={() => setMode('work')}
    className={`relative px-5 py-2 rounded-full text-xs font-bold transition-colors ${
      mode === 'work' ? 'text-neutral-900' : 'text-neutral-400 hover:text-white'
    }`}
  >
    {mode === 'work' && (
      <motion.div
        layoutId="activeMode"
        className="absolute inset-0 bg-white rounded-full shadow-sm"
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    )}
    <span className="relative z-10 flex items-center gap-1.5">
      <Zap className="w-3.5 h-3.5" /> Work
    </span>
  </button>
</div>
```

### Template 3: Main Timer Card
```tsx
<div className="w-full max-w-md mx-auto bg-white rounded-3xl p-8 border border-neutral-200/80 shadow-sm flex flex-col items-center text-center gap-6">
  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
    Relaxation Time Remaining
  </div>

  <div className="font-mono text-6xl sm:text-7xl font-extrabold tracking-tight text-neutral-900">
    24:59
  </div>

  <button className="w-full py-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2">
    <Play className="w-5 h-5 fill-current" /> Start Relaxation
  </button>
</div>
```

---

## 7. Global CSS File Target (`src/index.css`)

```css
@import url('https://fonts.cdnfonts.com/css/open-sauce-sans');
@import url('https://fonts.cdnfonts.com/css/open-sauce-one');
@import "tailwindcss";

@layer base {
  body {
    font-family: 'Open Sauce Sans', 'Open Sauce One', 'Open Sauce', system-ui, -apple-system, sans-serif;
    background-color: #fafafa;
    color: #111111;
    -webkit-font-smoothing: antialiased;
  }
}
```

---

## Summary Checklist for Other AIs
1. **Fonts**: Load `'Open Sauce Sans'` or system clean sans-serif.
2. **Background**: Use `#FAFAFA` background with `#FFFFFF` cards and `#E5E5E5` subtle borders.
3. **Pill Shapes**: Use `rounded-full` for all buttons, toggles, badges, and tabs.
4. **Card Radius**: Use `rounded-3xl` for main cards and modals, `rounded-2xl` for sub-cards.
5. **Mode Identity**: Indigo (`#4F46E5`) for Relax mode, Emerald (`#059669`) for Work mode, Amber (`#F59E0B`) for Streaks.
6. **Animations**: Use `motion/react` with spring transitions (`stiffness: 400, damping: 30`) and `layoutId` pill sliders.
