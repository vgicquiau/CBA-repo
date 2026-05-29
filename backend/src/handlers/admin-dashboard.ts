import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { withErrorHandling, requireRole, ok } from '../api/http';
import { getRepository } from '../api/deps';
import { todayIsoInAppTz, nightsBetween } from '@clos/shared-types';

async function rawHandler(request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
  requireRole(request, 'admin');
  const repo = getRepository();
  const today = todayIsoInAppTz();
  const [allBookings, rooms] = await Promise.all([repo.listAllBookings(), repo.listRooms()]);
  const upcomingArrivals = allBookings
    .filter((b) => b.end > today)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 10);
  const todayCount = allBookings.filter((b) => b.start <= today && b.end > today).length;
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekCount = allBookings.filter((b) => b.start <= weekEnd.toISOString().slice(0, 10) && b.end > today).length;
  const roomsMap = new Map(rooms.map((r) => [r.roomId, r]));
  const totalUpcomingRevenue = upcomingArrivals.reduce((acc, b) => {
    const room = roomsMap.get(b.roomId);
    return room ? acc + nightsBetween(b.start, b.end) * b.people * room.pricePerPerson : acc;
  }, 0);
  return ok({ todayCount, weekCount, totalRoomCount: rooms.length, totalUpcomingRevenue, upcomingArrivals });
}

app.http('admin-dashboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/dashboard',
  handler: withErrorHandling(rawHandler),
});

export const handler = withErrorHandling(rawHandler);
