// Entry point of the server's voice department: builds the VoiceService from
// server/config.js (`config.voice`). See service.js for what it does and
// CONTRACTS.md ("voice integration") for the episode fields and endpoints.
import { VoiceService } from './service.js';

export { VoiceService } from './service.js';

export function createVoiceService(config, { root, log = console } = {}) {
  const service = new VoiceService({ config: config.voice || {}, root, log });
  // The workers must not outlive the server (each holds ~0.6 GB and a CPU):
  // close them on exit and on SIGINT/SIGTERM, then let the signal do its default.
  const stop = () => service.close();
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      stop();
      process.kill(process.pid, sig);
    });
  }
  return service;
}
