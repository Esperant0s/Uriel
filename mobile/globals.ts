// Node globals server.js expects.
import { Buffer } from 'buffer';
export const process = { env: {}, platform: 'ios', arch: 'arm64', versions: { mobile: '1' }, cwd: () => '/', nextTick: <A extends unknown[]>(f: (...args: A) => void, ...a: A) => queueMicrotask(() => f(...a)), resourcesPath: '/' };
export { Buffer };
