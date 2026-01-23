import { promises as fs } from 'fs';
import path from 'path';

/**
 * Read and parse a JSON file.
 * @returns Parsed JSON data, or null if file doesn't exist, is empty, or is corrupted.
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // Handle empty or whitespace-only files
    const trimmed = content.trim();
    if (!trimmed) {
      console.warn(`[json-store] File is empty: ${filePath}`);
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    // Handle JSON parse errors gracefully - log and return null
    // This allows the system to recover from corrupted files
    if (error instanceof SyntaxError) {
      console.error(`[json-store] Corrupted JSON file (will be treated as missing): ${filePath}`);
      console.error(`[json-store] Parse error: ${error.message}`);
      return null;
    }
    // For other errors, still throw
    console.error(`[json-store] Failed to read file ${filePath}:`, error);
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
