(function() {
  const panelHtml = `<div id="yt-playlist-alt-panel">
    <div id="yt-playlist-alt-header">
      <div class="yt-playlist-alt-header-main">
        <h3>My Playlists</h3>
        <div id="yt-playlist-alt-sync-status" class="yt-sync-status"></div>
      </div>
      <div class="yt-playlist-alt-header-actions">
      <button id="yt-playlist-alt-refresh" class="yt-panel-header-button" title="Refresh from server" aria-label="Refresh from server">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 0 1-15.2 6.5"></path>
          <path d="M3 12A9 9 0 0 1 18.2 5.5"></path>
          <path d="M18 2v4h-4"></path>
          <path d="M6 22v-4h4"></path>
        </svg>
        <span>Refresh</span>
      </button>
      __CLOSE_BUTTON__
    </div>
    </div>

    <div id="yt-playlist-alt-controls">
      <div class="yt-playlist-alt-row">
        <select id="yt-playlist-alt-select"></select>
        <button id="yt-playlist-alt-sync">Sync Page</button>
        <button id="yt-playlist-alt-scroll-current" class="yt-playlist-alt-icon-button" type="button" title="Scroll to current video" aria-label="Scroll to current video">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="7"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <path d="M12 2v3"></path>
            <path d="M12 19v3"></path>
            <path d="M2 12h3"></path>
            <path d="M19 12h3"></path>
          </svg>
        </button>
      </div>
      <div class="yt-playlist-alt-row">
        <input type="text" id="yt-playlist-alt-search" placeholder="Search...">
        <button id="yt-playlist-alt-filter-toggle" class="yt-playlist-alt-icon-button yt-playlist-alt-filter-button" title="Filters" aria-label="Filters">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>
          </svg>
        </button>
      </div>
      <div id="yt-playlist-alt-settings">
        <div class="yt-settings-section">
          <div class="yt-settings-label">Date filter</div>
          <div class="yt-playlist-alt-row yt-date-filter-row">
            <select id="yt-playlist-alt-date-field" title="Date field">
              <option value="published_at">Published</option>
              <option value="added_at">Added</option>
            </select>
            <select id="yt-playlist-alt-date-direction" title="Date direction">
              <option value="newer">Newer than</option>
              <option value="older">Older than</option>
            </select>
            <input type="number" id="yt-playlist-alt-date-amount" min="1" step="1" placeholder="N">
            <select id="yt-playlist-alt-date-unit" title="Date unit">
              <option value="days">days</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
        </div>
        <div class="yt-settings-section">
          <div class="yt-settings-label">Sort videos by</div>
          <select id="yt-playlist-alt-sort">
            <option value="added-newest">Date Added (Newest)</option>
            <option value="added-oldest">Date Added (Oldest)</option>
            <option value="popular">Most Popular</option>
            <option value="published-newest">Date Published (Newest)</option>
            <option value="published-oldest">Date Published (Oldest)</option>
            <option value="duration-short">Short to Long</option>
            <option value="duration-long">Long to Short</option>
            <option value="title-asc">Title (A to Z)</option>
            <option value="title-desc">Title (Z to A)</option>
          </select>
        </div>
        <div class="yt-settings-section" id="yt-group-sort-section" style="display:none;">
          <div class="yt-settings-label">Sort groups by</div>
          <select id="yt-playlist-alt-group-sort">
            <option value="name-asc">Name (A to Z)</option>
            <option value="name-desc">Name (Z to A)</option>
            <option value="count-high">Group Size (High to Low)</option>
            <option value="count-low">Group Size (Low to High)</option>
            <option value="duration-high">Total Duration (Long first)</option>
            <option value="duration-low">Total Duration (Short first)</option>
          </select>
        </div>
        <div class="yt-settings-section">
          <div class="yt-settings-label">View</div>
          <select id="yt-playlist-alt-status-filter">
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            <option value="removed_by_user">Removed by you</option>
            <option value="removed_from_source">Removed from YouTube playlist</option>
            <option value="unavailable_on_youtube">Unavailable on YouTube</option>
            <option value="missing">Missing / unavailable</option>
          </select>
          <label class="yt-settings-toggle">
            <input type="checkbox" id="yt-playlist-alt-group">
            <span class="yt-settings-toggle-track"></span>
            <span class="yt-settings-toggle-text">Group by Author</span>
          </label>
        </div>
        <div class="yt-settings-section">
          <div class="yt-settings-label">Behaviour</div>
          <label class="yt-settings-toggle">
            <input type="checkbox" id="yt-playlist-alt-remove-fully-watched">
            <span class="yt-settings-toggle-track"></span>
            <span class="yt-settings-toggle-text">Remove after fully watched</span>
          </label>
          <label class="yt-settings-toggle">
            <input type="checkbox" id="yt-playlist-alt-remove-on-skip">
            <span class="yt-settings-toggle-track"></span>
            <span class="yt-settings-toggle-text">Remove on skip / switch</span>
          </label>
        </div>
      </div>
    </div>

    <div id="yt-playlist-alt-videos"></div>
  </div>`;

  function getPanelHtml(options = {}) {
    const closeButton = options.closeButton
      ? '<button id="yt-playlist-alt-close" class="yt-panel-header-button" title="Close" aria-label="Close"><span>&times;</span></button>'
      : '';
    return panelHtml.replace('__CLOSE_BUTTON__', closeButton);
  }

  window.ytbPanelTemplate = { getPanelHtml };
})();
