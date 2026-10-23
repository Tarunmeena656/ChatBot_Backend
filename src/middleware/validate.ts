import { NextFunction, Request, Response } from 'express';
import { ZodType } from 'zod';
import { AppError } from './errors';

type Source = 'body' | 'query' | 'params';

// validates one part of the request. body is replaced with the parsed value,
// query goes to res.locals.query because express 5 makes req.query read only
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      next(new AppError(400, 'VALIDATION_ERROR', `Invalid ${source}`, details));
      return;
    }
    if (source === 'body') {
      req.body = result.data;
    } else if (source === 'query') {
      res.locals.query = result.data;
    }
    next();
  };
}
