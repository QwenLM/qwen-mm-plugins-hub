// Generated content lives only in the working directory and deployment artifacts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(
  readFileSync(path.join(root, 'source.config.json'), 'utf8'),
);
const source = path.resolve(
  process.env.HUB_SOURCE_DIR || path.join(root, '.sources/upstream'),
);
const ref = process.env.HUB_SOURCE_REF || config.ref;
const refresh = process.argv.includes('--refresh');
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', timeout: 120_000 }).trim();

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository))
  throw new Error('Invalid source repository');
git('check-ref-format', `refs/heads/${ref}`);
if (!existsSync(source)) {
  if (process.env.HUB_SOURCE_DIR)
    throw new Error(`Source checkout not found: ${source}`);
  mkdirSync(path.dirname(source), { recursive: true });
  git(
    'clone',
    '--single-branch',
    '--branch',
    ref,
    `https://github.com/${config.repository}.git`,
    source,
  );
  git('-C', source, 'fetch', '--tags', 'origin');
} else if (refresh) {
  if (process.env.HUB_SOURCE_DIR)
    throw new Error(
      'Fetch your explicitly selected source checkout yourself; it will not be modified.',
    );
  if (git('-C', source, 'status', '--porcelain', '--untracked-files=normal'))
    throw new Error(
      'The managed source checkout has local changes; refusing to update it.',
    );
  if (
    git('-C', source, 'remote', 'get-url', 'origin') !==
    `https://github.com/${config.repository}.git`
  )
    throw new Error(
      'The managed source remote differs from source.config.json.',
    );
  git(
    '-C',
    source,
    'fetch',
    '--tags',
    'origin',
    `refs/heads/${ref}:refs/remotes/origin/${ref}`,
  );
  git('-C', source, 'checkout', '--detach', `refs/remotes/origin/${ref}`);
}

const args = [
  '-m',
  'scripts.build_content',
  '--source',
  source,
  '--source-ref',
  ref,
];
if (process.env.HUB_SOURCE_COMMIT)
  args.push('--expected-commit', process.env.HUB_SOURCE_COMMIT);
try {
  if (process.env.HUB_PYTHON) {
    execFileSync(process.env.HUB_PYTHON, args, { cwd: root, stdio: 'inherit' });
  } else {
    execFileSync(
      'uv',
      [
        'run',
        '--no-project',
        '--python',
        '3.12',
        '--with',
        `qwen-mm-plugins[omni-memory] @ ${pathToFileURL(source).href}`,
        '--with-requirements',
        path.join(root, 'scripts/requirements-export.txt'),
        'python',
        ...args,
      ],
      { cwd: root, stdio: 'inherit' },
    );
  }
} catch (error) {
  if (error.code === 'ENOENT')
    console.error(
      'Install uv, or set HUB_PYTHON to a Python environment with the export dependencies.',
    );
  process.exitCode = 1;
}
