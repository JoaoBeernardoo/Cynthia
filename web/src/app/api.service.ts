import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from './environment';
import { Place, Post, PublicProfile, Suggestion, SuggestionComment, UserComment } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  feed(page = 1): Observable<Post[]> {
    return this.http.get<Post[]>(`${this.base}/posts`, { params: { page, pageSize: 20 } });
  }

  places(): Observable<Place[]> {
    return this.http.get<Place[]>(`${this.base}/places`, { params: { pageSize: 50 } });
  }

  place(id: string): Observable<Place> {
    return this.http.get<Place>(`${this.base}/places/${id}`);
  }

  createPost(content: string, placeId?: string | null): Observable<unknown> {
    return this.http.post(`${this.base}/posts`, { content, placeId: placeId || null });
  }

  createPostWithPhoto(content: string, placeId: string, photo: File): Observable<unknown> {
    const form = new FormData();
    form.set('content', content);
    form.set('placeId', placeId);
    form.set('photo', photo, photo.name);
    return this.http.post(`${this.base}/posts/with-image`, form);
  }

  like(postId: string): Observable<void> {
    return this.http.put<void>(`${this.base}/posts/${postId}/like`, {});
  }

  unlike(postId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${postId}/like`);
  }

  post(id: string): Observable<Post> {
    return this.http.get<Post>(`${this.base}/posts/${id}`);
  }

  comments(postId: string): Observable<{ id: string; content: string; authorId: string; authorName: string; createdAt: string }[]> {
    return this.http.get<{ id: string; content: string; authorId: string; authorName: string; createdAt: string }[]>(
      `${this.base}/posts/${postId}/comments`
    );
  }

  addComment(postId: string, content: string): Observable<unknown> {
    return this.http.post(`${this.base}/posts/${postId}/comments`, { content });
  }

  searchPlaces(query: string): Observable<Place[]> {
    return this.http.get<Place[]>(`${this.base}/places/search`, {
      params: new HttpParams().set('q', query).set('pageSize', '50')
    });
  }

  nearby(latitude: number, longitude: number, radiusMeters = 5000): Observable<Place[]> {
    return this.http.get<Place[]>(`${this.base}/places/nearby`, {
      params: { latitude, longitude, radiusMeters, limit: 100 }
    });
  }

  createPlace(place: Omit<Place, 'id' | 'opinionCount'>): Observable<Place> {
    return this.http.post<Place>(`${this.base}/places`, place);
  }

  me(): Observable<{ id: string; userName: string; email: string; bio?: string | null; profilePhotoUrl?: string | null; createdAt: string; postCount: number }> {
    return this.http.get<{ id: string; userName: string; email: string; bio?: string | null; profilePhotoUrl?: string | null; createdAt: string; postCount: number }>(
      `${this.base}/users/me`
    );
  }

  updateProfile(profile: { userName: string; bio: string }): Observable<void> {
    return this.http.put<void>(`${this.base}/users/me`, profile);
  }

  uploadProfilePhoto(photo: File): Observable<{ profilePhotoUrl: string }> {
    const form = new FormData();
    form.set('photo', photo, photo.name);
    return this.http.post<{ profilePhotoUrl: string }>(`${this.base}/users/me/profile-photo`, form);
  }

  placePosts(placeId: string): Observable<Pick<Post, 'id' | 'content' | 'rating' | 'createdAt' | 'authorId' | 'authorName'>[]> {
    return this.http.get<Pick<Post, 'id' | 'content' | 'rating' | 'createdAt' | 'authorId' | 'authorName'>[]>(
      `${this.base}/places/${placeId}/posts`,
      { params: { pageSize: 5 } }
    );
  }

  publicProfile(id: string): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`${this.base}/users/${id}`);
  }

  userComments(id: string, page = 1): Observable<UserComment[]> {
    return this.http.get<UserComment[]>(`${this.base}/users/${id}/comments`, {
      params: { page, pageSize: 30 }
    });
  }

  suggestions(): Observable<Suggestion[]> {
    return this.http.get<Suggestion[]>(`${this.base}/suggestions`, { params: { pageSize: 100 } });
  }

  createSuggestion(title: string, content: string): Observable<Suggestion> {
    return this.http.post<Suggestion>(`${this.base}/suggestions`, { title, content });
  }

  suggestionComments(id: string, page = 1): Observable<SuggestionComment[]> {
    return this.http.get<SuggestionComment[]>(`${this.base}/suggestions/${id}/comments`, {
      params: { page, pageSize: 50 }
    });
  }

  addSuggestionComment(id: string, content: string): Observable<unknown> {
    return this.http.post(`${this.base}/suggestions/${id}/comments`, { content });
  }

  reviewSuggestion(id: string, isWorthImplementing: boolean, response: string): Observable<unknown> {
    return this.http.put(`${this.base}/suggestions/${id}/review`, { isWorthImplementing, response });
  }
}
