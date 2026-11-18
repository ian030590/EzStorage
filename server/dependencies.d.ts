// Runtime surfaces used here. Keep these declarations limited to the Express and SMTP calls in this project.
declare module 'express' {
  import type { IncomingMessage, Server, ServerResponse } from 'node:http';
  interface Request extends IncomingMessage {
    path: string;
    protocol: string;
    method: string;
    ip?: string;
    params: Record<string, string>;
    query: Record<string, unknown>;
    body: Record<string, unknown>;
  }
  interface Response extends ServerResponse {
    json(value: unknown): this;
    status(code: number): this;
    type(value: string): this;
    send(value: string): this;
    cookie(name: string, value: string, options: CookieOptions): this;
    clearCookie(name: string, options: CookieOptions): this;
  }
  interface CookieOptions { httpOnly?: boolean; sameSite?: 'strict'; secure?: boolean; path?: string; maxAge?: number }
  type NextFunction = (error?: unknown) => void;
  type RequestHandler = (req: Request, res: Response, next: NextFunction) => unknown;
  type ErrorHandler = (error: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => unknown;
  interface Application {
    (req: IncomingMessage, res: ServerResponse): void;
    disable(name: string): void;
    use(handler: RequestHandler): void;
    use(handler: ErrorHandler): void;
    use(path: string, ...handlers: RequestHandler[]): void;
    get(path: string, ...handlers: RequestHandler[]): void;
    post(path: string, ...handlers: RequestHandler[]): void;
    patch(path: string, ...handlers: RequestHandler[]): void;
    listen(port: number, host: string, ready?: (error?: Error) => void): Server;
    locals: { close(): void; runDaily(): void; deliverMail(): Promise<void> };
  }
  const express: {
    (): Application;
    json(options: { limit: string; strict: boolean }): RequestHandler;
    static(root: string, options: { index: string }): RequestHandler;
  };
  export default express;
  export type { Application, Request, Response, CookieOptions, RequestHandler, NextFunction };
}
