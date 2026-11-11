// Common extension to MIME type pairs. Extensions are lowercase and have no dot.
export type MimeEntry = { ext: string; mime: string };

const RAW: readonly [string, string][] = [
  ['aac', 'audio/aac'], ['abw', 'application/x-abiword'], ['arc', 'application/x-freearc'], ['avi', 'video/x-msvideo'],
  ['avif', 'image/avif'], ['azw', 'application/vnd.amazon.ebook'], ['bin', 'application/octet-stream'], ['bmp', 'image/bmp'],
  ['bz', 'application/x-bzip'], ['bz2', 'application/x-bzip2'], ['cda', 'application/x-cdf'], ['csh', 'application/x-csh'],
  ['css', 'text/css'], ['csv', 'text/csv'], ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['eot', 'application/vnd.ms-fontobject'],
  ['epub', 'application/epub+zip'], ['gz', 'application/gzip'], ['gif', 'image/gif'], ['htm', 'text/html'], ['html', 'text/html'],
  ['ico', 'image/vnd.microsoft.icon'], ['ics', 'text/calendar'], ['jar', 'application/java-archive'], ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'], ['js', 'text/javascript'], ['json', 'application/json'], ['jsonld', 'application/ld+json'],
  ['mid', 'audio/midi'], ['midi', 'audio/midi'], ['mjs', 'text/javascript'], ['mp3', 'audio/mpeg'], ['mp4', 'video/mp4'],
  ['mpeg', 'video/mpeg'], ['mpkg', 'application/vnd.apple.installer+xml'], ['odp', 'application/vnd.oasis.opendocument.presentation'],
  ['ods', 'application/vnd.oasis.opendocument.spreadsheet'], ['odt', 'application/vnd.oasis.opendocument.text'], ['oga', 'audio/ogg'],
  ['ogv', 'video/ogg'], ['ogx', 'application/ogg'], ['opus', 'audio/ogg'], ['otf', 'font/otf'], ['png', 'image/png'],
  ['pdf', 'application/pdf'], ['php', 'application/x-httpd-php'], ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], ['rar', 'application/vnd.rar'],
  ['rtf', 'application/rtf'], ['sh', 'application/x-sh'], ['svg', 'image/svg+xml'], ['tar', 'application/x-tar'],
  ['tif', 'image/tiff'], ['tiff', 'image/tiff'], ['ts', 'video/mp2t'], ['ttf', 'font/ttf'], ['txt', 'text/plain'],
  ['vsd', 'application/vnd.visio'], ['wasm', 'application/wasm'], ['wav', 'audio/wav'], ['weba', 'audio/webm'],
  ['webm', 'video/webm'], ['webp', 'image/webp'], ['woff', 'font/woff'], ['woff2', 'font/woff2'], ['xhtml', 'application/xhtml+xml'],
  ['xls', 'application/vnd.ms-excel'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['xml', 'application/xml'], ['xul', 'application/vnd.mozilla.xul+xml'], ['zip', 'application/zip'], ['7z', 'application/x-7z-compressed'],
  ['3gp', 'video/3gpp'], ['3g2', 'video/3gpp2'], ['flac', 'audio/flac'], ['m4a', 'audio/mp4'], ['m4v', 'video/mp4'],
  ['mov', 'video/quicktime'], ['mkv', 'video/x-matroska'], ['wmv', 'video/x-ms-wmv'], ['aiff', 'audio/aiff'], ['ogg', 'audio/ogg'],
  ['md', 'text/markdown'], ['markdown', 'text/markdown'], ['yaml', 'application/yaml'], ['yml', 'application/yaml'],
  ['toml', 'application/toml'], ['ini', 'text/plain'], ['log', 'text/plain'], ['tsv', 'text/tab-separated-values'],
  ['vcf', 'text/vcard'], ['ttc', 'font/collection'], ['pem', 'application/x-x509-ca-cert'], ['key', 'application/pkcs8'],
  ['p12', 'application/x-pkcs12'], ['sql', 'application/sql'], ['ps', 'application/postscript'], ['ai', 'application/postscript'],
  ['psd', 'image/vnd.adobe.photoshop'], ['heic', 'image/heic'], ['heif', 'image/heif'], ['jxl', 'image/jxl'], ['raw', 'image/x-raw'],
  ['exe', 'application/x-msdownload'], ['msi', 'application/x-msi'], ['dmg', 'application/x-apple-diskimage'],
  ['deb', 'application/vnd.debian.binary-package'], ['iso', 'application/x-iso9660-image'], ['apk', 'application/vnd.android.package-archive'],
  ['pl', 'text/x-perl'], ['py', 'text/x-python'], ['rb', 'text/x-ruby'], ['go', 'text/x-go'], ['rs', 'text/rust'],
  ['c', 'text/x-c'], ['h', 'text/x-c'], ['cpp', 'text/x-c++src'], ['java', 'text/x-java-source'], ['ts.map', 'application/json'],
];

export const MIME_TYPES: readonly MimeEntry[] = RAW.map(([ext, mime]) => ({ ext, mime }));
