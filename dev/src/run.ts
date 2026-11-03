import { priceRecords, renderReport, renderSession, renderStatusline, summarize, wasteReport } from './report';
import { claudeDir, loadOverrides, loadRecords, stateDir } from './store';

export interface RunOptions {
  /** Claude Code's folder and this tool's own folder; tests point both at a temp directory. */
  claude?: string;
  state?: string;
  now?: number;
  /** What Claude Code pipes to a status line command (JSON), when run as one. */
  stdin?: string;
}

const HELP = `aperture-meter: what Claude Code is costing you, and where it is wasted. Free, local, no account.

  cost [--session <id>]   what this session has cost (default: the one in use now)
  report [--days <n>]     the last n days (default 7): cache hits, run rate, costliest turns
  statusline              one line for Claude Code's status bar (reads its JSON from stdin)
  connect                 how to send this data to an Aperture workspace (optional)

It reads token counts from Claude Code's local session files and never reads message text,
credentials, or the network.`;

const CONNECT = `This tool never sends anything anywhere. If your company runs Aperture and you want your
usage to appear in its Seats and Inventory pages, that is a separate, optional step:

  1. In your Aperture workspace open "My AI tools", then "Connect Claude Code".
  2. Follow the steps shown there. They show exactly what will change before anything is changed.

If you do not use Aperture at work, there is nothing to do here: the meter is complete on its own.`;

const flag = (args: readonly string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};

/** Runs one command and returns the text to print. */
export function run(args: readonly string[], options: RunOptions = {}): string {
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help' || command === '-h') return HELP;
  if (command === 'connect') return CONNECT;

  const claude = options.claude ?? claudeDir();
  const state = options.state ?? stateDir();
  const now = options.now ?? Date.now();
  const overrides = loadOverrides(state);
  const priced = priceRecords(loadRecords(claude, state), overrides);

  if (command === 'report') {
    const days = Number(flag(rest, '--days') ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 365) return 'Use --days with a whole number from 1 to 365.';
    if (priced.length === 0) return 'No Claude Code sessions were found on this machine yet.';
    return renderReport(wasteReport(priced, now, { days, overrides }));
  }

  if (command === 'cost' || command === 'statusline') {
    let sessionId = flag(rest, '--session');
    if (command === 'statusline' && options.stdin !== undefined) {
      try {
        const given = (JSON.parse(options.stdin) as { session_id?: unknown }).session_id;
        if (typeof given === 'string') sessionId = given;
      } catch {
        // Not JSON: fall back to the session in use.
      }
    }
    if (priced.length === 0)
      return command === 'statusline' ? '' : 'No Claude Code sessions were found on this machine yet.';
    // The session in use is the one with the most recent reply.
    const latest = [...priced].sort((a, b) => b.at - a.at)[0];
    const id = sessionId ?? latest?.sessionId ?? '';
    const summary = summarize(priced.filter((record) => record.sessionId === id));
    if (summary.turns === 0) return command === 'statusline' ? '' : `No usage recorded for session ${id}.`;
    return command === 'statusline' ? renderStatusline(summary) : renderSession(summary, id);
  }
  return `Unknown command "${command}".\n\n${HELP}`;
}
