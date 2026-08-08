export type UserProfile = {
  pubkey: string;
  displayName: string | null;
  name: string | null;
  avatarUrl: string | null;
  nip05Handle: string | null;
  isAgent: boolean;
  updatedAt: number;
};

export type ProfileLookup = Record<string, UserProfile>;
