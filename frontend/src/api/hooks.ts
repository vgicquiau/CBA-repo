import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import {
  Room,
  Booking,
  HouseConfig,
  User,
  AvailabilityResult,
  DashboardData,
  DeleteRoomResult,
  PhotoUploadUrlResponse,
  ApiError,
  CreateBookingInput,
  UpdateBookingInput,
  AdminCreateBookingInput,
  AdminUpdateBookingInput,
  CreateRoomInput,
  UpdateRoomInput,
  InviteUserInput,
  UpdateHouseConfigInput,
  BookingFilter,
} from '@clos/shared-types';
import { apiClient } from './client';

// GET /v1/rooms
export function useRooms(): UseQueryResult<Room[]> {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const data = await apiClient.get<{ rooms: Room[] }>('/v1/rooms');
      return data.rooms;
    },
  });
}

// GET /v1/rooms/{roomId}
export function useRoom(roomId: string): UseQueryResult<Room> {
  return useQuery({
    queryKey: ['rooms', roomId],
    queryFn: () => apiClient.get<Room>(`/v1/rooms/${roomId}`),
    enabled: !!roomId,
  });
}

// GET /v1/rooms/{roomId}/bookings
export function useRoomBookings(roomId: string, from?: string): UseQueryResult<Booking[]> {
  return useQuery({
    queryKey: ['rooms', roomId, 'bookings', from],
    queryFn: async () => {
      const path = from
        ? `/v1/rooms/${roomId}/bookings?from=${from}`
        : `/v1/rooms/${roomId}/bookings`;
      const data = await apiClient.get<{ bookings: Booking[] }>(path);
      return data.bookings;
    },
    enabled: !!roomId,
  });
}

// GET /v1/rooms/{roomId}/availability
export function useRoomAvailability(
  roomId: string,
  start: string,
  end: string,
): UseQueryResult<AvailabilityResult> {
  return useQuery({
    queryKey: ['rooms', roomId, 'availability', start, end],
    queryFn: () =>
      apiClient.get<AvailabilityResult>(
        `/v1/rooms/${roomId}/availability?start=${start}&end=${end}`,
      ),
    enabled: !!roomId && !!start && !!end,
  });
}

// GET /v1/bookings/me
export function useMyBookings(): UseQueryResult<Booking[]> {
  return useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: async () => {
      const data = await apiClient.get<{ bookings: Booking[] }>('/v1/bookings/me');
      return data.bookings;
    },
  });
}

// GET /v1/bookings/{bookingId}
export function useBooking(bookingId: string): UseQueryResult<Booking> {
  return useQuery({
    queryKey: ['bookings', bookingId],
    queryFn: () => apiClient.get<Booking>(`/v1/bookings/${bookingId}`),
    enabled: !!bookingId,
  });
}

// GET /v1/house
export function useHouseConfig(): UseQueryResult<HouseConfig> {
  return useQuery({
    queryKey: ['house'],
    queryFn: () => apiClient.get<HouseConfig>('/v1/house'),
  });
}

// GET /v1/me
export function useMe(): UseQueryResult<User> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.get<User>('/v1/me'),
  });
}

// GET /v1/admin/dashboard
export function useAdminDashboard(): UseQueryResult<DashboardData> {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/v1/admin/dashboard'),
  });
}

// GET /v1/admin/bookings
export function useAdminBookings(
  filter: BookingFilter,
  search?: string,
): UseQueryResult<Booking[]> {
  return useQuery({
    queryKey: ['admin', 'bookings', filter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ filter });
      if (search) params.set('search', search);
      const data = await apiClient.get<{ bookings: Booking[] }>(
        `/v1/admin/bookings?${params}`,
      );
      return data.bookings;
    },
  });
}

// GET /v1/admin/bookings/{bookingId}
export function useAdminBooking(bookingId: string): UseQueryResult<Booking> {
  return useQuery({
    queryKey: ['admin', 'bookings', bookingId],
    queryFn: () => apiClient.get<Booking>(`/v1/admin/bookings/${bookingId}`),
    enabled: !!bookingId,
  });
}

// GET /v1/admin/users
export function useAdminUsers(): UseQueryResult<User[]> {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const data = await apiClient.get<{ users: User[] }>('/v1/admin/users');
      return data.users;
    },
  });
}

// GET /v1/admin/house
export function useAdminHouse(): UseQueryResult<HouseConfig> {
  return useQuery({
    queryKey: ['admin', 'house'],
    queryFn: () => apiClient.get<HouseConfig>('/v1/admin/house'),
  });
}

