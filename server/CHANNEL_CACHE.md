# Shared channel cache

The private `/api/channel-cache` routes store normalized channel-video metadata and native sort snapshots for `m-ytb-beta`. They use the existing API token and SQLite volume; playlist tables and playlist behavior are independent.

## API

- `GET /channel-cache`: compact catalog including IDs, generations, revisions, metadata counts/bytes, snapshot summaries and retained deletions.
- `GET /channel-cache/:id?generation=G&since=R&through=T&after=VIDEO_ID`: at most 500 changed videos, first-page snapshots, fixed revision horizon and a next cursor. The generation must match. Clients advance their cursor only after finishing the transfer.
- `POST /channel-cache/:id/batch`: `{generation,title,videos,snapshots}`. At most 500 normalized videos and three native-order snapshots. Exact publication dates survive metadata refreshes. Complete snapshots survive partial refreshes; newer complete snapshots replace older orderings. Snapshot IDs must already exist.
- `POST /channel-cache/:id/delete`: `{generation}`. Delete video/snapshot rows, advance the generation and retain the channel marker. Retrying an older generation is a no-op so a late delete cannot erase newly collected data.

Video fields are `id,title,age,observedAt,date,views,duration`. Snapshots contain `sort` (0 Latest, 1 Popular, 2 Oldest), `runId,startedAt,complete,ids` (up to 100000). The API rejects unknown record fields, invalid identifiers and oversized batches. No full renderers, YouTube tokens, account data or playback URLs are stored.

Rows merge transactionally. A generation mismatch returns HTTP 409 and the current channel metadata; clients must purge that local generation before any new upload. Tombstones never expire. The catalog uses incrementally maintained statistics instead of scanning all video payloads.

## Verification and deployment

Run `npm run test:channel-cache`. Tests use isolated temporary/in-memory databases and cover merging, date retention, deletion/recollection, delayed retries, paging, authentication and validation.

The deployed instance uses SSH alias `my_agents_187`, Compose directory `/opt/ytb-playlists-api`, container `ytb-playlists-api`, and the existing `ytb-playlists-data` volume. Deploy only the cache route and router registration for this feature, back up the live SQLite database using `better-sqlite3.backup`, retain the previous Docker image for rollback, rebuild Compose and verify authenticated health/cache requests. Credentials remain in the server's existing `.env` and must never be copied into tracked documentation or client pages.
