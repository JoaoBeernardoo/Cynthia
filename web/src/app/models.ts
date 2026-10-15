export interface UserSession {
  id: string;
  userName: string;
  profilePhotoUrl?: string | null;
  bio?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: UserSession;
}

export interface Place {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude: number;
  longitude: number;
  opinionCount: number;
  distanceMeters?: number;
}

export interface Post {
  id: string;
  content: string;
  rating?: number | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string | null;
  likeCount: number;
  likedByMe?: boolean;
  commentCount: number;
  place?: Pick<Place, 'id' | 'name' | 'category' | 'city'> | null;
}
