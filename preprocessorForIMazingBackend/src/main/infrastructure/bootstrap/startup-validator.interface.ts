export interface StartupValidator {
  getName(): string;
  getSuccessMessage(): string;
  validate(): Promise<void>;
}
