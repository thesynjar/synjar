import { hashEmail } from './hash.util';

describe('hashEmail', () => {
  it('should hash email consistently', () => {
    const email = 'user@example.com';
    const hash1 = hashEmail(email);
    const hash2 = hashEmail(email);

    expect(hash1).toBe(hash2);
    expect(hash1).toBe(
      'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
    );
  });

  it('should normalize email to lowercase', () => {
    const hash1 = hashEmail('User@Example.COM');
    const hash2 = hashEmail('user@example.com');

    expect(hash1).toBe(hash2);
  });

  it('should trim whitespace', () => {
    const hash1 = hashEmail('  user@example.com  ');
    const hash2 = hashEmail('user@example.com');

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different emails', () => {
    const hash1 = hashEmail('user1@example.com');
    const hash2 = hashEmail('user2@example.com');

    expect(hash1).not.toBe(hash2);
  });

  it('should return a 64-character hex string (SHA-256)', () => {
    const hash = hashEmail('test@example.com');

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
