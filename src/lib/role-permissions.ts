export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  reviewer: ['handoff'],
  editor: ['comments', 'inbox', 'handoff', 'activity'],
  viewer: ['comments', 'activity'],
}
