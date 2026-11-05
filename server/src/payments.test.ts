import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  classifyCheckout,
  confirmCheckout,
  gateRefund,
  planChargeRefund,
  shouldExpireOpenCheckout,
} from './checkout.js';
import { DeliveryStopped, deliverVendorEmails, isFatalSesError, missingSesSettings, SES_NOT_CONFIGURED, vendorEmailInput } from './mail.js';

const owned = { registrationId: 'reg-1', userId: 'user-1', eventId: 'event-1' };

describe('checkout sessions', () => {
  test('accepts a paid or open booth fee and ignores any other amount', () => {
    assert.deepEqual(classifyCheckout({ payment_status: 'paid', amount_total: 500 }), { kind: 'paid', amountCents: 500 });
    assert.deepEqual(classifyCheckout({ status: 'open', url: 'https://pay.example', amount_total: 1000 }), {
      kind: 'open',
      url: 'https://pay.example',
      amountCents: 1000,
    });
    assert.deepEqual(classifyCheckout({ payment_status: 'paid', amount_total: 2500 }), { kind: 'none' });
    assert.deepEqual(classifyCheckout(null), { kind: 'none' });
  });

  test('confirms a paid booth fee only when the registration metadata is present', () => {
    const paid = confirmCheckout({
      payment_status: 'paid',
      amount_total: 1000,
      metadata: owned,
    });
    assert.equal(paid.ok, true);
    if (paid.ok) {
      assert.equal(paid.payment.registrationId, 'reg-1');
    }
    assert.equal(confirmCheckout({ payment_status: 'unpaid', amount_total: 1000, metadata: owned }).ok, false);
    assert.equal(confirmCheckout({ payment_status: 'paid', amount_total: 1000, metadata: {} }).ok, false);
  });

  test('expires an open checkout, refunds a paid one, and refuses a session for another registration', () => {
    assert.deepEqual(
      gateRefund({ status: 'open', metadata: owned, payment_intent: 'pi_1' }, owned),
      { action: 'expire' },
    );
    assert.deepEqual(
      gateRefund({ status: 'complete', payment_status: 'paid', metadata: owned, payment_intent: { id: 'pi_1' } }, owned),
      { action: 'refund', paymentIntentId: 'pi_1' },
    );
    assert.equal(gateRefund({ status: 'complete', payment_status: 'paid', metadata: { ...owned, userId: 'other' } }, owned).action, 'forbidden');
    assert.equal(gateRefund(null, owned).action, 'missing');
    assert.equal(gateRefund({ status: 'expired', payment_status: 'unpaid', metadata: owned }, owned).action, 'skip');
  });

  test('does not refund a charge that is already refunded or is not a booth fee', () => {
    assert.equal(planChargeRefund({ amount: 1000, amount_received: 1000, latest_charge: { amount_refunded: 1000 } }).action, 'skip');
    assert.equal(planChargeRefund({ amount: 1000, amount_received: 0 }).action, 'refund');
    assert.equal(planChargeRefund({ amount: 2500, amount_received: 2500 }).action, 'amount');
  });

  test('expires only a checkout that is still open', () => {
    assert.equal(shouldExpireOpenCheckout({ status: 'open' }), true);
    assert.equal(shouldExpireOpenCheckout({ status: 'complete' }), false);
    assert.equal(shouldExpireOpenCheckout(null), false);
  });
});

describe('outbound email', () => {
  const message = {
    replyTo: 'andrew@bishop4.com',
    subject: 'Vendor map',
    html: '<p>The map is attached.</p>',
    text: 'The map is attached.',
    images: [
      {
        id: 'img1',
        contentType: 'image/png',
        fileName: 'img1.png',
        bytes: Uint8Array.from([1, 2, 3]),
      },
    ],
    recipients: [{ email: 'ada@example.com' }, { email: 'grace@example.com' }],
  };

  test('sends one private message per person and keeps going when one address is rejected', async () => {
    const sent: string[] = [];
    const result = await deliverVendorEmails(message.recipients, async (email) => {
      sent.push(email);
      if (email === 'grace@example.com') {
        throw Object.assign(new Error('Address not verified.'), { name: 'MessageRejected' });
      }
    });
    assert.deepEqual(sent, ['ada@example.com', 'grace@example.com']);
    assert.equal(result.sent, 1);
    assert.deepEqual(result.failed, [{ email: 'grace@example.com', error: 'Address not verified.' }]);
  });

  test('stops the whole send when the account itself cannot send', async () => {
    const sent: string[] = [];
    await assert.rejects(
      () =>
        deliverVendorEmails(message.recipients, async (email) => {
          sent.push(email);
          throw Object.assign(new Error('Sending is paused.'), { name: 'AccountSendingPausedException' });
        }),
      (error: unknown) => error instanceof DeliveryStopped && error.message === 'Sending is paused.',
    );
    assert.deepEqual(sent, ['ada@example.com']);
    assert.equal(isFatalSesError('AccessDeniedException'), true);
    assert.equal(isFatalSesError('MessageRejected'), false);
  });

  test('embeds images as inline attachments and replies to the administrator', () => {
    const command = vendorEmailInput('events@example.com', message, 'ada@example.com');
    assert.deepEqual(command.Destination.ToAddresses, ['ada@example.com']);
    assert.deepEqual(command.ReplyToAddresses, ['andrew@bishop4.com']);
    const attachment = command.Content.Simple.Attachments[0];
    assert.equal(attachment?.ContentDisposition, 'INLINE');
    assert.equal(attachment?.ContentId, 'img1');
    assert.equal(attachment?.ContentTransferEncoding, 'BASE64');
    assert.deepEqual(attachment?.RawContent, message.images[0]?.bytes);
  });

  test('names every setting required before a message can be sent', () => {
    assert.equal(missingSesSettings({}), true);
    assert.equal(
      missingSesSettings({ region: 'us-east-1', accessKeyId: 'key', secretAccessKey: 'secret', from: 'events@example.com' }),
      false,
    );
    assert.match(SES_NOT_CONFIGURED, /AWS_REGION/);
  });
});
