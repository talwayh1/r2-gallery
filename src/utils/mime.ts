/** Get MIME type from file extension — always prefer this over browser detection */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    heic: 'image/heic', heif: 'image/heif', tiff: 'image/tiff', tif: 'image/tiff',
    psd: 'image/vnd.adobe.photoshop', dng: 'image/x-adobe-dng',
    avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime',
    mkv: 'video/x-matroska', flv: 'video/x-flv', wmv: 'video/x-ms-wmv',
    m3u8: 'application/vnd.apple.mpegurl',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
    tar: 'application/x-tar', gz: 'application/gzip',
    txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'application/javascript',
    json: 'application/json', xml: 'application/xml', csv: 'text/csv', md: 'text/markdown',
    url: 'text/plain',
    // Code files
    ts: 'text/typescript', tsx: 'text/typescript', jsx: 'text/javascript',
    vue: 'text/vue', svelte: 'text/svelte',
    py: 'text/x-python', rb: 'text/x-ruby', go: 'text/x-go', rs: 'text/x-rust',
    java: 'text/x-java', kt: 'text/x-kotlin', swift: 'text/x-swift',
    c: 'text/x-c', cpp: 'text/x-c++', h: 'text/x-c', hpp: 'text/x-c++',
    sh: 'text/x-shellscript', bat: 'text/x-batch', ps1: 'text/x-powershell',
    sql: 'text/x-sql', graphql: 'text/graphql',
    // Config files
    yaml: 'application/x-yaml', yml: 'application/x-yaml',
    toml: 'application/toml', ini: 'text/plain', env: 'text/plain',
    dockerfile: 'text/plain', gitignore: 'text/plain',
    lock: 'text/plain',
    // Other
    log: 'text/plain', rtf: 'application/rtf',
    epub: 'application/epub+zip',
    dmg: 'application/x-apple-diskimage', iso: 'application/x-iso9660-image',
  };
  return mimeMap[ext] || 'application/octet-stream';
}
