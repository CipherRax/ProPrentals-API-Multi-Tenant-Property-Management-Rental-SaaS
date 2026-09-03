import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
<<<<<<< HEAD
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
=======
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../decorators/skip-response-envelope.decorator';
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)

interface PaginatedShape {
  data: unknown[];
  meta: Record<string, unknown>;
}

function isPaginated(value: unknown): value is PaginatedShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Array.isArray((value as PaginatedShape).data)
  );
}

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
<<<<<<< HEAD
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((result) => {
=======
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipEnvelope = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((result) => {
        if (skipEnvelope) return result;
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
        if (isPaginated(result)) {
          return { success: true, data: result.data, meta: result.meta };
        }
        return { success: true, data: result ?? null };
      }),
    );
  }
}
