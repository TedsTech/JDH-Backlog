export function isTodoFileName(fileName: string): boolean {
  return /^todos?\.md$/i.test(fileName);
}
