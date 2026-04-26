import { Dirent } from 'fs';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

import { FileSystemPort } from '../../../application/ports';

@Injectable()
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

  async listFilesRecursively(targetPath: string): Promise<string[]> {
    return this.collectFilesRecursively(targetPath);
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

  async areFilesEqual(leftPath: string, rightPath: string): Promise<boolean> {
    const [leftStat, rightStat] = await Promise.all([fs.stat(leftPath), fs.stat(rightPath)]);
    if (leftStat.size !== rightStat.size) {
      return false;
    }

    const [leftBuffer, rightBuffer] = await Promise.all([fs.readFile(leftPath), fs.readFile(rightPath)]);
    return leftBuffer.equals(rightBuffer);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }

  async deleteFile(targetPath: string): Promise<void> {
    await fs.unlink(targetPath);
  }

  async removeEmptyDirectoriesRecursively(targetPath: string): Promise<void> {
    await this.removeEmptyDirectories(targetPath, true);
  }

  private async collectFilesRecursively(currentPath: string): Promise<string[]> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const nestedFiles = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          return this.collectFilesRecursively(absolutePath);
        }

        if (entry.isFile()) {
          return [absolutePath];
        }

        return [];
      })
    );

    return nestedFiles.flat();
  }

  private async removeEmptyDirectories(currentPath: string, preserveCurrent: boolean): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.removeEmptyDirectories(path.join(currentPath, entry.name), false))
    );

    const remainingEntries = await fs.readdir(currentPath);
    if (remainingEntries.length === 0 && !preserveCurrent) {
      await fs.rmdir(currentPath);
    }
  }
}
