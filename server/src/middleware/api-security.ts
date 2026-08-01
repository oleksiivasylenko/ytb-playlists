import { createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

type ClientState = {
  windowStartedAt: number;
  requestCount: number;
  blockedUntil: number;
  strikes: number;
  lastViolationAt: number;
  lastSeenAt: number;
};

type ApiSecurityOptions = {
  token: string;
  windowMs: number;
  maxRequests: number;
  blockMs: number;
  maxBlockMs: number;
  strikeResetMs: number;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function tokenDigest(value: string) {
  return createHash('sha256').update(value).digest();
}

function tokensMatch(received: string, expectedDigest: Buffer) {
  return timingSafeEqual(tokenDigest(received), expectedDigest);
}

function requestIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function secondsUntil(timestamp: number, now: number) {
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}

export function loadApiSecurityOptions(token: string): ApiSecurityOptions {
  return {
    token,
    windowMs: positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
    blockMs: positiveInteger(process.env.RATE_LIMIT_BLOCK_MS, 30_000),
    maxBlockMs: positiveInteger(process.env.RATE_LIMIT_MAX_BLOCK_MS, 15 * 60_000),
    strikeResetMs: positiveInteger(process.env.RATE_LIMIT_STRIKE_RESET_MS, 15 * 60_000)
  };
}

export function createApiSecurityMiddleware(options: ApiSecurityOptions) {
  const clients = new Map<string, ClientState>();
  const expectedDigest = tokenDigest(options.token);
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const staleAfter = Math.max(options.strikeResetMs, options.windowMs, options.maxBlockMs) * 2;

    for (const [ip, state] of clients) {
      if (now - state.lastSeenAt > staleAfter && now >= state.blockedUntil) clients.delete(ip);
    }
  }, Math.max(options.windowMs, 60_000));

  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = requestIp(req);
    let state = clients.get(ip);

    if (!state) {
      state = {
        windowStartedAt: now,
        requestCount: 0,
        blockedUntil: 0,
        strikes: 0,
        lastViolationAt: 0,
        lastSeenAt: now
      };
      clients.set(ip, state);
    }

    state.lastSeenAt = now;

    if (state.lastViolationAt && now - state.lastViolationAt >= options.strikeResetMs) {
      state.strikes = 0;
      state.lastViolationAt = 0;
    }

    if (now < state.blockedUntil) {
      const retryAfter = secondsUntil(state.blockedUntil, now);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Try again later.', retryAfterSeconds: retryAfter });
    }

    if (now - state.windowStartedAt >= options.windowMs) {
      state.windowStartedAt = now;
      state.requestCount = 0;
    }

    state.requestCount += 1;
    const resetAt = state.windowStartedAt + options.windowMs;
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - state.requestCount)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (state.requestCount > options.maxRequests) {
      state.strikes += 1;
      state.lastViolationAt = now;
      const blockDuration = Math.min(options.blockMs * (2 ** (state.strikes - 1)), options.maxBlockMs);
      state.blockedUntil = now + blockDuration;
      const retryAfter = secondsUntil(state.blockedUntil, now);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests. Try again later.', retryAfterSeconds: retryAfter });
    }

    const receivedToken = req.get('X-API-Token') || '';
    if (!receivedToken || !tokensMatch(receivedToken, expectedDigest)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}
