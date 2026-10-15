import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { environment } from './environment';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps the access token and public user in memory after login', () => {
    service.login('ana@example.com', 'CorrectHorseBattery1!').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({
      accessToken: 'short-lived-access-token',
      expiresIn: 900,
      user: { id: 'user-1', userName: 'ana' }
    });

    expect(service.token()).toBe('short-lived-access-token');
    expect(service.user()?.userName).toBe('ana');
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('clears local session state on logout completion', () => {
    service.token.set('access-token');
    service.user.set({ id: 'user-1', userName: 'ana' });

    service.logout().subscribe();
    const request = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(request.request.withCredentials).toBeTrue();
    request.flush(null);

    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('restores a session from the HttpOnly cookie without persisting the access token', () => {
    let restored = true;
    service.restoreSession().subscribe((hasSession) => (restored = hasSession));
    const request = http.expectOne(`${environment.apiUrl}/auth/session`);
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ authenticated: false });

    expect(restored).toBeFalse();
    expect(service.token()).toBeNull();
  });
});
