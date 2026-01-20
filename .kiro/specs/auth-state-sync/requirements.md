# Auth State Sync - Requirements

## 1. Overview

### 1.1 Feature Summary
Improve the login/logout state synchronization system to provide instant UI updates without requiring manual page refreshes, while maintaining reliability through fallback mechanisms.

### 1.2 Problem Statement
Users currently experience poor UX when logging in or out:
- After clicking "退出登录" (logout), the UI still shows logged-in state
- Users must manually force refresh (Ctrl+F5) to see correct state
- OAuth login redirects may not update UI properly
- Multiple independent state management points cause inconsistency

### 1.3 Goals
- Eliminate need for manual page refresh after login/logout
- Provide instant visual feedback (< 500ms)
- Ensure state consistency across all UI components
- Maintain reliability with fallback mechanisms
- Support multi-tab synchronization

## 2. User Stories

### 2.1 Logout Flow
**As a** logged-in user  
**I want to** click "退出登录" and immediately see the logged-out state  
**So that** I don't need to manually refresh the page

**Acceptance Criteria:**
- 2.1.1 Clicking logout shows loading indicator immediately
- 2.1.2 UI updates to logged-out state within 500ms
- 2.1.3 No page refresh or flicker occurs
- 2.1.4 Success toast notification appears
- 2.1.5 User-specific caches are cleared
- 2.1.6 If state sync fails, automatic fallback to page refresh occurs

### 2.2 Login Flow
**As a** visitor  
**I want to** log in and immediately see my user avatar/menu  
**So that** I know the login was successful

**Acceptance Criteria:**
- 2.2.1 After email/password login, UI updates immediately
- 2.2.2 After OAuth login redirect, UI updates automatically
- 2.2.3 User avatar or nickname displays correctly
- 2.2.4 "我的设置" link becomes accessible
- 2.2.5 OAuth URL parameters are cleaned from address bar

### 2.3 Multi-Tab Synchronization
**As a** user with multiple tabs open  
**I want** logout in one tab to update all other tabs  
**So that** I don't see inconsistent states

**Acceptance Criteria:**
- 2.3.1 Logout in one tab triggers state update in all tabs
- 2.3.2 Login in one tab triggers state update in all tabs
- 2.3.3 Updates occur within 1 second across tabs
- 2.3.4 No duplicate API calls are made

### 2.4 Error Handling
**As a** user  
**I want** clear feedback when auth operations fail  
**So that** I know what went wrong and can retry

**Acceptance Criteria:**
- 2.4.1 Network errors show error toast with retry option
- 2.4.2 Timeout errors (> 5s) trigger fallback refresh
- 2.4.3 Server errors (500) show appropriate message
- 2.4.4 State verification failures trigger automatic recovery

### 2.5 Mobile Experience
**As a** mobile user  
**I want** the same smooth login/logout experience  
**So that** the mobile web app feels native

**Acceptance Criteria:**
- 2.5.1 Touch interactions work correctly
- 2.5.2 Loading indicators are visible on small screens
- 2.5.3 No layout shift during state updates
- 2.5.4 Works in WeChat browser (X5 kernel)

## 3. Functional Requirements

### 3.1 State Management

#### 3.1.1 Centralized State Manager
- MUST provide single source of truth for auth state
- MUST support subscription pattern for UI updates
- MUST handle state persistence and caching
- MUST provide methods for login, logout, and state refresh

#### 3.1.2 State Synchronization
- MUST update all subscribed components when state changes
- MUST validate state after critical operations
- MUST handle race conditions in state updates
- MUST support cross-tab synchronization

#### 3.1.3 Cache Management
- MUST clear user-specific caches on logout
- MUST preserve anonymous user preferences
- MUST handle localStorage quota errors gracefully
- MUST support selective cache clearing

### 3.2 UI Components

#### 3.2.1 Auth Button Component
- MUST display correct state (logged in vs logged out)
- MUST update automatically when state changes
- MUST show loading state during operations
- MUST handle click events appropriately

#### 3.2.2 User Menu Component
- MUST display user avatar or initial
- MUST show user nickname or email
- MUST provide access to settings and logout
- MUST close dropdown when clicking outside

