import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  CapacityReductionError,
  ForbiddenError,
} from './repository';
import type { Booking } from '@clos/shared-types';

const mockBooking: Booking = {
  bookingId: 'b-1',
  roomId: 'glycine',
  userId: 'u-1',
  name: 'Claire',
  start: '2026-05-16',
  end: '2026-05-19',
  people: 2,
  notes: '',
  reference: 'CLOS-ABCD1234',
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  createdBy: 'u-1',
};

describe('ConflictError', () => {
  it('has name ConflictError', () => {
    const err = new ConflictError([mockBooking]);
    expect(err.name).toBe('ConflictError');
  });

  it('stores conflicting bookings', () => {
    const err = new ConflictError([mockBooking]);
    expect(err.conflictingBookings).toHaveLength(1);
    expect(err.conflictingBookings[0].bookingId).toBe('b-1');
  });

  it('is an instance of Error', () => {
    expect(new ConflictError([])).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('has name NotFoundError', () => {
    const err = new NotFoundError('Room', 'glycine');
    expect(err.name).toBe('NotFoundError');
  });

  it('stores entity and id', () => {
    const err = new NotFoundError('Room', 'glycine');
    expect(err.entity).toBe('Room');
    expect(err.id).toBe('glycine');
  });

  it('message includes entity and id', () => {
    const err = new NotFoundError('Booking', 'b-123');
    expect(err.message).toContain('Booking');
    expect(err.message).toContain('b-123');
  });
});

describe('ValidationError', () => {
  it('has name ValidationError', () => {
    const err = new ValidationError('capacity', 'must be >= 1');
    expect(err.name).toBe('ValidationError');
  });

  it('stores field and reason', () => {
    const err = new ValidationError('start', 'must be before end');
    expect(err.field).toBe('start');
    expect(err.reason).toBe('must be before end');
  });

  it('is an instance of Error', () => {
    expect(new ValidationError('x', 'y')).toBeInstanceOf(Error);
  });
});

describe('CapacityReductionError', () => {
  it('has name CapacityReductionError', () => {
    const err = new CapacityReductionError([mockBooking]);
    expect(err.name).toBe('CapacityReductionError');
  });

  it('stores blocking bookings', () => {
    const err = new CapacityReductionError([mockBooking]);
    expect(err.blockingBookings).toHaveLength(1);
  });

  it('is an instance of Error', () => {
    expect(new CapacityReductionError([])).toBeInstanceOf(Error);
  });
});

describe('ForbiddenError', () => {
  it('has name ForbiddenError', () => {
    const err = new ForbiddenError('admin only');
    expect(err.name).toBe('ForbiddenError');
  });

  it('stores reason as message', () => {
    const err = new ForbiddenError('insufficient permissions');
    expect(err.reason).toBe('insufficient permissions');
    expect(err.message).toBe('insufficient permissions');
  });

  it('is an instance of Error', () => {
    expect(new ForbiddenError('x')).toBeInstanceOf(Error);
  });
});