// POST /v1/bookings
export function useCreateBooking(): UseMutationResult<Booking, ApiError, CreateBookingInput> {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, CreateBookingInput>({
    mutationFn: (input) => apiClient.post<Booking>('/v1/bookings', input),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['rooms', booking.roomId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
  });
}

// PATCH /v1/bookings/{bookingId}
export function useUpdateBooking(): UseMutationResult<
  Booking,
  ApiError,
  { bookingId: string; patch: UpdateBookingInput }
> {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, { bookingId: string; patch: UpdateBookingInput }>({
    mutationFn: ({ bookingId, patch }) =>
      apiClient.patch<Booking>(`/v1/bookings/${bookingId}`, patch),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['bookings', booking.bookingId] });
      queryClient.invalidateQueries({ queryKey: ['rooms', booking.roomId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
  });
}

// DELETE /v1/bookings/{bookingId}
export function useDeleteBooking(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (bookingId) => apiClient.delete<void>(`/v1/bookings/${bookingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
    },
  });
}

// DELETE /v1/me
export function useDeleteMe(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => apiClient.delete<void>('/v1/me'),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

// POST /v1/admin/bookings
export function useAdminCreateBooking(): UseMutationResult<
  Booking,
  ApiError,
  AdminCreateBookingInput
> {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, AdminCreateBookingInput>({
    mutationFn: (input) => apiClient.post<Booking>('/v1/admin/bookings', input),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', booking.roomId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

// PATCH /v1/admin/bookings/{bookingId}
export function useAdminUpdateBooking(): UseMutationResult<
  Booking,
  ApiError,
  { bookingId: string; patch: AdminUpdateBookingInput }
> {
  const queryClient = useQueryClient();
  return useMutation<Booking, ApiError, { bookingId: string; patch: AdminUpdateBookingInput }>({
    mutationFn: ({ bookingId, patch }) =>
      apiClient.patch<Booking>(`/v1/admin/bookings/${bookingId}`, patch),
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', booking.roomId, 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

// DELETE /v1/admin/bookings/{bookingId}
export function useAdminDeleteBooking(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (bookingId) => apiClient.delete<void>(`/v1/admin/bookings/${bookingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

// POST /v1/admin/rooms
export function useCreateRoom(): UseMutationResult<Room, ApiError, CreateRoomInput> {
  const queryClient = useQueryClient();
  return useMutation<Room, ApiError, CreateRoomInput>({
    mutationFn: (input) => apiClient.post<Room>('/v1/admin/rooms', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

// PATCH /v1/admin/rooms/{roomId}
export function useUpdateRoom(): UseMutationResult<
  Room,
  ApiError,
  { roomId: string; patch: UpdateRoomInput }
> {
  const queryClient = useQueryClient();
  return useMutation<Room, ApiError, { roomId: string; patch: UpdateRoomInput }>({
    mutationFn: ({ roomId, patch }) => apiClient.patch<Room>(`/v1/admin/rooms/${roomId}`, patch),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', room.roomId] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

// DELETE /v1/admin/rooms/{roomId}
export function useDeleteRoom(): UseMutationResult<DeleteRoomResult, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DeleteRoomResult, ApiError, string>({
    mutationFn: (roomId) => apiClient.delete<DeleteRoomResult>(`/v1/admin/rooms/${roomId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
}

// POST /v1/admin/rooms/{roomId}/photo-upload-url + PUT direct vers S3
export function useUploadRoomPhoto(): UseMutationResult<
  { photoUrl: string },
  ApiError,
  { roomId: string; file: File }
> {
  return useMutation<{ photoUrl: string }, ApiError, { roomId: string; file: File }>({
    mutationFn: async ({ roomId, file }) => {
      const { uploadUrl, publicUrl } = await apiClient.post<PhotoUploadUrlResponse>(
        `/v1/admin/rooms/${roomId}/photo-upload-url`,
        { contentType: file.type, sizeBytes: file.size },
      );
      const putResponse = await apiClient.putExternal(uploadUrl, file);
      if (!putResponse.ok) {
        throw new ApiError(putResponse.status, 'UPLOAD_FAILED', "Échec de l'upload de la photo");
      }
      return { photoUrl: publicUrl };
    },
  });
}

// POST /v1/admin/users/invite
export function useInviteUser(): UseMutationResult<User, ApiError, InviteUserInput> {
  const queryClient = useQueryClient();
  return useMutation<User, ApiError, InviteUserInput>({
    mutationFn: (input) => apiClient.post<User>('/v1/admin/users/invite', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

// PATCH /v1/admin/house
export function useUpdateHouseConfig(): UseMutationResult<
  HouseConfig,
  ApiError,
  UpdateHouseConfigInput
> {
  const queryClient = useQueryClient();
  return useMutation<HouseConfig, ApiError, UpdateHouseConfigInput>({
    mutationFn: (input) => apiClient.patch<HouseConfig>('/v1/admin/house', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['house'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'house'] });
    },
  });
}
