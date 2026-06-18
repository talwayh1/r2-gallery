# Implementation Plan: files.gallery Feature Parity

## Phase 1: Core UX Improvements (Priority 1)

### 1.1 Office Document Viewer
- Add Google Docs Viewer iframe for doc/xls/ppt/csv files
- Add to Lightbox component for document MIME types
- Config option: `use_google_docs_viewer`

### 1.2 Folder Preview Images
- Store folder thumbnail in D1 metadata (`folder_thumb` column)
- Show preview image on folder cards in FileGrid
- API endpoint: `GET /api/folder-thumb?dir=xxx`

### 1.3 Reload Button
- Add refresh button to Header component
- Call `loadFiles(dir)` on click
- Show loading spinner during refresh

### 1.4 Video Autoplay Config
- Add `video_autoplay` setting to localStorage
- Options: `true`, `false`, `clicked`
- Apply in VideoPlayer component

### 1.5 Select Bar Customization
- Add `selectBarButtons` setting to localStorage
- Allow user to reorder/hide buttons in BulkActions
- Add config in SettingsPanel

### 1.6 Custom CSS Injection
- Already partially implemented (localStorage `customCss`)
- Add UI in SettingsPanel to edit CSS
- Add per-user CSS support via API

## Phase 2: Advanced Features (Priority 2)

### 2.1 File/Folder Filters
- Add `files_include`, `files_exclude`, `dirs_include`, `dirs_exclude` to SettingsPanel
- Store in localStorage
- Apply in `listFiles` API call
- Already supported by backend!

### 2.2 Start Path Configuration
- Add `start_path` setting to localStorage
- On mount, navigate to start_path if set
- Add to SettingsPanel

### 2.3 Per-User Upload Restrictions
- Add `upload_allowed_file_types` and `upload_max_filesize` to user config
- Enforce in upload route
- Show restrictions in UploadDropzone

### 2.4 Config Inheritance
- User settings inherit from global defaults
- Store user-specific overrides in D1
- Merge on load

### 2.5 Download Directory Options
- Add `download_mode` setting: `browser`, `zip`, `files`
- Apply in download handlers
- Add to SettingsPanel

### 2.6 Cache Controls
- Add `localStorage_cache`, `javascript_cache`, `preview_image_cache` settings
- Apply in API calls
- Add to SettingsPanel

### 2.7 Drag-and-Drop Behavior
- Add `drag_copy`, `drag_delete_trash`, `drag_prompt` settings
- Apply in FileGrid drag handlers
- Add to SettingsPanel

## Phase 3: Polish (Priority 3)

### 3.1 More Languages
- Add Finnish (fi), Turkish (tr), Greek (el), Indonesian (id), Slovenian (sl), Ukrainian (uk)
- Add to i18n.ts
- Add language selector options

### 3.2 Folder Upload Preview
- Show selected folder structure before upload
- Add to UploadDropzone component

### 3.3 Granular Permissions
- Add per-user permission flags in D1
- Enforce in API middleware
- Show in admin user management

### 3.4 Login/Logout Behavior
- Add `login_behavior` setting: `form`, `refresh`, `toast`
- Apply in useAuth hook
- Add to SettingsPanel

### 3.5 Settings Editor Button
- Add settings button to Header
- Open SettingsPanel directly
- Show for admin users only

## Execution Order
1. Office Document Viewer (1.1)
2. Reload Button (1.3)
3. Video Autoplay Config (1.4)
4. Select Bar Customization (1.5)
5. File/Folder Filters (2.1)
6. Start Path Configuration (2.2)
7. Download Directory Options (2.5)
8. Cache Controls (2.6)
9. Drag-and-Drop Behavior (2.7)
10. More Languages (3.1)
11. Login/Logout Behavior (3.4)
12. Settings Editor Button (3.5)
13. Folder Preview Images (1.2)
14. Custom CSS Injection (1.6)
15. Per-User Upload Restrictions (2.3)
16. Config Inheritance (2.4)
17. Folder Upload Preview (3.2)
18. Granular Permissions (3.3)
