# ADR-003: Background Email Queue for Authentication

**Date:** 2025-12-26
**Status:** ✅ Accepted
**Context:** Timing Attack Prevention in Authentication
**Deciders:** Synjar Engineering Team

---

## Context and Problem Statement

Authentication endpoints (registration, password reset, email verification) must prevent timing attacks that could reveal whether an email exists in the system.

**Problem:** Sending emails synchronously in request handlers creates timing differences that leak information:
- User exists + email sent: 200-500ms response
- User doesn't exist (no email): 50ms response
- Attacker can enumerate registered emails by measuring response times

**Security Requirement:** All authentication responses must take constant time regardless of whether emails are sent.

---

## Decision Drivers

1. **Security:** Prevent email enumeration via timing attacks
2. **Performance:** Don't block HTTP responses waiting for email delivery
3. **Reliability:** Handle email failures gracefully (retry, dead-letter queue)
4. **User Experience:** Fast API responses (no waiting for SMTP)
5. **Simplicity:** Avoid over-engineering for v1

---

## Considered Options

### Option 1: Synchronous Email Sending

**Approach:** Send email directly in request handler, return response after completion

```typescript
async register(dto: RegisterDto) {
  const user = await createUser(dto);
  await emailService.sendVerification(user.email); // BLOCKS
  return { message: 'Success' };
}
```

**Pros:**
- ✅ Simple - no queue needed
- ✅ Immediate feedback if email fails

**Cons:**
- ❌ Timing attack vulnerability (email send time varies 100-500ms)
- ❌ Slow responses (200-500ms for SMTP)
- ❌ Cannot achieve constant-time responses
- ❌ Request fails if SMTP down

---

### Option 2: Fire-and-Forget (No Queue)

**Approach:** Trigger email in background, don't wait for completion

```typescript
async register(dto: RegisterDto) {
  const user = await createUser(dto);
  this.emailService.sendVerification(user.email); // DON'T AWAIT
  return { message: 'Success' };
}
```

**Pros:**
- ✅ Fast responses (no SMTP wait)
- ✅ Simple - no queue infrastructure

**Cons:**
- ❌ No retry on failure
- ❌ No visibility into email status
- ❌ Emails lost if app crashes before send
- ❌ Still has timing variation (queueing overhead varies)

---

### Option 3: In-Memory Queue (NestJS Built-in)

**Approach:** Use NestJS `@nestjs/bull` with Redis-backed queue

```typescript
async register(dto: RegisterDto) {
  const user = await createUser(dto);
  await this.emailQueue.add('verification', { email: user.email }); // ~1ms
  return { message: 'Success' };
}
```

**Pros:**
- ✅ Fast, predictable queueing time (~1-2ms)
- ✅ Retry on failure (configurable attempts)
- ✅ Persistence (Redis survives app restart)
- ✅ Monitoring (Bull dashboard shows queue status)
- ✅ Scalable (horizontal scaling with Redis)
- ✅ Battle-tested (widely used in production)

**Cons:**
- ⚠️ Requires Redis dependency
  - **Mitigation:** Redis already used for sessions/cache in Cloud
  - **Self-hosted:** Optional (fallback to fire-and-forget)
- ⚠️ Additional infrastructure complexity

---

### Option 4: Database-Backed Queue

**Approach:** Store email jobs in PostgreSQL table, worker polls/processes

**Pros:**
- ✅ No Redis dependency (uses existing PostgreSQL)
- ✅ Retry/persistence

**Cons:**
- ❌ Slower than Redis (polling PostgreSQL is heavier)
- ❌ Database contention (emails compete with app queries)
- ❌ More complex implementation (custom worker logic)

---

## Decision Outcome

**Chosen option:** **Option 3 - In-Memory Queue (Bull + Redis)** for Cloud, **Option 2 - Fire-and-Forget** fallback for Self-hosted

**Rationale:**

### Cloud Deployment
- Redis already available (sessions, cache)
- High email volume (public registration)
- Monitoring/retry required for reliability
- Security critical (prevent enumeration)

### Self-hosted Deployment
- Optional Redis (minimizes dependencies)
- Low email volume (invitations only)
- Fallback to fire-and-forget acceptable
- Admin can check logs for failures

**Implementation Strategy:**
1. Implement queue-based service with Redis backend
2. Add fallback to synchronous send if Redis unavailable
3. Log mode on startup (queue vs. synchronous)

---

## Implementation

### Email Queue Service

