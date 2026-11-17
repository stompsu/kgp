import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

/** How many times a GET answered with 503 is retried, about a minute in all (serverless SQL resume). */
export const STARTING_RETRIES = 10;
const DEFAULT_DELAY_S = 5;
const MAX_DELAY_S = 15;

/**
 * The API answers 503 with Retry-After while it migrates and seeds the database after a deploy or a
 * cold start. Wait and retry GETs instead of showing an error.
 */
export const retryStartingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);
  return next(req).pipe(
    retry({
      count: STARTING_RETRIES,
      delay: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 503) return throwError(() => error);
        const header = Number(error.headers.get('Retry-After'));
        const seconds = Number.isFinite(header) && header > 0 ? Math.min(header, MAX_DELAY_S) : DEFAULT_DELAY_S;
        return timer(seconds * 1000);
      },
    }),
  );
};
