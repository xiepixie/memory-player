import { readTextFile, writeTextFile, watch } from '@tauri-apps/plugin-fs';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';

export class FileSystemService {
  /**
   * Watch a file for changes.
   * Returns a function to stop watching.
   */
  async watchFile(filepath: string, onChange: () => void): Promise<() => void> {
    try {
       // debounce the callback slightly to avoid duplicate events
       let timeout: ReturnType<typeof setTimeout> | null = null;
       
       const unwatch = await watch(filepath, (_event) => {
           // Simply trigger on any event for now to be safe
           if (timeout) clearTimeout(timeout);
           timeout = setTimeout(() => {
               onChange();
           }, 100);
       });
       return unwatch;
    } catch (error) {
        console.error(`Failed to watch file ${filepath}:`, error);
        return () => {};
    }
  }

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
        try {
          await writeTextFile(filepath, newContent);
        } catch (writeError) {
          console.error(`Failed to write ID to file ${filepath}. This might be a read-only file or iCloud sync issue.`, writeError);
          // If we can't write, we still return the content and the in-memory ID
          // The user can still view/study, but progress tracking might be flaky across renames if ID isn't saved.
        }
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
