/**
 * Summary Modal Module
 * One-click article summarization with auto-classification
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

let isModalOpen = false;
let currentNewsId = null;

/**
 * Article type icons
 */
const TYPE_ICONS = {
    'news': '📰',
    'tech-tutorial': '👨‍💻',
    'product': '🚀',
    'opinion': '⚖️',
    'research': '📚',
    'business': '💼',
    'trend': '📈',
    'lifestyle': '🌟',
    'other': '📝'
};

/**
 * Render Markdown to HTML
 */
function renderMarkdown(text) {
    if (!text) return '';
    
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Code blocks (must be before other processing)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Tables
    html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
        const cells = content.split('|').map(c => c.trim());
        if (cells.every(c => /^[-:]+$/.test(c))) {
            return '<tr class="table-separator"></tr>';
        }
        const cellTags = cells.map(c => `<td>${c}</td>`).join('');
        return `<tr>${cellTags}</tr>`;
    });
    html = html.replace(/(<tr>[\s\S]*?<\/tr>\s*)+/g, '<table>$&</table>');
    html = html.replace(/<tr class="table-separator"><\/tr>/g, '');
    
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>\s*)+/g, '<ul>$&</ul>');
    
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    
    // Clean up
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>(<h[1-4]>)/g, '$1');
    html = html.replace(/(<\/h[1-4]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<table>)/g, '$1');
    html = html.replace(/(<\/table>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    
    return html;
}

/**
 * Create modal HTML if not exists
 */
function ensureModalExists() {
    if (document.getElementById('summaryModal')) return;
    
    const modalHtml = `
        <div id="summaryModal" class="summary-modal">
            <div class="summary-modal-backdrop" onclick="closeSummaryModal()"></div>
            <div class="summary-modal-content">
                <button class="summary-modal-close" onclick="closeSummaryModal()" title="关闭">✕</button>
                <div class="summary-modal-header">
                    <h2>📝 AI 智能总结</h2>
                </div>
                <div class="summary-modal-body" id="summaryModalBody">
                    <!-- Content will be inserted here -->
                </div>
                <div class="summary-modal-footer" id="summaryModalFooter" style="display:none;">
                    <!-- Footer with type tag and actions -->
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Open summary modal and generate summary with streaming
 */
async function openSummaryModal(newsId, title, url, sourceId, sourceName) {
    const user = authState.getUser();
    
    if (!user) {
        openLoginModal();
        return;
    }
    
    ensureModalExists();
    
    const modal = document.getElementById('summaryModal');
    const body = document.getElementById('summaryModalBody');
    const footer = document.getElementById('summaryModalFooter');
    
    currentNewsId = newsId;
    isModalOpen = true;
    
    // Show modal with loading state
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    body.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">正在获取文章内容...</div>
                <div class="summary-loading-hint">首次总结需要 10-30 秒</div>
            </div>
        </div>
    `;
    footer.style.display = 'none';
    
    try {
        // Use streaming endpoint
        const res = await fetch('/api/summary/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                title: title,
                news_id: newsId,
                source_id: sourceId,
                source_name: sourceName
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || '生成失败');
        }
        
        // Process SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        
        let fullContent = '';
        let articleType = 'other';
        let articleTypeName = '其他';
        let isStreaming = false;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                
                try {
                    const data = JSON.parse(line.slice(6));
                    
                    switch (data.type) {
                        case 'status':
                            // Update status text
                            const statusEl = document.getElementById('summaryStatusText');
                            if (statusEl) {
                                statusEl.textContent = data.message;
                            }
                            break;
                            
                        case 'type':
                            // Article type determined
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            break;
                            
                        case 'chunk':
                            // Streaming content chunk
                            if (!isStreaming) {
                                // First chunk - switch to content view
                                isStreaming = true;
                                body.innerHTML = `
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `;
                            }
                            fullContent += data.content;
                            // Render incrementally
                            const contentEl = document.getElementById('summaryStreamContent');
                            if (contentEl) {
                                contentEl.innerHTML = renderMarkdown(fullContent) + '<span class="summary-cursor">▌</span>';
                                // Auto scroll to bottom
                                contentEl.scrollTop = contentEl.scrollHeight;
                            }
                            break;
                            
                        case 'cached':
                            // Cached summary - render immediately
                            fullContent = data.summary;
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            body.innerHTML = `
                                <div class="summary-content">
                                    ${renderMarkdown(fullContent)}
                                </div>
                            `;
                            showFooter(url, articleType, articleTypeName, true);
                            updateNewsItemButton(newsId, true);
                            return;
                            
                        case 'done':
                            // Streaming complete
                            const finalEl = document.getElementById('summaryStreamContent');
                            if (finalEl) {
                                finalEl.classList.remove('summary-streaming');
                                finalEl.innerHTML = renderMarkdown(fullContent);
                            }
                            showFooter(url, articleType, articleTypeName, false);
                            updateNewsItemButton(newsId, true);
                            break;
                            
                        case 'error':
                            throw new Error(data.message);
                    }
                } catch (parseErr) {
                    // Ignore parse errors for incomplete chunks
                    if (parseErr.message && !parseErr.message.includes('JSON')) {
                        throw parseErr;
                    }
                }
            }
        }
        
    } catch (e) {
        console.error('[Summary] Error:', e);
        body.innerHTML = `
            <div class="summary-error">
                <div class="summary-error-icon">❌</div>
                <div class="summary-error-text">${e.message}</div>
                <button class="summary-retry-btn" onclick="retrySummaryModal()">重试</button>
            </div>
        `;
    }
}

