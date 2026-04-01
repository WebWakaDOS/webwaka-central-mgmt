import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService, NotificationPayload } from './index';

// Mock fetch for external APIs
global.fetch = vi.fn();

describe('CORE-7: Unified Notification Service (Nigeria-First)', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    vi.resetAllMocks();
    notificationService = new NotificationService({
      yournotifyApiKey: 'yn-key-123',
      termiiApiKey: 'termii-key-456',
      termiiSenderId: 'WebWakaTest'
    });
  });

  it('should send email via Yournotify', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true });

    const payload: NotificationPayload = {
      tenantId: 't1',
      userId: 'u1',
      type: 'email',
      recipient: 'test@example.com',
      subject: 'Test Email',
      body: '<h1>Hello</h1>'
    };

    const result = await notificationService.dispatch(payload);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    const fetchArgs = (global.fetch as any).mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.yournotify.com/v1/campaigns/email');
    expect(fetchArgs[1].headers['Authorization']).toBe('Bearer yn-key-123');
    
    const body = JSON.parse(fetchArgs[1].body);
    expect(body.to).toBe('test@example.com');
    expect(body.subject).toBe('Test Email');
  });

  it('should send SMS via Termii', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true });

    const payload: NotificationPayload = {
      tenantId: 't1',
      userId: 'u1',
      type: 'sms',
      recipient: '2348012345678',
      body: 'Hello from WebWaka'
    };

    const result = await notificationService.dispatch(payload);

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    const fetchArgs = (global.fetch as any).mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.ng.termii.com/api/sms/send');
    
    const body = JSON.parse(fetchArgs[1].body);
    expect(body.to).toBe('2348012345678');
    expect(body.from).toBe('WebWakaTest');
    expect(body.api_key).toBe('termii-key-456');
  });

  it('should fail gracefully if API keys are missing', async () => {
    const emptyService = new NotificationService({});
    
    const emailResult = await emptyService.dispatch({
      tenantId: 't1', userId: 'u1', type: 'email', recipient: 'test@example.com', body: 'test'
    });
    
    const smsResult = await emptyService.dispatch({
      tenantId: 't1', userId: 'u1', type: 'sms', recipient: '2348012345678', body: 'test'
    });

    expect(emailResult).toBe(false);
    expect(smsResult).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
