import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('src/client.js', 'dist/client.js');
