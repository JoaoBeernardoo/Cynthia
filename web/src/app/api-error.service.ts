import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService, SKIP_AUTH_REFRESH, SUPPRESS_API_ERRORS } from './auth.service';
import { environment } from './environment';

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  readonly message = signal<string | null>(null);

  show(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as { detail?: string; title?: string; message?: string } | null;
      this.message.set(body?.detail ?? body?.title ?? body?.message ?? 'Não foi possível concluir a solicitação.');
    } else {
      this.message.set('Não foi possível concluir a solicitação.');
    }
  }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const errors = inject(ApiErrorService);
  const token = auth.token();
  const outgoing = request.url.startsWith(environment.apiUrl)
    ? request.clone({
        withCredentials: true,
        setHeaders: token ? { Authorization: `Bearer ${token}` } : {}
      })
    : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !request.url.startsWith(`${environment.apiUrl}/auth/`) &&
        !request.context.get(SKIP_AUTH_REFRESH)
      ) {
        return auth.refresh().pipe(
          switchMap((response) =>
            next(request.clone({
              withCredentials: true,
              setHeaders: { Authorization: `Bearer ${response.accessToken}` }
            }))
          ),
          catchError(() => {
            auth.clear();
            errors.show(error);
            return throwError(() => error);
          })
        );
      }
      if (!request.context.get(SUPPRESS_API_ERRORS)) errors.show(error);
      return throwError(() => error);
    })
  );
};
