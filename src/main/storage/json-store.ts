import { promises as fs } from 'fs';
import path from 'path';

/**
 * Read and parse a JSON file.
 * @returns Parsed JSON data, or null if file doesn't exist.
 * @throws Error if file exists but cannot be parsed.
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write data to a JSON file, creating directories as needed.
 * @param filePath - Path to write the JSON file.
 * @param data - Data to serialize and write.
 */
export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Delete a JSON file.
 * @returns true if file was deleted, false if it didn't exist.
 * @throws Error if deletion fails for reasons other than file not existing.
 */
export async function deleteJson(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Check if a file exists.
 * @returns true if file exists and is accessible, false otherwise.
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
