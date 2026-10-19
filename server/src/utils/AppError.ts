import { appendFile } from "fs";

export class AppError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message)
        this.statusCode = statusCode

        Object.setPrototypeOf(this, AppError.prototype);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    static badRequest(message: string) { return new AppError(message, 400) }
    static unauthorized(message = 'Unauthorized') { return new AppError(message, 401) }
    static forbidden(message = 'Forbidden') { return new AppError(message, 403); }
    static notFound(message = 'Not found') { return new AppError(message, 404); }
    static conflict(message: string) { return new AppError(message, 409); }
    static unprocessable(message: string) { return new AppError(message, 422); }
}
