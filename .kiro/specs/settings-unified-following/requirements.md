# Requirements Document

## Introduction

This feature integrates RSS/custom source subscription functionality into the existing "我的设置" (My Settings) page. The goal is to create a unified "已关注" (Following) section that displays both followed tags and subscribed RSS sources in a single, cohesive list. Users will be able to manage both types of subscriptions from one interface with tab-based switching between tag and source selectors.

## Glossary

- **Settings_Page**: The user settings page at `/user/settings` rendered by `user_settings.html`
- **Tag**: A content classification label that users can follow to personalize their news feed
- **RSS_Source**: An RSS feed source that users can subscribe to for content updates
- **Custom_Source**: A non-RSS content source (e.g., custom scrapers) that users can subscribe to
- **Following_List**: The unified list displaying both followed tags and subscribed sources
- **Tag_Selector**: The UI component for browsing and following tags
- **Source_Selector**: The UI component for searching and subscribing to RSS/custom sources
- **Subscription_API**: The existing backend API at `/api/sources/*` for managing source subscriptions

## Requirements

### Requirement 1: Unified Following List Display

**User Story:** As a logged-in user, I want to see all my followed tags and subscribed sources in a single unified list, so that I can easily view and manage all my content preferences in one place.

#### Acceptance Criteria

1. WHEN the Settings_Page loads, THE Following_List SHALL display both followed tags and subscribed sources in a single container
2. THE Following_List SHALL visually distinguish tags from sources using icons (🏷️ for tags, 📰 for RSS sources, 🔗 for custom sources)
3. WHEN the Following_List is empty, THE Settings_Page SHALL display an empty state message indicating no items are followed
4. THE Following_List SHALL display each item with its name and type icon
5. WHEN a user clicks on a followed tag in the Following_List, THE Settings_Page SHALL unfollow that tag
6. WHEN a user clicks on a subscribed source in the Following_List, THE Settings_Page SHALL unsubscribe from that source

### Requirement 2: Drag-to-Reorder Following Items

**User Story:** As a user, I want to drag and reorder items in my following list, so that I can prioritize the content sources I care about most.

#### Acceptance Criteria

1. THE Following_List SHALL support drag-and-drop reordering for all items (both tags and sources)
2. WHEN a user drags an item to a new position, THE Settings_Page SHALL update the visual order immediately (optimistic update)
3. WHEN a user completes a drag operation, THE Settings_Page SHALL persist the new order to the backend
4. IF the order persistence fails, THEN THE Settings_Page SHALL revert to the previous order and display an error message

### Requirement 3: Tab-Based Selector Switching

**User Story:** As a user, I want to switch between tag selection and source subscription using tabs, so that I can easily add different types of content to my following list.

#### Acceptance Criteria

1. THE Settings_Page SHALL display a tab bar with two tabs: "🏷️ 标签" (Tags) and "📡 订阅源" (Sources)
2. WHEN the Tags tab is active, THE Settings_Page SHALL display the existing Tag_Selector component
3. WHEN the Sources tab is active, THE Settings_Page SHALL display the Source_Selector component
4. WHEN a user clicks a tab, THE Settings_Page SHALL switch to the corresponding selector without page reload
5. THE Settings_Page SHALL preserve the active tab state during the session

### Requirement 4: Source Selector Search

**User Story:** As a user, I want to search for RSS and custom sources by name, so that I can find and subscribe to specific content sources.

#### Acceptance Criteria

1. THE Source_Selector SHALL display a search input field with placeholder text "🔍 搜索订阅源..."
2. WHEN a user types at least 2 characters in the search field, THE Source_Selector SHALL query the Subscription_API for matching sources
3. THE Source_Selector SHALL debounce search input by 300ms to prevent excessive API calls
4. WHEN search results are returned, THE Source_Selector SHALL display each source with its name, type icon, and subscription status
5. WHEN no search results are found, THE Source_Selector SHALL display an empty state message
6. IF the search API call fails, THEN THE Source_Selector SHALL display an error message

### Requirement 5: Source Subscription Actions

**User Story:** As a user, I want to subscribe and unsubscribe from sources directly in the source selector, so that I can quickly manage my source subscriptions.

#### Acceptance Criteria

1. WHEN a source is not subscribed, THE Source_Selector SHALL display a "订阅" (Subscribe) button for that source
2. WHEN a source is already subscribed, THE Source_Selector SHALL display a "已订阅" (Subscribed) indicator with an unsubscribe option
3. WHEN a user clicks the subscribe button, THE Source_Selector SHALL call the Subscription_API to subscribe and update the UI optimistically
4. WHEN a user clicks to unsubscribe, THE Source_Selector SHALL call the Subscription_API to unsubscribe and update the UI optimistically
5. IF a subscription action fails, THEN THE Source_Selector SHALL revert the UI state and display an error message
6. WHEN a subscription action succeeds, THE Following_List SHALL update to reflect the change

### Requirement 6: Statistics Update

**User Story:** As a user, I want to see accurate statistics that include both my followed tags and subscribed sources, so that I understand my overall content preferences.

#### Acceptance Criteria

1. THE Settings_Page SHALL display a "关注标签" (Followed Tags) count in the statistics section
2. THE Settings_Page SHALL display a "订阅源" (Subscribed Sources) count in the statistics section
3. WHEN a user follows or unfollows a tag, THE Settings_Page SHALL update the tag count immediately
4. WHEN a user subscribes or unsubscribes from a source, THE Settings_Page SHALL update the source count immediately

### Requirement 7: Data Loading and Initialization

**User Story:** As a user, I want the settings page to load my tags and subscriptions efficiently, so that I can start managing my preferences quickly.

#### Acceptance Criteria

1. WHEN the Settings_Page initializes, THE Settings_Page SHALL load user tag settings and source subscriptions in parallel
2. WHILE data is loading, THE Settings_Page SHALL display a loading indicator
3. IF data loading fails, THEN THE Settings_Page SHALL display an error message with retry option
4. WHEN data loading completes, THE Settings_Page SHALL render the Following_List with all items

### Requirement 8: Authentication Requirement

**User Story:** As a system administrator, I want to ensure only authenticated users can access the settings page, so that user preferences are properly secured.

#### Acceptance Criteria

1. WHEN an unauthenticated user attempts to access the Settings_Page, THE Settings_Page SHALL redirect to the authentication page
2. THE Settings_Page SHALL verify authentication status before making any API calls
3. IF a session expires during use, THEN THE Settings_Page SHALL redirect to the authentication page

### Requirement 9: Cache Invalidation

**User Story:** As a user, I want my changes to be reflected across the application, so that my personalized content is consistent everywhere.

#### Acceptance Criteria

1. WHEN a user follows or unfollows a tag, THE Settings_Page SHALL clear the my-tags frontend cache
2. WHEN a user subscribes or unsubscribes from a source, THE Settings_Page SHALL clear relevant frontend caches
3. THE cache invalidation SHALL occur after successful API responses
