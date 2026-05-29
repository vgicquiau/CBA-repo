import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { z } from 'zod';
import { withErrorHandling, requireRole, parseQuery, ok } from '../api/http';
import { getRepository } from '../api/deps';

const QuerySchema = z.object({
  filter: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const { filter, search, fromDate, toDate } = parseQuery(request, QuerySchema);
  const repo = getRepository();
  let bookings = search
    ? await repo.searchBookings(search)
    : await repo.listAllBookings({ fromDate, toDate });
  const today = new Date().toISOString().slice(0, 10);
  if (filter === 'upcoming') bookings = bookings.filter((b) => b.end > today);
  if (filter === 'past') bookings = bookings.filter((b) => b.end <= today);
  return ok({ bookings });
}

app.http('admin-bookings-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/bookings',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
