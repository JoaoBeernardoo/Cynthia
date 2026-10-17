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
  imageUrl?: string | null;
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

export interface PublicProfile {
  id: string;
  userName: string;
  profilePhotoUrl?: string | null;
  bio?: string | null;
  createdAt: string;
  postCount: number;
}

export interface UserComment {
  id: string;
  content: string;
  createdAt: string;
  postId: string;
  postContent: string;
  placeName?: string | null;
}

export interface Suggestion {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  commentCount: number;
  isWorthImplementing: boolean | null;
  supportResponse?: string | null;
  reviewedAt?: string | null;
  canReview: boolean;
}

export interface SuggestionComment {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}
