import { LoggerPort } from '../../application/ports';

export class ConsoleLogger implements LoggerPort {
  info(message: string): void {
    // tslint:disable-next-line:no-console
    console.log(`[INFO] ${message}`);
  }

  warn(message: string): void {
    // tslint:disable-next-line:no-console
    console.warn(`[WARN] ${message}`);
  }
}
