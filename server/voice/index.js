// Entry point of the server's voice department: builds the VoiceService from
// server/config.js (`config.voice`). See service.js for what it does and
// CONTRACTS.md ("voice integration") for the episode fields and endpoints.
import { VoiceService } from './service.js';

export { VoiceService } from './service.js';

export function createVoiceService(config, { root, log = console } = {}) {
  const service = new VoiceService({ config: config.voice || {}, root, log });
  // The worker must not outlive the server (it would hold ~0.5 GB and a CPU).
  const stop = () => service.close();
  process.once('exit', stop);
  return service;
}
