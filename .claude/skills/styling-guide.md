---
name: styling-guide
description: Reference guide for Color Lock's retro, sleek, minimalistic UI aesthetic. Use when creating or modifying views, components, colors, typography, animations, or any visual elements to ensure design consistency.
user-invocable: true
---

# Color Lock Styling Guide

## Design Philosophy

**Retro | Sleek | Minimalistic**

Color Lock embraces a warm, approachable aesthetic that combines retro typography with modern minimalism. The design is clean and uncluttered while maintaining a playful, colorful personality through strategic use of gradients and subtle animations.

---

## Core Principles

1. **Warmth Over Coldness** - Use warm taupe tones as the foundation, not stark whites or grays
2. **Gradients for Personality** - Multi-color gradients add life without clutter
3. **Generous Breathing Room** - Ample padding and spacing creates a calm, premium feel
4. **Subtle Motion** - Gentle animations enhance without distracting
5. **Accessibility First** - All design choices must support the color-blind palette option

---

## Color Palette

### Brand Gradient Colors
The signature "COLOR LOCK" title uses this gradient sequence:

| Segment | Start Color | End Color | Hex |
|---------|-------------|-----------|-----|
| **CO** | Coral | Light Coral | `#fb997f` → `#fea474` |
| **LO** (color) | Gold | Light Gold | `#f7ac4b` → `#f6b252` |
| **R** | Sage Green | Light Green | `#afc053` → `#b9c255` |
| **LO** (lock) | Sky Blue | Bright Blue | `#4ca9ea` → `#38bdfe` |
| **CK** | Mauve Pink | Dusty Rose | `#d16381` → `#db757f` |

### Background Colors
```scss
$bg-warm-taupe: rgb(233, 227, 201);  // #e9e3c9 - Light Mode Background
$bg-dark-mode: #1a1a1a;              // Dark Mode Background
$overlay-opacity: 0.7;                // 70% for readability
```

### Accent & UI Colors
```scss
$color-primary-gray: rgb(128, 128, 128);    // #808080
$color-light-taupe: rgb(233, 227, 201);     // #e9e3c9
$color-description-text: rgb(140, 130, 115); // #8c8273
```

### Semantic Gradient Usage
| Context | Gradient | Usage |
|---------|----------|-------|
| User Score | Coral `#fb997f` → `#fea474` | Displaying player's score |
| Best Score | Blue `#4ca9ea` → `#38bdfe` | Highlighting optimal solutions |
| Share Actions | Green `#8a9a45` → `#94a04a` | Share buttons |
| Close/Dismiss | Pink `#d16381` → `#db757f` | Close buttons, secondary actions |
| Neutral | Gray `#808080` | Inactive states, play buttons |

### Tile Colors (Standard)
```scss
$tile-red: rgb(219, 92, 92);      // #db5c5c
$tile-green: rgb(92, 179, 92);    // #5cb35c
$tile-blue: rgb(92, 135, 219);    // #5c87db
$tile-yellow: rgb(237, 217, 92);  // #edd95c
$tile-purple: rgb(163, 92, 184);  // #a35cb8
$tile-orange: rgb(237, 143, 71);  // #ed8f47
```

### Color-Blind Accessible Palette
```scss
$tile-red-cb: rgb(230, 159, 0);      // Orange
$tile-green-cb: rgb(86, 180, 233);   // Cyan
$tile-blue-cb: rgb(0, 114, 178);     // Dark Blue
$tile-yellow-cb: rgb(240, 228, 66);  // Pale Yellow
$tile-purple-cb: rgb(204, 121, 167); // Mauve
$tile-orange-cb: rgb(213, 94, 0);    // Dark Orange
```

---

## Typography

### Primary Font: Arvo
Arvo is a geometric slab-serif that brings retro warmth while maintaining excellent readability.

**Available Weights:**
- Arvo-Regular (400)
- Arvo-Bold (700)
- Arvo-Italic
- Arvo-BoldItalic

### Type Scale
| Element | Font | Size | Style |
|---------|------|------|-------|
| Hero Title | Arvo | 48px | Bold Italic |
| Modal Title | Arvo | 32px | Bold Italic |
| Section Title | Arvo | 24px | Bold Italic |
| Welcome Text | Arvo | 24px | Bold |
| Form Subheading | System | 14px | Medium |
| Body Copy | System | 16px | Regular |
| Captions | System | 12px | Regular |

### Usage Rules
- **Arvo-BoldItalic** for branded headings (titles, hero text)
- **System font** for body text, form labels, and subheadings (better legibility at small sizes)
- Never use more than 2 font weights in a single view

---

## Spacing & Layout

### Standard Spacing Scale
```scss
$spacing-xxs: 4px;   // Tight groupings, inline spacing
$spacing-xs: 8px;    // Small component padding
$spacing-sm: 12px;   // Default inner padding
$spacing-md: 16px;   // Standard element spacing
$spacing-lg: 24px;   // Section breaks
$spacing-xl: 32px;   // Major section spacing
$spacing-xxl: 40px;  // Full screen margins
```

