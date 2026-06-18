/**
 * Activity log + traffic stats routes.
 */
import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as db from '../services/db';
import { authMiddleware } from '../auth';

const activity = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// GET /api/activity — list recent activity
activity.get('/activity', authMiddleware, async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const items = await db.listActivity(c.env.DB, limit, offset);
  const total = await db.getActivityCount(c.env.DB);
  return c.json({ items, total, hasMore: offset + items.length < total });
});

// GET /api/stats/traffic — traffic statistics
activity.get('/stats/traffic', authMiddleware, async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const stats = await db.getTrafficStats(c.env.DB, days);
  const byDay = await db.getTrafficByDay(c.env.DB, days);
  return c.json({ ...stats, byDay, days });
});

export default activity;
