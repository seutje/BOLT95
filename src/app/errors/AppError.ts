export type AppErrorCode =
  | "CAPABILITY_UNSUPPORTED"
  | "INPUT_INVALID"
  | "JOB_CANCELLED"
  | "STORAGE_UNAVAILABLE"
  | "UNEXPECTED_FAILURE";

export interface AppErrorOptions {
  readonly technicalDetail?: string;
  readonly recoveryAction?: string;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly technicalDetail: string | undefined;
  readonly recoveryAction: string | undefined;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.technicalDetail = options.technicalDetail;
    this.recoveryAction = options.recoveryAction;
  }
}

export interface SerializedAppError {
  readonly name: "AppError";
  readonly code: AppErrorCode;
  readonly message: string;
  readonly technicalDetail?: string;
  readonly recoveryAction?: string;
}

export function serializeAppError(error: AppError): SerializedAppError {
  return {
    name: "AppError",
    code: error.code,
    message: error.message,
    ...(error.technicalDetail ? { technicalDetail: error.technicalDetail } : {}),
    ...(error.recoveryAction ? { recoveryAction: error.recoveryAction } : {}),
  };
}