### Corner Radii
```scss
$border-radius-small: 8px;   // Small components (buttons, chips)
$border-radius-medium: 12px; // Medium components (cards, controls)
$border-radius-large: 20px;  // Large modals and sheets
```

---

## Shadows & Elevation

### Light Mode
```scss
$shadow-light: 0 2px 10px rgba(0, 0, 0, 0.2);
```

### Dark Mode (Enhanced visibility)
```scss
$shadow-dark: 0 2px 8px rgba(255, 255, 255, 0.15);
```

### Modal Shadows
```scss
$shadow-modal: 0 4px 20px rgba(0, 0, 0, 0.3);
```

---

## Component Patterns

### Gradient Text
Apply to headings and important labels:
```scss
.gradient-text {
  background: linear-gradient(to right, $start-color, $end-color);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Primary Buttons
```scss
.primary-button {
  background-color: $color-primary-gray;  // #808080
  color: $color-light-taupe;              // #e9e3c9
  border-radius: 12px;
  padding: 16px 24px;
  border: none;
  font-family: 'Arvo', serif;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
}
```

### Secondary/Segmented Controls
```scss
.segmented-control {
  background-color: rgba($color-primary-gray, 0.08);
  border-radius: 12px;
  padding: 4px;

  .segment {
    border-radius: 8px;
    padding: 8px 16px;

    &.selected {
      background-color: $color-primary-gray;
      font-weight: 700;
    }
  }
}
```

### Toggles (MinimalisticToggle)
```scss
.minimalistic-toggle {
  // Track: 44x26px, 2px stroke
  .track {
    width: 44px;
    height: 26px;
    border: 2px solid $color-primary-gray;
    border-radius: 13px;
    transition: all 0.2s ease-in-out;

    &.on {
      background-color: rgba($color-primary-gray, 0.6);
    }
  }

  // Thumb: 22px circle with shadow
  .thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
}
```

### Cards & Modals
```scss
.modal-container {
  background-color: $bg-warm-taupe;  // #e9e3c9
  border-radius: 20px;
  padding: 24px;
  box-shadow: $shadow-modal;
}
```

---

## Animations

### Principles
- **Ease-in-out** for state changes and transitions
- **Ease-out** for dismissals and fade-outs
- Keep durations between 0.3s - 2.0s
- Use opacity fades rather than abrupt visibility changes

### Floating Background Circles
```scss
@keyframes floatVertical {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}

.floating-circle {
  // 10 circles with tile colors
  // Size range: 30-120px
  // Opacity: 20-60%
  animation: floatVertical 4s ease-in-out infinite;
}
```

### Celebration Effects
- Fireworks: 30 particles, 120px radius burst
- Duration: 2 seconds
- Fade-out during expansion

---

## Dark Mode Considerations

Always implement with dark mode support using CSS custom properties or media queries:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | Warm Taupe (#e9e3c9) | Dark (#1a1a1a) |
| Text | Dark/Primary | Light Taupe |
| Shadows | Black 20% opacity | White 15% opacity |
| Overlays | Taupe at 70% | Dark at 70% |

```scss
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #1a1a1a;
    --text-primary: #e9e3c9;
    --shadow-color: rgba(255, 255, 255, 0.15);
  }
}
```

---

## Do's and Don'ts

### Do
- Use warm taupe as the default background
- Apply gradients sparingly for emphasis
- Maintain generous padding (never feel cramped)
- Support both color schemes
- Use Arvo for headlines, system for body
- Keep animations subtle and purposeful

### Don't
- Use pure white (#FFFFFF) or pure black (#000000) as backgrounds
- Apply gradients to everything (save for key moments)
- Crowd elements together
- Ignore dark mode considerations
- Mix too many font weights
- Create jarring or fast animations

---

## Quick Reference: CSS Colors

```scss
// Backgrounds
$bg-warm-taupe: #e9e3c9;
$color-description-text: #8c8273;

// Gradients
$gradient-coral: linear-gradient(to right, #fb997f, #fea474);
$gradient-gold: linear-gradient(to right, #f7ac4b, #f6b252);
$gradient-green: linear-gradient(to right, #afc053, #b9c255);
$gradient-blue: linear-gradient(to right, #4ca9ea, #38bdfe);
$gradient-pink: linear-gradient(to right, #d16381, #db757f);
$gradient-share-green: linear-gradient(to right, #8a9a45, #94a04a);

// UI Elements
$color-primary-gray: #808080;
$color-light-taupe: #e9e3c9;
```

---

## File References (Web App)

| Component | Location |
|-----------|----------|
| Variables/Tokens | `src/scss/abstracts/_variables.scss` |
| Typography | `src/scss/base/_typography.scss` |
| Mixins | `src/scss/abstracts/_mixins.scss` |
| Buttons | `src/scss/components/_buttons.scss` |
| Modals | `src/scss/modals/_base-modal.scss` |
| Animations | `src/scss/base/_animations.scss` |
| Main Entry | `src/scss/main.scss` |
