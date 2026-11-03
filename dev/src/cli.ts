#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv, stdin, stdout } from 'node:process';
import { run } from './run';

/** Claude Code pipes JSON to a status line command; every other command ignores stdin. */
const piped = !stdin.isTTY && argv[2] === 'statusline' ? readFileSync(0, 'utf8') : undefined;
const text = run(argv.slice(2), piped === undefined ? {} : { stdin: piped });
stdout.write(text === '' ? '' : `${text}\n`);
