import { Room, Booking } from './domain';

// ─── Inputs (créations / modifications) ───────────────────────────────

export interface CreateBookingInput {
  roomId: string;
  start: string;          // YYYY-MM-DD
  end: string;            // YYYY-MM-DD
  people: number;
  name: string;
  notes: string;
}

export interface AdminCreateBookingInput extends CreateBookingInput {
  userId: string | null;  // null si saisie pour tiers
}

export interface UpdateBookingInput {
  start?: string;
  end?: string;
  people?: number;
  notes?: string;
  // roomId NON autorisé (cf. § 1.4.4)
}

export interface AdminUpdateBookingInput extends UpdateBookingInput {
  roomId?: string;        // l'admin peut déplacer une résa
  name?: string;
  userId?: string | null;
}

export interface CreateRoomInput {
  roomId: string;
  name: string;
  wing: string;
  floor: 0 | 1;
  area: number;
  capacity: number;
  beds: string;
  closet: string;
  equipment: string[];
  linen: string[];
  pricePerPerson: number;
  photoTint: Room['photoTint'];
  blurb: string;
}

export interface UpdateRoomInput {
  name?: string;
  wing?: string;
  floor?: 0 | 1;
  area?: number;
  capacity?: number;
  beds?: string;
  closet?: string;
  equipment?: string[];
  linen?: string[];
  pricePerPerson?: number;
  photoTint?: Room['photoTint'];
  blurb?: string;
  photoUrl?: string | null;
  // roomId NON autorisé (immutable)
}

export interface InviteUserInput {
  email: string;
  displayName: string;
  role: 'guest' | 'admin';
}

export interface UpdateHouseConfigInput {
  name?: string;
  region?: string;
  address?: string;
  welcomeNote?: string;
  wings?: string[];
  equipmentSuggestions?: string[];
  linenSuggestions?: string[];
}

// ─── Outputs (résultats spécifiques) ──────────────────────────────────

export interface AvailabilityResult {
  roomId: string;
  start: string;
  end: string;
  available: boolean;
  conflicts: Booking[];
}

export interface DashboardData {
  todayCount: number;
  weekCount: number;
  totalRoomCount: number;
  totalUpcomingRevenue: number;
  upcomingArrivals: Booking[];
}

export type BookingFilter = 'upcoming' | 'past' | 'all';

export interface PhotoUploadUrlResponse {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;     // secondes
}

export interface DeleteRoomResult {
  deletedRoomId: string;
  cancelledBookings: number;
}

// ─── Réponses standardisées ───────────────────────────────────────────

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) { super(message); }
}