/**
 * Show footer with type tag and actions
 */
function showFooter(url, articleType, articleTypeName, isCached) {
    const footer = document.getElementById('summaryModalFooter');
    const typeIcon = TYPE_ICONS[articleType] || '📝';
    
    footer.innerHTML = `
        <div class="summary-footer-left">
            <span class="summary-type-tag">${typeIcon} ${articleTypeName}</span>
            <span class="summary-favorited">⭐ 已收藏</span>
            ${isCached ? '<span class="summary-cached-tag">📦 缓存</span>' : ''}
        </div>
        <div class="summary-footer-right">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-link-btn">
                🔗 查看原文
            </a>
            <button class="summary-regenerate-btn" onclick="regenerateSummaryModal()">
                🔄 重新生成
            </button>
        </div>
    `;
    footer.style.display = 'flex';
}

/**
 * Close summary modal
 */
function closeSummaryModal() {
    const modal = document.getElementById('summaryModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    isModalOpen = false;
    currentNewsId = null;
}

/**
 * Retry summary generation
 */
function retrySummaryModal() {
    // Get the original parameters from the button
    const btn = document.querySelector(`.news-summary-btn[data-news-id="${currentNewsId}"]`);
    if (btn) {
        const title = btn.dataset.title;
        const url = btn.dataset.url;
        const sourceId = btn.dataset.sourceId;
        const sourceName = btn.dataset.sourceName;
        openSummaryModal(currentNewsId, title, url, sourceId, sourceName);
    }
}

/**
 * Regenerate summary (delete cache first)
 */
async function regenerateSummaryModal() {
    if (!currentNewsId) return;
    
    // Delete cached summary
    try {
        await fetch(`/api/summary/${encodeURIComponent(currentNewsId)}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error('[Summary] Delete error:', e);
    }
    
    // Retry
    retrySummaryModal();
}

/**
 * Update news item button state
 */
function updateNewsItemButton(newsId, hasSummary) {
    const btn = document.querySelector(`.news-summary-btn[data-news-id="${newsId}"]`);
    if (btn) {
        btn.classList.toggle('has-summary', hasSummary);
        btn.title = hasSummary ? '查看总结' : 'AI 总结';
    }
}

/**
 * Handle summary button click (called from news list)
 */
function handleSummaryClick(event, newsId, title, url, sourceId, sourceName) {
    event.preventDefault();
    event.stopPropagation();
    openSummaryModal(newsId, title, url, sourceId, sourceName);
}

// Expose to window
window.openSummaryModal = openSummaryModal;
window.closeSummaryModal = closeSummaryModal;
window.retrySummaryModal = retrySummaryModal;
window.regenerateSummaryModal = regenerateSummaryModal;
window.handleSummaryClick = handleSummaryClick;

export {
    openSummaryModal,
    closeSummaryModal,
    handleSummaryClick
};
