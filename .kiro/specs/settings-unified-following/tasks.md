# Implementation Plan: Settings Unified Following

## Overview

This implementation integrates RSS/custom source subscription into the existing user settings page. The approach extends the current local state management pattern, adds tab-based UI switching, and implements source search with subscription management. All changes are made to `hotnews/kernel/templates/user_settings.html`.

## Status

✅ **COMPLETED** - Source search API fixed and deployed (2026-01-20)

### Bug Fixes Applied:
1. Fixed import: `_get_session_token` (was `_get_session_from_cookie`)
2. Fixed import: `validate_session` (was `get_session_user`)
3. Fixed SQL columns: `name`, `url`, `enabled` (was `feed_title`, `feed_url`, `status`)

## Tasks

- [x] 1. Extend local state structure for unified following
  - [x] 1.1 Add source-related state variables to localState object
    - Add `subscribedSources: new Set()` for tracking subscribed source IDs
    - Add `sourceDetails: new Map()` for caching source metadata
    - Add `followingOrder: []` for unified ordering of tags and sources
    - Add `activeTab: 'tags'` for tab state
    - Add `sourceSearchQuery: ''` and `sourceSearchResults: []` for search state
    - _Requirements: 1.1, 3.5, 4.2_

  - [x] 1.2 Implement syncLocalState function extension
    - Modify syncLocalState to accept subscriptions data parameter
    - Populate subscribedSources set from subscriptions API response
    - Populate sourceDetails map with source metadata
    - Call buildUnifiedOrder() after syncing both tags and sources
    - _Requirements: 7.4_

  - [x] 1.3 Implement buildUnifiedOrder function
    - Create function that merges tagOrder and subscribedSources into followingOrder
    - Each item in followingOrder should be `{type: 'tag'|'source', id: string}`
    - Tags should appear first, followed by sources (initial order)
    - _Requirements: 1.1_

- [x] 2. Update initialization to load subscriptions
  - [x] 2.1 Modify init function to fetch subscriptions in parallel
    - Add fetch('/api/sources/subscriptions') to Promise.all
    - Parse subscriptions response and pass to syncLocalState
    - Handle subscription fetch errors gracefully
    - _Requirements: 7.1, 7.3_

  - [ ]* 2.2 Write property test for parallel data loading
    - **Property 13: Parallel Data Loading**
    - Verify tag settings and subscriptions APIs are called concurrently
    - **Validates: Requirements 7.1**

- [x] 3. Implement unified following list UI
  - [x] 3.1 Update HTML structure for unified following section
    - Change section title from "已关注的标签" to "已关注"
    - Update hint text to indicate both tags and sources can be managed
    - Change container id from "followed-tags" to "following-list"
    - _Requirements: 1.1_

  - [x] 3.2 Implement renderFollowingList function
    - Replace renderFollowedTags with renderFollowingList
    - Iterate over followingOrder array
    - Call createFollowedTagChipHTML for tags, createSubscribedSourceChipHTML for sources
    - Handle empty state with appropriate message
    - _Requirements: 1.1, 1.3_

  - [x] 3.3 Implement createSubscribedSourceChipHTML function
    - Create chip HTML with source icon (📰 for RSS, 🔗 for custom)
    - Include drag handle, source name, and click-to-unsubscribe behavior
    - Add draggable attribute and data-id attribute
    - Style consistently with tag chips
    - _Requirements: 1.2, 1.4, 1.6_

  - [ ]* 3.4 Write property test for following list item rendering
    - **Property 1: Following List Item Rendering**
    - Generate random items, verify rendered HTML contains correct icon and name
    - **Validates: Requirements 1.2, 1.4**

- [x] 4. Implement click-to-unfollow for sources
  - [x] 4.1 Implement unsubscribeSource function
    - Check if operation is pending, return early if so
    - Perform optimistic update: remove from subscribedSources, rebuild order
    - Call /api/sources/unsubscribe API
    - On success: clear pending, clear caches, show success toast
    - On failure: rollback state, show error toast
    - _Requirements: 1.6, 5.4, 5.5, 9.2_

  - [ ]* 4.2 Write property test for click-to-unfollow behavior
    - **Property 2: Click-to-Unfollow Behavior**
    - Generate random items, simulate click, verify state update and API call
    - **Validates: Requirements 1.5, 1.6**

- [ ] 5. Checkpoint - Verify unified following list works
  - Ensure all tests pass, ask the user if questions arise.
  - Test: Load page, verify both tags and sources appear in unified list
  - Test: Click tag to unfollow, verify removal
  - Test: Click source to unsubscribe, verify removal

