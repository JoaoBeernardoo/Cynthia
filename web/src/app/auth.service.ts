import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { finalize, map, Observable, shareReplay, tap } from 'rxjs';
import { environment } from './environment';
import { AuthResponse, UserSession } from './models';

export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);
export const SUPPRESS_API_ERRORS = new HttpContextToken<boolean>(() => false);

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token = signal<string | null>(null);
  readonly user = signal<UserSession | null>(null);
  private readonly api = `${environment.apiUrl}/auth`;
  private refreshRequest: Observable<AuthResponse> | null = null;
  private restoreRequest: Observable<boolean> | null = null;

  constructor(private readonly http: HttpClient) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/login`, { email, password }).pipe(
      tap((response) => this.accept(response))
    );
  }

  register(
    userName: string,
    email: string,
    password: string,
    confirmPassword: string,
    dateOfBirth: string,
    profilePhoto?: File
  ): Observable<{ message: string }> {
    const body = new FormData();
    body.set('userName', userName);
    body.set('email', email);
    body.set('password', password);
    body.set('confirmPassword', confirmPassword);
    body.set('dateOfBirth', dateOfBirth);
    if (profilePhoto) body.set('profilePhoto', profilePhoto, profilePhoto.name);
    return this.http.post<{ message: string }>(`${this.api}/register`, body);
  }

  confirmEmail(email: string, token: string): Observable<void> {
    return this.http.post<void>(`${this.api}/confirm-email`, { email, token });
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.api}/forgot-password`, { email });
  }

  resetPassword(email: string, token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.api}/reset-password`, { email, token, password });
  }

  refresh(): Observable<AuthResponse> {
    if (!this.refreshRequest) {
      this.refreshRequest = this.http.post<AuthResponse>(
        `${this.api}/refresh`,
        {},
        {
          withCredentials: true,
          context: new HttpContext().set(SKIP_AUTH_REFRESH, true).set(SUPPRESS_API_ERRORS, true)
        }
      ).pipe(
        tap((response) => this.accept(response)),
        finalize(() => (this.refreshRequest = null)),
        shareReplay(1)
      );
    }
    return this.refreshRequest;
  }

  restoreSession(): Observable<boolean> {
    if (!this.restoreRequest) {
      this.restoreRequest = this.http.post<AuthResponse | { authenticated: false }>(
        `${this.api}/session`,
        {},
        {
          withCredentials: true,
          context: new HttpContext().set(SKIP_AUTH_REFRESH, true).set(SUPPRESS_API_ERRORS, true)
        }
      ).pipe(
        tap((response) => {
          if ('accessToken' in response) this.accept(response);
          else this.clear();
        }),
        map((response) => 'accessToken' in response),
        finalize(() => (this.restoreRequest = null)),
        shareReplay(1)
      );
    }
    return this.restoreRequest;
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.api}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => this.clear())
    );
  }

  clear(): void {
    this.token.set(null);
    this.user.set(null);
  }

  private accept(response: AuthResponse): void {
    this.token.set(response.accessToken);
    this.user.set(response.user);
  }
}