#### 3.2.3 Loading Indicators
- MUST show overlay during logout operation
- MUST prevent duplicate clicks during loading
- MUST display progress or spinner
- MUST be accessible (ARIA labels)

#### 3.2.4 Toast Notifications
- MUST show success message after logout
- MUST show error messages on failure
- MUST auto-dismiss after 3-5 seconds
- MUST support different severity levels

### 3.3 API Integration

#### 3.3.1 Session Validation
- MUST call `/api/auth/me` to check current state
- MUST handle 404 (auth not available) gracefully
- MUST handle 500 (server error) gracefully
- MUST cache validation results appropriately

#### 3.3.2 Logout Operation
- MUST call `/api/auth/logout` with POST method
- MUST include credentials in request
- MUST handle timeout (5 second limit)
- MUST verify state after logout completes

#### 3.3.3 OAuth Callback Handling
- MUST detect `?login=timestamp` URL parameter
- MUST trigger state refresh on detection
- MUST clean URL parameters after processing
- MUST handle OAuth errors gracefully

### 3.4 Fallback Mechanisms

#### 3.4.1 State Verification
- MUST verify state after logout operation
- MUST detect when state sync fails
- MUST trigger fallback refresh on failure
- MUST log verification failures

#### 3.4.2 Forced Refresh
- MUST use cache-busting query parameter
- MUST clear browser caches before refresh
- MUST preserve user's current tab/scroll position when possible
- MUST only trigger as last resort

#### 3.4.3 Timeout Handling
- MUST set 5 second timeout for logout API
- MUST trigger fallback on timeout
- MUST show appropriate error message
- MUST allow user to retry

## 4. Non-Functional Requirements

### 4.1 Performance
- State updates MUST complete within 500ms (normal case)
- API calls MUST timeout after 5 seconds
- UI MUST remain responsive during operations
- Memory usage MUST not increase significantly

### 4.2 Reliability
- State sync success rate MUST be > 99%
- Fallback mechanism MUST work 100% of time
- No data loss during logout operation
- Graceful degradation on old browsers

### 4.3 Compatibility
- MUST work on Chrome, Firefox, Safari, Edge (latest 2 versions)
- MUST work on iOS Safari and Android Chrome
- MUST work in WeChat browser (X5 kernel)
- SHOULD work on IE11 with polyfills

### 4.4 Security
- MUST clear session cookies on logout
- MUST clear sensitive data from localStorage
- MUST use httpOnly cookies for session tokens
- MUST validate session on every critical operation

### 4.5 Accessibility
- Loading indicators MUST have ARIA labels
- Buttons MUST be keyboard accessible
- Toast notifications MUST be announced by screen readers
- Focus management MUST be handled correctly

### 4.6 Maintainability
- Code MUST be modular and testable
- State manager MUST be framework-agnostic
- Components MUST have clear interfaces
- Logging MUST be comprehensive for debugging

## 5. Technical Constraints

### 5.1 Browser APIs
- MUST use standard Web APIs (no framework dependencies)
- MAY use BroadcastChannel for multi-tab sync
- MAY use localStorage events as fallback
- MUST provide polyfills for older browsers

### 5.2 Existing Codebase
- MUST integrate with existing `auth.js` module
- MUST work with current `viewer.html` template
- MUST maintain compatibility with backend API
- SHOULD minimize changes to existing code

### 5.3 Build Process
- Changes to JS files REQUIRE running `npm run build:js`
- Deployment MUST use `./deploy-fast.sh` for testing
- Production deployment MUST use full rebuild
- Asset versioning MUST be updated

## 6. Out of Scope

### 6.1 Not Included in This Feature
- Biometric authentication (fingerprint, face ID)
- Remember me / persistent login
- Social login providers beyond existing (GitHub, Google, WeChat)
- Two-factor authentication (2FA)
- Account deletion or data export
- Email verification for new accounts
- Password strength requirements UI

### 6.2 Future Enhancements
- Real-time session expiration warnings
- Concurrent session management
- Login history and device management
- OAuth token refresh mechanism

## 7. Dependencies

