/** Lets actions outside the React tree open the app's hidden file input. */
let input: HTMLInputElement | null = null;

export const filePicker = {
  attach(element: HTMLInputElement | null): void {
    input = element;
  },
  open(accept: string): void {
    if (!input) return;
    input.accept = accept;
    input.value = '';
    input.click();
  },
};

export const IMPORT_ACCEPT = '.csv,.tsv,.txt,.tab,.json,.ndjson,.jsonl,.sqlite,.sqlite3,.db';
export const DATABASE_ACCEPT = '.sqlite,.sqlite3,.db';
