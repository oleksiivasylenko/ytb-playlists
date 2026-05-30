import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const defaultPlainSummaryPrompt = `You are summarizing a YouTube video transcript for a personal knowledge workflow.

Write the summary in the requested language.
Preserve concrete names, tools, libraries, product names, numbers, and timestamps when they matter.
Do not invent facts that are not supported by the transcript.

Return:
1. A concise title.
2. A short executive summary.
3. Key points as bullets, grouped by topic when useful.
4. Important timestamped moments using the transcript timestamps.
5. Actionable takeaways or follow-up search terms when relevant.`;

const defaultHtmlSummaryPrompt = `Create a self-contained HTML fragment that summarizes a YouTube video transcript.

Write the content in the requested language.
Use semantic HTML only: article, header, section, h1-h3, p, ul, li, table, blockquote, code, strong, em.
Do not include script tags, external stylesheets, external images, iframes, forms, or event handlers.
Use inline style attributes sparingly for layout and emphasis, because the fragment will be rendered inside a popup.
Preserve important timestamps, names, tools, libraries, product names, numbers, and concrete claims.
Do not invent facts that are not supported by the transcript.

The page should include:
1. A clear title.
2. A compact executive summary.
3. Key ideas grouped into sections.
4. A timestamped highlights section.
5. Actionable takeaways or follow-up search terms when relevant.`;

