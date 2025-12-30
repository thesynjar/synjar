import { Email } from './email.value-object';

describe('Email Value Object', () => {
  describe('create', () => {
    it('should create valid email', () => {
      const email = Email.create('test@example.com');
      expect(email.getValue()).toBe('test@example.com');
    });

    it('should normalize email to lowercase', () => {
      const email = Email.create('Test@Example.COM');
      expect(email.getValue()).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      const email = Email.create('  test@example.com  ');
      expect(email.getValue()).toBe('test@example.com');
    });

    it('should throw on invalid email format', () => {
      expect(() => Email.create('invalid')).toThrow('Invalid email format');
      expect(() => Email.create('invalid@')).toThrow('Invalid email format');
      expect(() => Email.create('@example.com')).toThrow('Invalid email format');
      expect(() => Email.create('test@example')).toThrow('Invalid email format');
    });

    describe('HTML tag rejection (XSS prevention)', () => {
      it('should reject email with script tag', () => {
        expect(() =>
          Email.create('<script>alert("xss")</script>@example.com'),
        ).toThrow('Invalid email format');
      });

      it('should reject email with img tag', () => {
        expect(() =>
          Email.create('test<img src="x" onerror="alert(1)">@example.com'),
        ).toThrow('Invalid email format');
      });

      it('should reject email with simple HTML tag', () => {
        expect(() => Email.create('test<b>bold</b>@example.com')).toThrow(
          'Invalid email format',
        );
      });

      it('should reject email with self-closing tag', () => {
        expect(() => Email.create('test<br/>@example.com')).toThrow(
          'Invalid email format',
        );
      });

      it('should reject email ending with HTML tag', () => {
        expect(() => Email.create('test@example.com<script>')).toThrow(
          'Invalid email format',
        );
      });
    });
  });

  describe('equals', () => {
    it('should return true for equal emails', () => {
      const email1 = Email.create('test@example.com');
      const email2 = Email.create('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return true for same email with different casing', () => {
      const email1 = Email.create('Test@Example.com');
      const email2 = Email.create('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should return false for different emails', () => {
      const email1 = Email.create('test1@example.com');
      const email2 = Email.create('test2@example.com');
      expect(email1.equals(email2)).toBe(false);
    });
  });
});
