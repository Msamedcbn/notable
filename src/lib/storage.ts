import { supabase, isDemoMode } from './supabase';

/**
 * Uploads an image file.
 * In Supabase mode: Uploads to private bucket and returns path.
 * In Demo Mode: Converts to base64 data URL and returns it.
 */
export async function uploadImage(file: File, userId: string, notebookId: string): Promise<string> {
  if (isDemoMode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = (err) => {
        console.error('FileReader error:', err);
        reject(err);
      };
      reader.readAsDataURL(file);
    });
  }

  const fileExt = file.name.split('.').pop();
  const randomId = Math.random().toString(36).substring(2, 15);
  const safeExt = (fileExt || 'jpg').toLowerCase();
  const fileName = `${Date.now()}-${randomId}.${safeExt}`;
  const filePath = `${userId}/${notebookId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('notebook-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading image to storage:', error);
    throw error;
  }

  return data.path;
}

/**
 * Generates a temporary signed URL for a private image path.
 * In Demo Mode: Returns the path directly (which is already a base64 string).
 */
export async function getSignedImageUrl(path: string): Promise<string> {
  if (!path) return '';

  if (isDemoMode) {
    return path; // Already a base64 data URL in demo mode
  }
  
  try {
    const { data, error } = await supabase.storage
      .from('notebook-images')
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error);
      throw error;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Failed to get signed image URL:', err);
    return '';
  }
}
