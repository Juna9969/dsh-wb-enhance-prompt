import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const shared = (await readFile(join(root, 'src/draft.js'), 'utf8')).replace(/^export /gm, '');
const style = await readFile(join(root, 'src/style.css'), 'utf8');
const client = (await readFile(join(root, 'src/client.cjs'), 'utf8'))
  .replace("const { DEFAULTS, MODES, captureDraft, draftConflict, protectedContentIssue } = require('./draft.js');", shared)
  .replace("const css = require('./style.css');", `const css = ${JSON.stringify(style)};`);
const output = `// Built by scripts/build.mjs. Native Harness lazy-CJS module; no runtime dependencies bundled.\nwindow.__ModuleLoader__.load({\n  id: ${JSON.stringify(manifest.name)},\n  factory: (require) => {\n    const module = { exports: {} };\n${client}\n    return module.exports;\n  }\n});\n`;
new Script(output, { filename: 'client.js' });
await mkdir(join(root, 'lib'), { recursive: true });
await writeFile(join(root, 'lib/client.js'), output);
console.log(`Built ${manifest.name} client (${Buffer.byteLength(output)} bytes).`);
