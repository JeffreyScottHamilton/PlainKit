import { describe, expect, it } from 'vitest';
import { convertCase, splitWords } from './case';

describe('case', () => {
  it('splits acronyms, separators and camel boundaries', () => {
    expect(splitWords('HTTPServer_error-code')).toEqual(['HTTP', 'Server', 'error', 'code']);
    expect(splitWords('getHTTPResponse2x')).toEqual(['get', 'HTTP', 'Response', '2', 'x']);
  });
  it('converts to every style', () => {
    const s = 'HTTPServer_error-code';
    expect(convertCase(s, 'camel')).toBe('httpServerErrorCode');
    expect(convertCase(s, 'pascal')).toBe('HttpServerErrorCode');
    expect(convertCase(s, 'snake')).toBe('http_server_error_code');
    expect(convertCase(s, 'kebab')).toBe('http-server-error-code');
    expect(convertCase(s, 'constant')).toBe('HTTP_SERVER_ERROR_CODE');
    expect(convertCase(s, 'title')).toBe('Http Server Error Code');
    expect(convertCase(s, 'sentence')).toBe('Http server error code');
  });
  it('returns empty output for input with no letters or digits', () => {
    expect(convertCase('--- ', 'snake')).toBe('');
  });
});
