import { db } from '@/lib/db';
import type { GoogleProfile } from '@/server/auth/google';

const publicSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  disabledAt: true,
  lastLoginAt: true,
  localePreference: true,
  createdAt: true,
} as const;

export type LocalePreference = 'en' | 'zh-TW';

export const usersRepo = {
  upsertGoogleUser: async (profile: GoogleProfile) =>
    db.user.upsert({
      where: { googleId: profile.googleId },
      update: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        emailVerified: profile.emailVerified,
        lastLoginAt: new Date(),
      },
      create: {
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        googleId: profile.googleId,
        emailVerified: profile.emailVerified,
        lastLoginAt: new Date(),
      },
      select: publicSelect,
    }),

  findPublicById: (id: string) =>
    db.user.findUnique({
      where: { id },
      select: publicSelect,
    }),

  updateProfile: (id: string, patch: { name?: string; localePreference?: LocalePreference }) =>
    db.user.update({
      where: { id },
      data: patch,
      select: publicSelect,
    }),
};
