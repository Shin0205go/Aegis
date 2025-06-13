import { SecurityInfoEnricher } from './security-info';
import { DecisionContext } from '../../types';

describe('SecurityInfoEnricher', () => {
  let enricher: SecurityInfoEnricher;

  beforeEach(() => {
    enricher = new SecurityInfoEnricher();
  });

  describe('enrich', () => {
    it('should enrich context with security information', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info']).toBeDefined();
      expect(enriched['security-info'].clientIP).toBe('125.56.86.166');
      expect(enriched['security-info'].geoLocation.country).toBe('JP');
      expect(enriched['security-info'].threatLevel).toBe('low');
    });

    it('should detect Japanese IP addresses correctly', async () => {
      const context: DecisionContext = {
        agent: 'test-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {
          clientIP: '125.56.86.166'
        }
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info'].geoLocation.country).toBe('JP');
      expect(enriched['security-info'].geoLocation.timezone).toBe('Asia/Tokyo');
      expect(enriched['security-info'].geoLocation.isHighRisk).toBe(false);
    });

    it('should calculate security score correctly', async () => {
      const context: DecisionContext = {
        agent: 'trusted-agent',
        action: 'read',
        resource: 'test-resource',
        time: new Date(),
        environment: {}
      };

      const enriched = await enricher.enrich(context);

      expect(enriched['security-info'].securityScore).toBeGreaterThanOrEqual(0);
      expect(enriched['security-info'].securityScore).toBeLessThanOrEqual(1);
    });
  });
});