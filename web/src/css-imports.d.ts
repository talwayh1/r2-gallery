// Type declarations for CSS imports (used by Uppy and other libraries)
declare module '*.css' {
  const content: string;
  export default content;
}
declare module '*.min.css' {
  const content: string;
  export default content;
}
