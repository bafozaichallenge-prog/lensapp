// Usage: npm run break-glass:hash -- '<password>'   -> prints the value for LENS_BREAK_GLASS_HASH
import { hashPassword } from '@lens/services';
const pw = process.argv[2];
if (!pw || pw.length < 12) { console.error('Give a password of at least 12 characters.'); process.exit(1); }
console.log(hashPassword(pw));
