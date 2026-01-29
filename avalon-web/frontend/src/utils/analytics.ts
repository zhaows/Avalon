/**
 * Analytics tracking utility
 */

// Generate a unique visitor ID and store in localStorage
function getVisitorId(): string {
  const key = 'avalon_visitor_id';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = 'v_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

// Track last page view to prevent duplicates (React StrictMode causes double renders)
let lastPageView: { page: string; time: number } | null = null;
const DEBOUNCE_MS = 1000; // Ignore duplicate page views within 1 second

interface TrackOptions {
  event?: string;
  page?: string;
  referrer?: string;
}

/**
 * Track a page view or event
 */
export async function track(options: TrackOptions = {}): Promise<void> {
  try {
    const page = options.page || window.location.pathname;
    const event = options.event || 'page_view';
    const now = Date.now();
    
    // Debounce duplicate page views (React StrictMode double-render fix)
    if (event === 'page_view' && lastPageView) {
      if (lastPageView.page === page && now - lastPageView.time < DEBOUNCE_MS) {
        return; // Skip duplicate
      }
    }
    
    // Update last page view
    if (event === 'page_view') {
      lastPageView = { page, time: now };
    }
    
    const apiHost = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';
    
    const payload = {
      event,
      page,
      visitor_id: getVisitorId(),
      referrer: options.referrer || document.referrer || null,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
    };

    // Use sendBeacon for reliable tracking (doesn't block page)
    const url = `${apiHost}/api/analytics/track`;
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    
    // Try sendBeacon first, fall back to fetch
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch (error) {
    // Silently ignore tracking errors
    console.debug('Analytics tracking failed:', error);
  }
}

/**
 * Track page view - convenience function
 */
export function trackPageView(page?: string): void {
  track({ event: 'page_view', page });
}

/**
 * Track custom event
 */
export function trackEvent(eventName: string, page?: string): void {
  track({ event: eventName, page });
}
