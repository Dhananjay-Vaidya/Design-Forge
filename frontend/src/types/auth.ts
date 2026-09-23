export interface UserProfile {
  display_name: string;
  timezone: string;
  quota_tier: string;
  preferences: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
  profile: UserProfile;
}

export interface AuthResponse {
  user: User;
  access: string;
}
