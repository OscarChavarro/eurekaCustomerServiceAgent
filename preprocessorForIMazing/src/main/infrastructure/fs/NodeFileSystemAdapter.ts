import { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

import { FileSystemPort } from '../../application/ports';

export class NodeFileSystemAdapter implements FileSystemPort {
  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDirectory(targetPath: string): Promise<void> {
    await fs.mkdir(targetPath, { recursive: true });
  }

  async listFiles(targetPath: string): Promise<string[]> {
    const entries: Dirent[] = await fs.readdir(targetPath, { withFileTypes: true });
    return entries.filter((entry: Dirent) => entry.isFile()).map((entry: Dirent) => entry.name);
  }

  async listDirectories(targetPath: string): Promise<string[]> {
    const entries: Dirent[] = await fs.readdir(targetPath, { withFileTypes: true });
    return entries.filter((entry: Dirent) => entry.isDirectory()).map((entry: Dirent) => entry.name);
  }

  async readTextFile(targetPath: string): Promise<string> {
    return fs.readFile(targetPath, 'utf8');
  }

  async writeTextFile(targetPath: string, content: string): Promise<void> {
    await this.ensureDirectory(path.dirname(targetPath));
    await fs.writeFile(targetPath, content, 'utf8');
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }
}
