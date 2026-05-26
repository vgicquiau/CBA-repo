import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import { withErrorHandling, requireRole, parseQuery, ok } from '../api/http';
import { getRepository } from '../api/deps';

const QuerySchema = z.object({
  filter: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

const rawHandler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  requireRole(event, 'admin');
  const { filter, search, fromDate, toDate } = parseQuery(event, QuerySchema);
  const repo = getRepository();
  let bookings = search
    ? await repo.searchBookings(search)
    : await repo.listAllBookings({ fromDate, toDate });
  const today = new Date().toISOString().slice(0, 10);
  if (filter === 'upcoming') bookings = bookings.filter((b) => b.end > today);
  if (filter === 'past') bookings = bookings.filter((b) => b.end <= today);
  return ok({ bookings });
};

export const handler = withErrorHandling(rawHandler);
