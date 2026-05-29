import { app, type InvocationContext } from '@azure/functions';
import { getRepository, publishEvent } from '../api/deps';
import { logger } from '../api/logger';
import { todayIsoInAppTz, intervalsOverlap } from '@clos/shared-types';
import type { Booking } from '@clos/shared-types';

// Timer trigger — runs daily at 03:00 Paris time (cron: 0 0 3 * * *)
export async function run(_timer: unknown, _context: InvocationContext): Promise<void> {
  const repo = getRepository();
  const today = todayIsoInAppTz();
  const bookings = await repo.listAllBookings({ fromDate: today });

  const byRoom = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (!byRoom.has(b.roomId)) byRoom.set(b.roomId, []);
    byRoom.get(b.roomId)!.push(b);
  }

  let conflictsDetected = 0;

  for (const [roomId, roomBookings] of byRoom) {
    const conflictingIds = new Set<string>();

    for (let i = 0; i < roomBookings.length; i++) {
      for (let j = i + 1; j < roomBookings.length; j++) {
        const a = roomBookings[i];
        const b = roomBookings[j];
        if (intervalsOverlap(a.start, a.end, b.start, b.end)) {
          conflictingIds.add(a.bookingId);
          conflictingIds.add(b.bookingId);
        }
      }
    }

    if (conflictingIds.size > 0) {
      const bookingIds = [...conflictingIds];
      await publishEvent({
        type: 'BOOKING_CONFLICT_DETECTED',
        bookingIds,
        roomId,
        detectedAt: new Date().toISOString(),
      });
      logger.warn('Booking conflicts detected', { roomId, bookingIds });
      conflictsDetected++;
    }
  }

  logger.info('Reconciliation complete', { roomCount: byRoom.size, conflictsDetected });
}

app.timer('reconciliation-job', {
  schedule: '0 0 3 * * *', // daily at 03:00 UTC (≈ 04:00 Paris)
  handler: run,
});
