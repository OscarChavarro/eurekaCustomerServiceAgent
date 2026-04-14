declare module 'path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
}

declare module 'fs' {
  export class Dirent {
    name: string;
    isFile(): boolean;
    isDirectory(): boolean;
  }
}

declare module 'fs/promises' {
  import { Dirent } from 'fs';

  export function access(path: string): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  export function readdir(path: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, content: string, encoding: string): Promise<void>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
}

declare const process: {
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
};
