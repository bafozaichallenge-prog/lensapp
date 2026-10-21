import { embedderFromEnv } from './embed.js';
import { collectChunks } from './indexer.js';
import { Index } from './store.js';
import { searchCode } from './tools.js';

const indexPath = process.env.RAG_INDEX_PATH ?? '.rag/index.json';
const [cmd, ...args] = process.argv.slice(2);
const embedder = embedderFromEnv();

if (cmd === 'index') {
  const root = args[0] ?? 'sample-abl';
  const { chunks, files } = await collectChunks(root);
  const ix = await Index.build(chunks, embedder);
  await ix.save(indexPath);
  console.log(`Indexed ${files} files -> ${chunks.length} chunks (${embedder.name}) at ${indexPath}`);
  console.log(`MCP server source root: set ABL_SOURCE_ROOT=${root}`);
} else if (cmd === 'search' && args.length) {
  console.log(await searchCode(await Index.load(indexPath), embedder, args.join(' ')));
} else {
  console.log('Usage:\n  npm run index -- <abl-source-dir>\n  npm run search -- <query>\n  npm run mcp');
  process.exit(cmd ? 1 : 0);
}
