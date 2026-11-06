import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execute = promisify(execFile);
export async function postgresTool(tool: 'pg_dump' | 'pg_restore') {
  const configured = process.env[tool === 'pg_dump' ? 'PG_DUMP_PATH' : 'PG_RESTORE_PATH'];
  if (configured) return configured;
  if (process.platform === 'win32') {
    const root = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    const versions = await fs.readdir(root).catch(() => [] as string[]);
    versions.sort((a,b) => b.localeCompare(a, undefined, {numeric:true}));
    for (const version of versions) {
      const candidate = path.join(root, version, 'bin', `${tool}.exe`);
      try { await fs.access(candidate); return candidate; } catch { /* Try next installation. */ }
    }
  }
  return tool;
}
export async function backupDatabase(destination: string) {
  if (!process.env.DATABASE_URL) throw new Error('Connexion non configurée');
  const url = new URL(process.env.DATABASE_URL);
  const temporary = destination + '.partial';
  try {
    const executable = await postgresTool('pg_dump');
    await execute(executable, [
      '--format=custom', '--no-owner', '--no-acl', '--no-password',
      '--host', url.hostname, '--port', url.port || '5432',
      '--username', decodeURIComponent(url.username), '--dbname', decodeURIComponent(url.pathname.slice(1)),
      '--file', temporary,
    ], {
      windowsHide:true, timeout:120000,
      env:{...process.env, PGPASSWORD:decodeURIComponent(url.password), PGCONNECT_TIMEOUT:'5'},
    });
    await fs.rename(temporary, destination);
    return destination;
  } catch {
    await fs.unlink(temporary).catch(() => {});
    throw new Error('Sauvegarde impossible. Vérifiez PostgreSQL, l’espace disque et la présence de pg_dump (PG_DUMP_PATH).');
  }
}
export function createBackupManager(directory: string) {
  let running: Promise<string | null> | null = null;
  let lastFile: string | null = null;
  let lastError: string | null = null;
  async function daily() {
    if (running) return running;
    running = (async () => {
      await fs.mkdir(directory, {recursive:true});
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const filename = path.join(directory, `pos-${date}.dump`);
      try { await fs.access(filename); lastFile=filename; lastError=null; return filename; } catch { /* First backup today. */ }
      lastFile = await backupDatabase(filename); lastError=null;
      return lastFile;
    })().catch(error => { lastError=error.message; return null; }).finally(() => { running=null; });
    return running;
  }
  return {daily, status:() => ({directory,lastFile,lastError,running:Boolean(running)})};
}