- [x] 6. Implement tab-based selector UI
  - [x] 6.1 Add tab bar HTML structure
    - Add selector-tabs container below following section
    - Add two tab buttons: "🏷️ 标签" and "📡 订阅源"
    - Add tab-content container for dynamic content
    - Style tabs using existing filter-btn styles
    - _Requirements: 3.1_

  - [x] 6.2 Implement tab switching logic
    - Add switchTab function that updates activeTab state
    - Update tab button active states on switch
    - Call renderTabContent after switching
    - Prevent page reload on tab click
    - _Requirements: 3.4, 3.5_

  - [x] 6.3 Implement renderTabContent function
    - If activeTab is 'tags', render existing tag selector content
    - If activeTab is 'sources', render source selector content
    - Preserve search state when switching tabs
    - _Requirements: 3.2, 3.3_

  - [ ]* 6.4 Write property test for tab-content correspondence
    - **Property 5: Tab-Content Correspondence**
    - Generate random tab states, verify content matches expected selector
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 7. Implement source selector component
  - [x] 7.1 Create source selector HTML structure
    - Add search input with placeholder "🔍 搜索订阅源..."
    - Add source-results container for search results
    - Style consistently with existing tag search
    - _Requirements: 4.1_

  - [x] 7.2 Implement source search with debounce
    - Add event listener on source search input
    - Implement searchSources function with 300ms debounce
    - Check minimum 2 character threshold before API call
    - Call /api/sources/search API with query parameter
    - Update sourceSearchResults state with response
    - _Requirements: 4.2, 4.3_

  - [x] 7.3 Implement renderSourceResults function
    - Iterate over sourceSearchResults array
    - Call createSourceResultHTML for each source
    - Handle empty results with appropriate message
    - Handle search errors with error message
    - _Requirements: 4.4, 4.5, 4.6_

  - [x] 7.4 Implement createSourceResultHTML function
    - Create result card with source icon, name, and category
    - Show "订阅" button if not subscribed
    - Show "已订阅 ✓" indicator if subscribed
    - Add click handler for subscribe/unsubscribe action
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.5 Write property test for search minimum character threshold
    - **Property 6: Search Minimum Character Threshold**
    - Generate random short strings (<2 chars), verify no API call
    - **Validates: Requirements 4.2**

  - [ ]* 7.6 Write property test for search result rendering
    - **Property 8: Search Result Rendering**
    - Generate random search results, verify rendering contains required fields
    - **Validates: Requirements 4.4**

- [x] 8. Implement source subscription actions
  - [x] 8.1 Implement subscribeSource function
    - Check if operation is pending, return early if so
    - Perform optimistic update: add to subscribedSources, rebuild order
    - Call /api/sources/subscribe API with source_type and source_id
    - On success: clear pending, update sourceDetails, clear caches, show toast
    - On failure: rollback state, show error toast
    - _Requirements: 5.3, 5.5, 5.6, 9.2_

  - [x] 8.2 Implement updateSourceSearchUI function
    - Find source in search results by ID
    - Update is_subscribed status in sourceSearchResults
    - Re-render affected source result card
    - _Requirements: 5.6_

  - [ ]* 8.3 Write property test for subscription optimistic update
    - **Property 10: Subscription Optimistic Update**
    - Generate random subscription actions, verify immediate state update
    - **Validates: Requirements 5.3, 5.4, 5.6**

  - [ ]* 8.4 Write property test for subscription status button rendering
    - **Property 9: Subscription Status Button Rendering**
    - Generate random sources with varying status, verify button state
    - **Validates: Requirements 5.1, 5.2**

- [ ] 9. Checkpoint - Verify source selector works
  - Ensure all tests pass, ask the user if questions arise.
  - Test: Switch to sources tab, verify source selector appears
  - Test: Search for sources, verify results display
  - Test: Subscribe to source, verify it appears in following list
  - Test: Unsubscribe from source, verify removal

- [x] 10. Update statistics section
  - [x] 10.1 Modify stats rendering to show separate counts
    - Add "订阅源" stat card showing subscribedSources.size
    - Keep existing "关注标签" stat card showing followed.size
    - Update stats HTML template
    - _Requirements: 6.1, 6.2_

  - [x] 10.2 Update updateTagUI to refresh all stats
    - Rename to updateUI or create updateStats function
    - Update both tag count and source count on any action
    - Call after any follow/unfollow/subscribe/unsubscribe action
    - _Requirements: 6.3, 6.4_

  - [ ]* 10.3 Write property test for count synchronization
    - **Property 12: Count Synchronization**
    - Generate random action sequences, verify count equals set size
    - **Validates: Requirements 6.3, 6.4**

- [x] 11. Implement drag-to-reorder for unified list
  - [x] 11.1 Update drag handlers for unified following order
    - Modify handleDrop to work with followingOrder array
    - Support reordering both tags and sources
    - Update followingOrder with new positions
    - _Requirements: 2.1, 2.2_

  - [x] 11.2 Implement saveFollowingOrder function
    - Create new API endpoint or extend existing tag-order endpoint
    - Send unified order to backend
    - Handle save failure with rollback
    - _Requirements: 2.3, 2.4_

  - [ ]* 11.3 Write property test for drag reorder optimistic update
    - **Property 3: Drag Reorder Optimistic Update**
    - Generate random orders and drag operations, verify immediate state update
    - **Validates: Requirements 2.2, 2.3**

- [x] 12. Implement cache invalidation
  - [x] 12.1 Create clearRelevantCaches function
    - Clear my-tags cache (existing clearMyTagsCache)
    - Add clearing of any source-related caches
    - Call only after successful API responses
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 12.2 Write property test for cache invalidation on success
    - **Property 15: Cache Invalidation on Success**
    - Verify cache cleared on success, not cleared on failure
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 13. Add CSS styles for new components
  - [x] 13.1 Add styles for tab bar
    - Style selector-tabs container with flex layout
    - Style tab-btn with active state
    - Use existing CSS variables for consistency
    - _Requirements: 3.1_

  - [x] 13.2 Add styles for source selector
    - Style source-results container
    - Style source result cards
    - Style subscribe/subscribed buttons
    - _Requirements: 4.1, 5.1, 5.2_

  - [x] 13.3 Add styles for source chips in following list
    - Style source chips similar to tag chips
    - Add source-specific icon styling
    - Ensure drag handle works for sources
    - _Requirements: 1.2_

- [ ] 14. Final checkpoint - Full integration test
  - Ensure all tests pass, ask the user if questions arise.
  - Test: Complete flow from page load to subscription management
  - Test: Verify all UI states render correctly
  - Test: Verify error handling and rollback work
  - Test: Verify cache invalidation works

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- All changes are contained within `user_settings.html` - no backend changes required
- Existing tag management code should remain functional throughout implementation
- Use existing CSS variables and styling patterns for consistency
- Property tests should use fast-check or similar library with 100+ iterations
