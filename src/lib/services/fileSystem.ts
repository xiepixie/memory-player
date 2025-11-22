import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';

export class FileSystemService {
  /**
   * Ensures a note has a persistent ID in its frontmatter.
   * - Reads the file
   * - Checks for 'mp-id'
   * - If missing, generates one and writes the file back
   * - Returns the ID and the (potentially updated) raw content
   */
  async ensureNoteId(filepath: string): Promise<{ id: string; content: string; frontmatter: any }> {
    try {
      const rawContent = await readTextFile(filepath);
      const file = matter(rawContent);
      
      let id = file.data['mp-id'];
      let needsSave = false;

      if (!id) {
        id = uuidv4();
        file.data['mp-id'] = id;
        needsSave = true;
      }

      if (needsSave) {
        // Reconstruct the file with new frontmatter
        // Note: this might reformat existing frontmatter
        const newContent = matter.stringify(file.content, file.data);
        await writeTextFile(filepath, newContent);
        return {
            id,
            content: newContent,
            frontmatter: file.data
        };
      }

      return {
          id,
          content: rawContent,
          frontmatter: file.data
      };
    } catch (error) {
      console.error(`Error processing file ${filepath}:`, error);
      throw error;
    }
  }

  async readNote(filepath: string): Promise<string> {
    return await readTextFile(filepath);
  }

  async writeNote(filepath: string, content: string): Promise<void> {
    await writeTextFile(filepath, content);
  }
}

export const fileSystem = new FileSystemService();
