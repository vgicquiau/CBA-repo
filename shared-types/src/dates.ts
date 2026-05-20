import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const APP_TIMEZONE = 'Europe/Paris' as const;

// Retourne la date "aujourd'hui" en format YYYY-MM-DD selon Europe/Paris,
// indépendamment de la timezone du serveur Lambda (UTC).
export function todayIsoInAppTz(): string {
  return dayjs().tz(APP_TIMEZONE).format('YYYY-MM-DD');
}

// Convertit une date ISO (instant ou YYYY-MM-DD) en YYYY-MM-DD en timezone Europe/Paris.
export function toAppDateString(iso: string): string {
  return dayjs(iso).tz(APP_TIMEZONE).format('YYYY-MM-DD');
}

// Calcule le nombre de nuits entre deux dates YYYY-MM-DD (exclusif sur end).
export function nightsBetween(start: string, end: string): number {
  return dayjs(end).diff(dayjs(start), 'day');
}

// Détecte un chevauchement strict entre deux intervalles [s1,e1) et [s2,e2).
export function intervalsOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}
