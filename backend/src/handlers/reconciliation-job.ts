import type { ScheduledHandler } from 'aws-lambda';
import { PublishCommand } from '@aws-sdk/client-sns';
import { getRepository, getSnsClient } from '../api/deps';
import { logger } from '../api/logger';
import { todayIsoInAppTz, intervalsOverlap } from '@clos/shared-types';
import type { Booking } from '@clos/shared-types';

// EventBridge cron (0 1 * * ? * — 03:00 Paris) : détecte les doubles
// réservations passées à travers la fenêtre de race condition et alerte l'admin.
export const handler: ScheduledHandler = async () => {
  const topicArn = process.env.SNS_TOPIC_ARN!;
  const repo = getRepository();
  const sns = getSnsClient();

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
      const event = {
        type: 'BOOKING_CONFLICT_DETECTED' as const,
        bookingIds,
        roomId,
        detectedAt: new Date().toISOString(),
      };
      await sns.send(new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(event),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'BOOKING_CONFLICT_DETECTED' },
        },
      }));
      logger.warn('Booking conflicts detected', { roomId, bookingIds });
      conflictsDetected++;
    }
  }

  logger.info('Reconciliation complete', { roomCount: byRoom.size, conflictsDetected });
};