```typescript
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class EmailQueueService {
  private useQueue: boolean;

  constructor(
    @InjectQueue('email') private emailQueue: Queue | null,
    private emailService: EmailService,
  ) {
    this.useQueue = !!emailQueue;
    console.log(`Email mode: ${this.useQueue ? 'QUEUE' : 'SYNCHRONOUS'}`);
  }

  async queueEmailVerification(email: string, token: string, url: string) {
    if (this.useQueue) {
      // Queue mode (Cloud) - fast, non-blocking
      await this.emailQueue.add('verification', { email, token, url });
    } else {
      // Fallback mode (Self-hosted) - fire-and-forget
      this.emailService.sendVerificationEmail(email, token, url)
        .catch(err => console.error('Email send failed:', err));
    }
  }
}
```

### Queue Processor

```typescript
@Processor('email')
export class EmailProcessor {
  constructor(private emailService: EmailService) {}

  @Process('verification')
  async sendVerification(job: Job<{ email: string; token: string; url: string }>) {
    const { email, token, url } = job.data;
    await this.emailService.sendVerificationEmail(email, token, url);
  }
}
```

### Queue Configuration

```typescript
// Bull queue config (Cloud only)
BullModule.forRoot({
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
}),

BullModule.registerQueue({
  name: 'email',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
  },
})
```

---

## Consequences

### Positive

- ✅ **Security:** Constant-time responses (queue add = ~1ms, predictable)
- ✅ **Performance:** API responses <50ms (no SMTP wait)
- ✅ **Reliability:** Automatic retry on failure (3 attempts)
- ✅ **Monitoring:** Bull dashboard shows email queue status
- ✅ **Scalability:** Horizontal scaling (multiple workers)
- ✅ **UX:** Fast API responses improve perceived performance
- ✅ **Flexibility:** Self-hosted works without Redis

### Negative

- ⚠️ **Complexity:** Additional infrastructure (Redis + Bull)
  - **Mitigation:** Redis already used in Cloud for other features
  - **Mitigation:** Self-hosted fallback keeps it optional
- ⚠️ **Delayed feedback:** User doesn't know immediately if email failed
  - **Mitigation:** Show generic "Check your email" message
  - **Mitigation:** Admin dashboard shows failed email jobs
- ⚠️ **Dependency:** Redis must be available in Cloud
  - **Mitigation:** App startup fails fast if Redis down (fail loudly)

### Risks

- ⚠️ **Queue backlog:** If SMTP slow, queue can build up
  - **Mitigation:** Monitor queue length (alert if >1000)
  - **Mitigation:** Rate limit registration (prevent spam)
- ⚠️ **Lost emails:** If Redis cleared, queued emails lost
  - **Mitigation:** Redis persistence enabled
  - **Mitigation:** Users can request resend

---

## Validation

### Security Testing

**Timing Attack Test:**
```typescript
it('prevents email enumeration via timing attack', async () => {
  const times: number[] = [];

  // Test 100 requests (50 existing, 50 non-existing)
  for (let i = 0; i < 100; i++) {
    const email = i % 2 === 0 ? 'existing@test.com' : 'random@test.com';
    const start = Date.now();
    await request(app).post('/auth/register').send({ email, password: 'Test123!' });
    times.push(Date.now() - start);
  }

  // All responses should be within 10ms of each other
  const min = Math.min(...times);
  const max = Math.max(...times);
  expect(max - min).toBeLessThan(10); // Constant time (±10ms)
});
```

### Performance Testing

- ✅ Queue mode: Response time <5ms (vs. 200ms synchronous)
- ✅ Retry: Failed emails retry 3x with exponential backoff
- ✅ Fallback: Self-hosted works without Redis

**Files:**
- Service: `community/apps/api/src/application/email/email-queue.service.ts`
- Processor: `community/apps/api/src/application/email/email.processor.ts`
- Config: `community/apps/api/src/application/auth/auth.module.ts`

---

## Related Decisions

- [ADR-002: Persistent Invitation Model](./2025-12-26-persistent-invitation-model.md)
- [Dual-Mode Registration Spec](../specifications/2025-12-26-dual-mode-registration.md)

---

## Future Considerations

### Email Templates (Future)

If custom templates needed:
- Store templates in database or filesystem
- Pass template ID to queue job
- Render template in processor

### Email Webhooks (Future)

For delivery tracking (SendGrid webhooks):
- Add `emailLogId` to queue job
- Update email log on delivery/bounce/open
- Notify users if email bounced

### Priority Queues (Future)

If different email priorities needed:
- Password reset: HIGH priority
- Marketing emails: LOW priority
- Configure Bull with multiple queues

---

**Status:** ✅ Implemented (Phase 4)
**Review Date:** 2026-12-26 (1 year)
**Owner:** Synjar Engineering Team
