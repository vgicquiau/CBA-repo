import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiClient } from './client';
import { useRooms, useCreateBooking, useDeleteRoom } from './hooks';
import type { Room, Booking, DeleteRoomResult } from '@clos/shared-types';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    putExternal: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockRoom: Room = {
  roomId: 'glycine',
  name: 'La Glycine',
  wing: 'Aile gauche',
  floor: 0,
  area: 20,
  capacity: 2,
  beds: '1 lit double',
  closet: 'Armoire',
  equipment: [],
  linen: [],
  pricePerPerson: 50,
  photoTint: 'rosé',
  blurb: 'Une belle chambre',
  photoUrl: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
};

const mockBooking: Booking = {
  bookingId: 'b1',
  roomId: 'glycine',
  userId: 'u1',
  name: 'Test',
  start: '2026-06-01',
  end: '2026-06-05',
  people: 2,
  notes: '',
  reference: 'CLOS-00000001',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  createdBy: 'u1',
};

describe('useRooms', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('retourne la liste des chambres depuis GET /v1/rooms', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ rooms: [mockRoom] });
    const { result } = renderHook(() => useRooms(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockRoom]);
    expect(apiClient.get).toHaveBeenCalledWith('/v1/rooms');
  });

  it('isError est true en cas d\'échec réseau', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useRooms(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreateBooking', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('appelle POST /v1/bookings avec l\'input correct', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(mockBooking);
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });
    const input = {
      roomId: 'glycine',
      start: '2026-06-01',
      end: '2026-06-05',
      people: 2,
      name: 'Test',
      notes: '',
    };
    result.current.mutate(input);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.post).toHaveBeenCalledWith('/v1/bookings', input);
    expect(result.current.data).toEqual(mockBooking);
  });

  it('isError est true si le serveur renvoie une erreur', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('409 conflict'));
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });
    result.current.mutate({
      roomId: 'glycine',
      start: '2026-06-01',
      end: '2026-06-05',
      people: 2,
      name: 'Test',
      notes: '',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDeleteRoom', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('appelle DELETE /v1/admin/rooms/{roomId} et retourne DeleteRoomResult', async () => {
    const mockResult: DeleteRoomResult = { deletedRoomId: 'glycine', cancelledBookings: 2 };
    vi.mocked(apiClient.delete).mockResolvedValue(mockResult);
    const { result } = renderHook(() => useDeleteRoom(), { wrapper: createWrapper() });
    result.current.mutate('glycine');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiClient.delete).toHaveBeenCalledWith('/v1/admin/rooms/glycine');
    expect(result.current.data).toEqual(mockResult);
  });
});
