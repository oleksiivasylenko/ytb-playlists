"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ytb-channel-cache-test-"));
process.env.DATABASE_PATH = path.join(directory, "bootstrap.sqlite");
const { createChannelCacheRouter } = require("../dist/routes/channel-cache");
const defaultDb = require("../dist/db").default;
const channel = `UC${"a".repeat(22)}`;
const videoId = number => String(number).padStart(11, "0");
const video = (number, overrides = {}) => ({ id: videoId(number), title: `Video ${number}`, age: "2 months ago", observedAt: 1760000000000, date: "", views: "123 views", duration: "3:00", ...overrides });

async function server() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((req, res, next) => req.headers["x-api-token"] === "test-only" ? next() : res.sendStatus(401));
  app.use(createChannelCacheRouter(db));
  app.use((error, _req, res, _next) => res.status(400).json({ error: error.message }));
  const listener = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  const request = async (url, body, token = "test-only") => {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}${url}`, {
      method: body === undefined ? "GET" : "POST", headers: { "X-API-Token": token, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  return { request, async close() { await new Promise(resolve => listener.close(resolve)); db.close(); } };
}

test("cache pages merge metadata, preserve exact dates and transfer only changed records", async () => {
  const api = await server();
  try {
    const batch = videos => api.request(`/channel-cache/${channel}/batch`, { generation: 0, title: "Channel", videos, snapshots: [] });
    assert.equal((await batch([video(1, { date: "2025-02-13" })])).status, 200);
    await batch([video(1, { observedAt: 1770000000000, title: "Updated title" }), video(2)]);
    const result = await api.request(`/channel-cache/${channel}?generation=0&since=1`);
    assert.equal(result.data.videos.length, 2);
    assert.equal(result.data.videos[0].date, "2025-02-13");
    assert.equal(result.data.videos[0].title, "Updated title");
    assert.equal((await api.request(`/channel-cache/${channel}?generation=0&since=2`)).data.videos.length, 0);
    const listing = await api.request("/channel-cache");
    assert.equal(listing.data.channels[0].count, 2);
    assert.ok(listing.data.channels[0].bytes > 0);
  } finally { await api.close(); }
});

test("delete generations stop offline resurrection and stale delete retries preserve recollected data", async () => {
  const api = await server();
  try {
    const batch = generation => api.request(`/channel-cache/${channel}/batch`, { generation, title: "Channel", videos: [video(1)], snapshots: [] });
    await batch(0);
    const deleted = await api.request(`/channel-cache/${channel}/delete`, { generation: 0 });
    assert.equal(deleted.data.channel.generation, 1);
    assert.equal(deleted.data.channel.count, 0);
    assert.equal((await batch(0)).status, 409);
    assert.equal((await batch(1)).status, 200);
    const replay = await api.request(`/channel-cache/${channel}/delete`, { generation: 0 });
    assert.equal(replay.data.channel.count, 1);
    assert.equal(replay.data.channel.generation, 1);
    assert.equal((await api.request(`/channel-cache/${channel}?generation=0`)).status, 409);
  } finally { await api.close(); }
});

test("complete native order survives partial refresh and newer complete snapshots replace it", async () => {
  const api = await server();
  try {
    const snapshot = (runId, startedAt, ids, complete) => ({ sort: 1, runId, startedAt, ids: ids.map(videoId), complete });
    const write = snapshots => api.request(`/channel-cache/${channel}/batch`, { generation: 0, title: "Channel", videos: [video(1), video(2)], snapshots });
    await write([snapshot("a", 100, [1, 2], true)]);
    await write([snapshot("b", 200, [2], false)]);
    assert.deepEqual((await api.request(`/channel-cache/${channel}?generation=0`)).data.snapshots[0].ids, [videoId(1), videoId(2)]);
    await write([snapshot("b", 200, [2, 1], true)]);
    assert.deepEqual((await api.request(`/channel-cache/${channel}?generation=0`)).data.snapshots[0].ids, [videoId(2), videoId(1)]);
  } finally { await api.close(); }
});

test("large channels use stable bounded data pages", async () => {
  const api = await server();
  try {
    await api.request(`/channel-cache/${channel}/batch`, { generation: 0, title: "Channel", videos: Array.from({ length: 500 }, (_, index) => video(index)), snapshots: [] });
    await api.request(`/channel-cache/${channel}/batch`, { generation: 0, title: "Channel", videos: [video(500)], snapshots: [] });
    const first = (await api.request(`/channel-cache/${channel}?generation=0`)).data;
    assert.equal(first.videos.length, 500);
    const second = (await api.request(`/channel-cache/${channel}?generation=0&through=${first.through}&after=${first.next}`)).data;
    assert.equal(second.videos.length, 1);
    assert.equal(second.next, null);
  } finally { await api.close(); }
});

test("authentication and strict payload validation exclude renderer and account data", async () => {
  const api = await server();
  try {
    assert.equal((await api.request("/channel-cache", undefined, "")).status, 401);
    assert.equal((await api.request(`/channel-cache/${channel}/batch`, { generation: 0, title: "Channel", videos: [video(1, { renderer: {} })], snapshots: [] })).status, 400);
    assert.equal((await api.request("/channel-cache/not-a-channel?generation=0")).status, 400);
    assert.equal((await api.request(`/channel-cache/${channel}/delete`, { generation: -1 })).status, 400);
  } finally { await api.close(); }
});

after(() => { defaultDb.close(); fs.rmSync(directory, { recursive: true, force: true }); });