const defaultTagPrompt = `Create concise tags for a YouTube video using only the transcript and metadata.

Return valid JSON only, with this shape:
{
  "tags": ["tag one", "tag two"]
}

Use the language that best matches the transcript and the user's tagging workflow.
Keep each tag short, specific, and useful for search.
Do not include explanations, markdown, numbering, or unsupported facts.`;

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some(col => col.name === column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

function ensureVideoSummariesModeKey() {
  const columns = db.prepare('PRAGMA table_info(video_summaries)').all() as { name: string; pk: number }[];
  const videoId = columns.find(col => col.name === 'video_id');
  const mode = columns.find(col => col.name === 'mode');
  if (videoId?.pk === 1 && mode?.pk === 2) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS video_summaries_new (
      video_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'plain',
      model TEXT NOT NULL,
      language TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      provider_response_id TEXT,
      transcript_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (video_id, mode),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    INSERT OR IGNORE INTO video_summaries_new (
      video_id, mode, model, language, prompt, summary, provider_response_id,
      transcript_updated_at, created_at, updated_at
    )
    SELECT video_id,
           COALESCE(NULLIF(mode, ''), 'plain'),
           model,
           language,
           prompt,
           summary,
           provider_response_id,
           transcript_updated_at,
           created_at,
           updated_at
    FROM video_summaries;

    DROP TABLE video_summaries;
    ALTER TABLE video_summaries_new RENAME TO video_summaries;
  `);
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_type TEXT DEFAULT 'manual',
      source_id TEXT,
      source_url TEXT,
      last_synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT,
      thumbnail TEXT,
      author TEXT,
      view_count INTEGER DEFAULT 0,
      published_at DATETIME,
      duration INTEGER DEFAULT 0,
      availability TEXT DEFAULT 'unknown',
      last_checked_at DATETIME,
      transcript_unavailable INTEGER DEFAULT 0,
      transcript_unavailable_at DATETIME,
      transcript_unavailable_reason TEXT,
      tags_json TEXT,
      tags_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_videos (
      playlist_id INTEGER,
      video_id TEXT,
      sort_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME,
      missing_since DATETIME,
      unavailable_since DATETIME,
      last_checked_at DATETIME,
      youtube_removed_at DATETIME,
      youtube_cleanup_error TEXT,
      moved_to_playlist_id INTEGER,
      moved_at DATETIME,
      last_sync_run_id INTEGER,
      PRIMARY KEY (playlist_id, video_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      seen_count INTEGER DEFAULT 0,
      added_count INTEGER DEFAULT 0,
      reactivated_count INTEGER DEFAULT 0,
      removed_count INTEGER DEFAULT 0,
      unavailable_count INTEGER DEFAULT 0,
      error TEXT,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_transcripts (
      video_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      language TEXT DEFAULT 'en',
      format TEXT DEFAULT 'text',
      text TEXT NOT NULL,
      timestamped_text TEXT,
      segments_json TEXT,
      raw_json TEXT,
      is_generated INTEGER DEFAULT 0,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS summary_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      model TEXT NOT NULL,
      language TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html_model TEXT,
      html_prompt TEXT,
      summary_mode TEXT DEFAULT 'plain',
      transcript_languages TEXT DEFAULT 'en,uk,ru',
      tag_prompt TEXT,
      preferred_tags TEXT,
      tag_display_limit INTEGER DEFAULT 5,
      auto_transcript_enabled INTEGER DEFAULT 0,
      auto_summary_enabled INTEGER DEFAULT 0,
      auto_tags_enabled INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS video_summaries (
      video_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'plain',
      model TEXT NOT NULL,
      language TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      provider_response_id TEXT,
      transcript_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (video_id, mode),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_source
      ON playlists(source_type, source_id)
      WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_playlist_videos_status
      ON playlist_videos(playlist_id, status);

    CREATE INDEX IF NOT EXISTS idx_sync_runs_playlist
      ON sync_runs(playlist_id, started_at);

    CREATE INDEX IF NOT EXISTS idx_video_transcripts_fetched
      ON video_transcripts(fetched_at);

    CREATE INDEX IF NOT EXISTS idx_video_summaries_updated
      ON video_summaries(updated_at);
  `);

  ensureColumn('playlist_videos', 'youtube_removed_at', 'DATETIME');
  ensureColumn('playlist_videos', 'youtube_cleanup_error', 'TEXT');
  ensureColumn('playlist_videos', 'moved_to_playlist_id', 'INTEGER');
  ensureColumn('playlist_videos', 'moved_at', 'DATETIME');
  ensureColumn('video_transcripts', 'timestamped_text', 'TEXT');
  ensureColumn('video_transcripts', 'segments_json', 'TEXT');
  ensureColumn('summary_settings', 'html_model', 'TEXT');
  ensureColumn('summary_settings', 'html_prompt', 'TEXT');
  ensureColumn('summary_settings', 'summary_mode', "TEXT DEFAULT 'plain'");
  ensureColumn('summary_settings', 'transcript_languages', "TEXT DEFAULT 'en,uk,ru'");
  ensureColumn('summary_settings', 'tag_prompt', 'TEXT');
  ensureColumn('summary_settings', 'preferred_tags', 'TEXT');
  ensureColumn('summary_settings', 'tag_display_limit', 'INTEGER DEFAULT 5');
  ensureColumn('summary_settings', 'auto_transcript_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('summary_settings', 'auto_summary_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('summary_settings', 'auto_tags_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('videos', 'transcript_unavailable', 'INTEGER DEFAULT 0');
  ensureColumn('videos', 'transcript_unavailable_at', 'DATETIME');
  ensureColumn('videos', 'transcript_unavailable_reason', 'TEXT');
  ensureColumn('videos', 'tags_json', 'TEXT');
  ensureColumn('videos', 'tags_updated_at', 'DATETIME');
  ensureColumn('video_summaries', 'mode', "TEXT DEFAULT 'plain'");
  ensureVideoSummariesModeKey();

  db.prepare(`
    INSERT OR IGNORE INTO summary_settings (id, model, language, prompt, html_model, html_prompt, transcript_languages)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `).run(
    'google/gemini-2.5-flash',
    'Ukrainian',
    defaultPlainSummaryPrompt,
    'google/gemini-2.5-flash',
    defaultHtmlSummaryPrompt,
    'en,uk,ru'
  );

  db.prepare(`
    UPDATE summary_settings
    SET html_model = COALESCE(NULLIF(html_model, ''), model),
        html_prompt = COALESCE(NULLIF(html_prompt, ''), ?),
        transcript_languages = COALESCE(NULLIF(transcript_languages, ''), 'en,uk,ru'),
        tag_prompt = COALESCE(NULLIF(tag_prompt, ''), ?),
        tag_display_limit = CASE
          WHEN tag_display_limit IS NULL OR tag_display_limit < 1 THEN 5
          ELSE tag_display_limit
        END,
        language = CASE WHEN language = 'uk' THEN 'Ukrainian' ELSE language END
    WHERE id = 1
  `).run(defaultHtmlSummaryPrompt, defaultTagPrompt);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlist_videos_youtube_cleanup
      ON playlist_videos(playlist_id, status, youtube_removed_at);
  `);
}

export default db;
