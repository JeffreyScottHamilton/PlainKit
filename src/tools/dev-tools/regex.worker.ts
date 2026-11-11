import { serve } from '@/workers/rpc';
import { runRegex, type RegexRequest, type RegexResult } from './logic/regex';

// Runs in its own worker so a catastrophic pattern can be stopped by terminating the worker.
serve<RegexRequest, RegexResult>(async (req) => ({ result: runRegex(req) }));
