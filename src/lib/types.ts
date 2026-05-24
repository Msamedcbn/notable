export interface NotebookEntry {
  id: string;
  author_id: string;
  author_email: string;
  content: string;
  image_url: string | null;
  page_number: number;
  created_at: string;
  notebook_id?: string;
}

export interface MockNotebook {
  id: string;
  name: string;
  invite_code: string;
}

export interface MockNotebookMember {
  notebook_id: string;
  user_id: string;
  user_email: string;
}
