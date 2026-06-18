# Autopilot Spec: Mobile & WeChat Browser Compatibility

## Goal
Optimize r2-gallery for mobile devices and WeChat's in-app browser

## Key Issues to Fix

### CSS Issues
1. iOS keyboard push-up causing layout issues
2. Safe area insets for iPhone notch
3. Touch scroll performance
4. Font size adjustment
5. Long-press menu suppression
6. Fixed positioning bugs
7. Viewport meta optimization

### JS Issues
1. iOS keyboard focusout scroll-back
2. Double-tap zoom prevention
3. Touch event optimization
4. WeChat environment detection
5. Audio/Video autoplay handling

### Layout Issues
1. Mobile header responsiveness
2. Bottom navigation for mobile
3. Touch-friendly button sizes
4. Swipe gestures
5. Mobile-specific layouts

## Implementation Plan

### Phase 1: CSS Mobile Optimizations
- Add safe area insets
- Fix iOS scroll issues
- Optimize touch targets
- Fix font size adjustment
- Add mobile-specific styles

### Phase 2: JS Mobile Fixes
- iOS keyboard fix
- Double-tap zoom prevention
- Touch event handling
- WeChat detection

### Phase 3: Layout Improvements
- Mobile header redesign
- Bottom navigation bar
- Touch-friendly UI
- Swipe gestures

### Phase 4: Testing
- Test on mobile viewport
- Test WeChat compatibility
- Test touch interactions
- Test keyboard behavior
