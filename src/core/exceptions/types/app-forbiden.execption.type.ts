export type AppForbiddenExceptionOptions = {
  message?: string;
  missingPermissions?: {
    action: string;
    subject: string;
  }[];
};
