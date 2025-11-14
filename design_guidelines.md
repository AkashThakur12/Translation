# Design Guidelines: Assamese PDF Translator

## Design Approach
**System Selected**: Material Design (utility-focused)
**Justification**: This is a single-purpose productivity tool where clarity, efficiency, and immediate comprehension are paramount. Material Design provides clear interaction patterns for file uploads, progress indicators, and status feedback that users already understand.

## Core Design Elements

### A. Typography
- **Primary Font**: Inter or Roboto via Google Fonts CDN
- **Headings**: 
  - H1: 2.5rem (40px), semibold, letter-spacing tight
  - H2: 1.5rem (24px), medium
- **Body Text**: 1rem (16px), regular, line-height 1.6
- **Status Messages**: 0.875rem (14px), medium
- **Buttons**: 0.9375rem (15px), medium, uppercase tracking

### B. Layout System
**Spacing Units**: Tailwind primitives of 4, 6, 8, 12, 16, 20
- Container: max-w-2xl (centered)
- Section padding: py-8 to py-12
- Component spacing: gap-6 between major elements
- Button padding: px-8 py-3
- Card/panel padding: p-8

### C. Component Library

**File Upload Zone**
- Large dropzone area (min-h-64) with dashed border
- Upload icon centered at top (size-16)
- Instructional text below icon
- "Browse files" link styled as interactive text
- Drag-and-drop active state with border emphasis
- Selected file preview card with filename, size, remove option

**Primary Action Button**
- Full-width on mobile, auto width on desktop
- Height: h-12
- Rounded corners: rounded-lg
- Prominent shadow on hover
- Disabled state when no file selected

**Status Feedback**
- Alert-style container with rounded borders
- Icon indicators: loading spinner, success checkmark, error warning
- Clear messaging with actionable next steps
- Progress bar for upload/processing (animated)

**Page Header**
- Logo/title lockup at top
- Subtitle explaining the service capability
- Clean separation from main content (border-b)

**Result Section**
- Download button with file icon
- File details (size, pages translated)
- Option to translate another file

### D. Page Structure

**Single-Page Application Layout**:
1. **Header** (sticky top, backdrop blur)
   - App title + tagline
   - Minimal, professional presentation

2. **Main Content Area** (centered, max-w-2xl)
   - Instructional heading
   - File upload dropzone (prominent)
   - Upload button (disabled until file selected)
   - Status display area (hidden until action)

3. **Footer** (minimal)
   - Powered by Google Cloud APIs badge
   - Privacy/terms links if needed

**Responsive Behavior**:
- Mobile: Full-width container, p-4
- Desktop: Centered container, max-w-2xl, px-6

### E. Interaction Patterns

**Upload Flow**:
1. Idle state: Empty dropzone with invitation to upload
2. Hover state: Subtle border/background change
3. File selected: Preview card appears, button enables
4. Processing: Button disabled, progress indicator shows
5. Complete: Success message, download button appears
6. Error: Clear error message with retry option

**Micro-interactions**:
- Button scale on press (scale-95)
- File preview slide-in animation
- Progress bar smooth animation
- Success/error state transitions

### F. Accessibility
- File input keyboard accessible
- Clear focus states on all interactive elements
- ARIA labels for icon-only buttons
- Status announcements for screen readers
- Color-independent error/success indicators (use icons)
- Minimum touch target size: 44x44px

### G. Visual Hierarchy
- Primary action (Upload button) visually dominant
- File dropzone draws immediate attention
- Status feedback appears in logical flow position
- Secondary actions (cancel, retry) visually subdued
- Clear visual separation between upload and result states

## Images
**No hero image needed** - This is a utility tool where function takes priority. Focus remains on the upload interface and clear status feedback.