import { Logger } from 'logger';

export class TelemetryService {
  constructor(config) {
    this.config = config;
    this.logger = new Logger('Telemetry');
  }
  
  trackEvent(name, data) {
    this.logger.info(`Event: ${name}`, data);
    // Send to central collector
    fetch('https://telemetry.internal/api', { method: 'POST', body: JSON.stringify({ name, data }) });
  }
}