### 7.1 Backend APIs
- `/api/auth/me` - Get current user
- `/api/auth/logout` - Logout current session
- `/api/auth/login` - Email/password login
- OAuth callback endpoints

### 7.2 Frontend Modules
- `core.js` - Core utilities and TR namespace
- `viewer.html` - Main template with auth button
- `viewer.css` - Styling for auth components

### 7.3 External Libraries
- None (vanilla JavaScript implementation)

## 8. Success Metrics

### 8.1 Functional Metrics
- ✅ Logout updates UI without refresh: 100% of cases
- ✅ State sync completes in < 500ms: > 95% of cases
- ✅ Fallback refresh works: 100% of cases
- ✅ Multi-tab sync works: > 90% of cases

### 8.2 User Experience Metrics
- ✅ No manual refresh needed: 100% of users
- ✅ Clear loading feedback: User testing confirms
- ✅ Error messages are helpful: User testing confirms
- ✅ Mobile experience is smooth: User testing confirms

### 8.3 Technical Metrics
- ✅ Test coverage: > 80%
- ✅ No console errors: 100% of operations
- ✅ Memory leaks: None detected
- ✅ Performance regression: < 5% overhead

## 9. Testing Requirements

### 9.1 Unit Tests
- State manager methods (subscribe, notify, logout)
- Cache clearing logic
- State validation logic
- Timeout handling

### 9.2 Integration Tests
- Full logout flow (API + UI update)
- Full login flow (API + UI update)
- OAuth callback handling
- Multi-tab synchronization

### 9.3 E2E Tests
- User clicks logout, sees logged-out state
- User logs in, sees logged-in state
- OAuth login redirects and updates UI
- Error scenarios (network failure, timeout)

### 9.4 Manual Testing
- Test in WeChat browser
- Test on iOS Safari
- Test on Android Chrome
- Test with slow network (throttling)
- Test with multiple tabs open

## 10. Risks and Mitigations

### 10.1 Risk: Browser Compatibility
**Impact:** High  
**Probability:** Medium  
**Mitigation:** Comprehensive browser testing, polyfills, fallback to page refresh

### 10.2 Risk: Race Conditions
**Impact:** Medium  
**Probability:** Medium  
**Mitigation:** Proper state locking, debouncing, comprehensive logging

### 10.3 Risk: Cookie Clearing Timing
**Impact:** High  
**Probability:** Low  
**Mitigation:** Add delay after logout API, verify state, fallback refresh

### 10.4 Risk: Multi-Tab Sync Complexity
**Impact:** Low  
**Probability:** Medium  
**Mitigation:** Use BroadcastChannel with localStorage fallback, extensive testing

### 10.5 Risk: Implementation Complexity
**Impact:** Medium  
**Probability:** Medium  
**Mitigation:** Phased implementation, thorough code review, rollback plan

## 11. Implementation Phases

### Phase 1: Core State Management (Priority: High)
- Create AuthStateManager class
- Implement subscription pattern
- Add state validation
- Add cache clearing

### Phase 2: UI Components (Priority: High)
- Refactor auth button to use state manager
- Add loading indicators
- Add toast notifications
- Update user menu rendering

### Phase 3: Fallback Mechanisms (Priority: High)
- Add state verification after logout
- Implement forced refresh fallback
- Add timeout handling
- Add comprehensive logging

### Phase 4: Multi-Tab Sync (Priority: Medium)
- Implement BroadcastChannel sync
- Add localStorage event fallback
- Test cross-tab scenarios
- Handle edge cases

### Phase 5: Testing & Polish (Priority: High)
- Write unit tests
- Write integration tests
- Manual testing on all browsers
- Performance optimization

## 12. Glossary

- **Auth State**: Current authentication status (logged in/out) and user info
- **State Manager**: Centralized class managing auth state and notifying subscribers
- **Subscription**: Pattern where components register callbacks for state changes
- **Fallback Refresh**: Page reload triggered when client-side state sync fails
- **Toast Notification**: Temporary message overlay showing operation result
- **Multi-Tab Sync**: Synchronizing auth state across multiple browser tabs
- **BroadcastChannel**: Browser API for cross-tab communication
- **Cache Busting**: Adding query parameter to force fresh page load
