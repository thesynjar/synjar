import { DeploymentConfig } from './deployment.config';

describe('DeploymentConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Reset cache for clean tests
    DeploymentConfig.resetCache();
  });

  describe('getMode', () => {
    it('should use explicit DEPLOYMENT_MODE if set to cloud', () => {
      process.env.DEPLOYMENT_MODE = 'cloud';

      expect(DeploymentConfig.getMode()).toBe('cloud');
    });

    it('should use explicit DEPLOYMENT_MODE if set to self-hosted', () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';

      expect(DeploymentConfig.getMode()).toBe('self-hosted');
    });

    it('should detect cloud mode from STRIPE_SECRET_KEY', () => {
      delete process.env.DEPLOYMENT_MODE;
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';

      expect(DeploymentConfig.getMode()).toBe('cloud');
    });

    it('should default to self-hosted when no indicators present', () => {
      delete process.env.DEPLOYMENT_MODE;
      delete process.env.STRIPE_SECRET_KEY;

      expect(DeploymentConfig.getMode()).toBe('self-hosted');
    });
  });

  describe('isCloud', () => {
    it('should return true when mode is cloud', () => {
      process.env.DEPLOYMENT_MODE = 'cloud';

      expect(DeploymentConfig.isCloud()).toBe(true);
    });

    it('should return false when mode is self-hosted', () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';

      expect(DeploymentConfig.isCloud()).toBe(false);
    });
  });

  describe('isSelfHosted', () => {
    it('should return true when mode is self-hosted', () => {
      process.env.DEPLOYMENT_MODE = 'self-hosted';

      expect(DeploymentConfig.isSelfHosted()).toBe(true);
    });

    it('should return false when mode is cloud', () => {
      process.env.DEPLOYMENT_MODE = 'cloud';

      expect(DeploymentConfig.isSelfHosted()).toBe(false);
    });
  });

  describe('isEmailConfigured', () => {
    it('should return true when SMTP_HOST is set', () => {
      process.env.SMTP_HOST = 'smtp.example.com';

      expect(DeploymentConfig.isEmailConfigured()).toBe(true);
    });

    it('should return false when SMTP_HOST is not set', () => {
      delete process.env.SMTP_HOST;

      expect(DeploymentConfig.isEmailConfigured()).toBe(false);
    });
  });
});
