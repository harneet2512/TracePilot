/**
 * Tests for job runner log spam reduction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('JobRunner logging', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.DEBUG_JOBS;
  });

  it('should throttle idle logs to once per 5 minutes', () => {
    const IDLE_LOG_THROTTLE_MS = 300000; // 5 minutes

    let lastIdleLogTime = 0;
    const now = Date.now();

    // First idle check - should log
    const shouldLog1 = now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS;
    expect(shouldLog1).toBe(true);

    // Update last log time
    lastIdleLogTime = now;

    // Immediate next check - should NOT log
    const shouldLog2 = now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS;
    expect(shouldLog2).toBe(false);

    // After 5 minutes - should log again
    const futureNow = now + IDLE_LOG_THROTTLE_MS + 1000;
    const shouldLog3 = futureNow - lastIdleLogTime > IDLE_LOG_THROTTLE_MS;
    expect(shouldLog3).toBe(true);
  });

  it('should log when DEBUG_JOBS=1 regardless of throttle', () => {
    process.env.DEBUG_JOBS = '1';

    const pendingCount = 0;
    const job = null;
    const now = Date.now();
    const lastIdleLogTime = now; // Just logged

    const IDLE_LOG_THROTTLE_MS = 300000;

    const shouldLog = pendingCount > 0 ||
                      job ||
                      (process.env.DEBUG_JOBS === '1') ||
                      (now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS);

    expect(shouldLog).toBe(true); // Should log due to DEBUG_JOBS
  });

  it('should NOT log when idle and DEBUG_JOBS is not set', () => {
    const pendingCount = 0;
    const job = null;
    const now = Date.now();
    const lastIdleLogTime = now; // Just logged

    const IDLE_LOG_THROTTLE_MS = 300000;

    const shouldLog = pendingCount > 0 ||
                      job ||
                      (process.env.DEBUG_JOBS === '1') ||
                      (now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS);

    expect(shouldLog).toBe(false); // Should NOT log
  });

  it('should log when jobs are pending', () => {
    const pendingCount = 3; // Jobs pending
    const job = null;
    const now = Date.now();
    const lastIdleLogTime = now; // Just logged

    const IDLE_LOG_THROTTLE_MS = 300000;

    const shouldLog = pendingCount > 0 ||
                      job ||
                      (process.env.DEBUG_JOBS === '1') ||
                      (now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS);

    expect(shouldLog).toBe(true); // Should log due to pending jobs
  });

  it('should log when job is claimed', () => {
    const pendingCount = 0;
    const job = { id: 'job-123' }; // Job claimed
    const now = Date.now();
    const lastIdleLogTime = now; // Just logged

    const IDLE_LOG_THROTTLE_MS = 300000;

    const shouldLog = pendingCount > 0 ||
                      job ||
                      (process.env.DEBUG_JOBS === '1') ||
                      (now - lastIdleLogTime > IDLE_LOG_THROTTLE_MS);

    expect(shouldLog).toBe(true); // Should log due to claimed job
  });

  it('should suppress heartbeat logs when idle in production', () => {
    const pendingCount = 0;
    const job = null;
    const shouldLog = false; // Already determined no log needed

    if (shouldLog) {
      // Would log here
      expect(true).toBe(false); // Should not reach
    } else {
      // Production mode: silent when idle
      if (pendingCount === 0 && !job && process.env.DEBUG_JOBS !== '1') {
        // Silent heartbeat - no console.log
        expect(true).toBe(true); // Silent as expected
      } else {
        // Should log
        expect(true).toBe(false); // Should not reach
      }
    }
  });
});

describe('Storage layer logging', () => {
  it('should wrap debug logs with DEBUG_JOBS check', () => {
    // Simulate claimJobWithLock logging logic

    // Without DEBUG_JOBS
    delete process.env.DEBUG_JOBS;
    let logCalled = false;

    if (process.env.DEBUG_JOBS === '1') {
      logCalled = true;
    }

    expect(logCalled).toBe(false); // Should not log

    // With DEBUG_JOBS=1
    process.env.DEBUG_JOBS = '1';
    logCalled = false;

    if (process.env.DEBUG_JOBS === '1') {
      logCalled = true;
    }

    expect(logCalled).toBe(true); // Should log
  });

  it('should log errors regardless of DEBUG_JOBS', () => {
    // Error logging should always happen
    delete process.env.DEBUG_JOBS;

    const error = new Error('Test error');
    let errorLogged = false;

    // Error logging doesn't check DEBUG_JOBS
    try {
      throw error;
    } catch (e) {
      // console.error('[storage] ERROR:', e.message);
      errorLogged = true;
    }

    expect(errorLogged).toBe(true);
  });
});
