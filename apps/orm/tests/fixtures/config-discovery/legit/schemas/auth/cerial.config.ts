import { writeFileSync } from 'node:fs';

// Records that this config was evaluated, so tests can prove discovery never ran it.
const marker = process.env.CERIAL_DISCOVERY_MARKER;
if (marker) writeFileSync(marker, 'executed');

export default { output: './gen' };
