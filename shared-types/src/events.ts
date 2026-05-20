export type DomainEvent =
  | { type: 'BOOKING_CREATED';   bookingId: string; userId: string | null; roomId: string; start: string; end: string }
  | { type: 'BOOKING_UPDATED';   bookingId: string; userId: string | null; roomId: string; changes: Record<string, unknown> }
  | { type: 'BOOKING_CANCELLED'; bookingId: string; userId: string | null; roomId: string; reason: 'USER_CANCELLED' | 'ADMIN_CANCELLED' | 'ROOM_DELETED' | 'USER_DELETED' }
  | { type: 'USER_INVITED';      userId: string; email: string; role: 'guest' | 'admin' }
  | { type: 'BOOKING_CONFLICT_DETECTED'; bookingIds: string[]; roomId: string; detectedAt: string };
