import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  descriptionSegments,
  emailPlainText,
  sanitizeDescription,
  sanitizeEmailHtml,
} from '../../client/src/description.js';

describe('event descriptions', () => {
  test('keeps basic emphasis and turns paragraphs into line breaks', () => {
    assert.equal(sanitizeDescription('<p>Hello <strong>there</strong></p><script>alert(1)</script>'), 'Hello <b>there</b>');
  });

  test('drops event handlers and javascript links from the stored text', () => {
    const stored = sanitizeDescription('<a href="javascript:alert(1)">click</a> <span style="font-size: 18px" onclick="no">Big</span>');
    assert.equal(stored.includes('javascript'), false);
    assert.equal(stored.includes('onclick'), false);
    assert.match(stored, /font-size: 18px/);
  });

  test('finds an email address inside formatted text', () => {
    const segments = descriptionSegments('Write <b>ada@example.com</b> today');
    const email = segments.find((segment) => segment.email);
    assert.equal(email?.email, 'ada@example.com');
    assert.equal(email?.marks.bold, true);
  });
});

describe('email HTML', () => {
  test('turns plain text line breaks into breaks and escapes tags that are not markup', () => {
    assert.equal(sanitizeEmailHtml('Hello\nthere'), 'Hello<br>there');
    assert.equal(sanitizeEmailHtml('2 < 3'), '2 &lt; 3');
  });

  test('keeps safe links and images, and removes scripts and unsafe sources', () => {
    const html = sanitizeEmailHtml(
      'Hi <b>there</b> <a href="https://example.com/map">map</a> <a href="javascript:alert(1)">no</a> <img src="cid:img1" alt="Map"> <img src="javascript:alert(1)" alt="Bad"> <img src="https://example.com/map.png" alt="Remote"> <script>alert(1)</script>',
    );
    assert.match(html, /<b>there<\/b>/);
    assert.match(html, /href="https:\/\/example\.com\/map"/);
    assert.equal(html.includes('javascript'), false);
    assert.equal(html.includes('script'), false);
    assert.match(html, /src="cid:img1"/);
    assert.match(html, /src="https:\/\/example\.com\/map\.png"/);
    assert.match(html, /style="max-width:100%;height:auto"/);
  });

  test('keeps a space around emphasis and limits font size to the supported range', () => {
    assert.match(sanitizeEmailHtml('Hi <b>there</b>'), /^Hi <b>there<\/b>$/);
    assert.match(sanitizeEmailHtml('<span style="font-size: 12px">A</span>'), /font-size: 12px/);
    assert.equal(sanitizeEmailHtml('<span style="font-size: 11px">A</span>'), 'A');
    assert.equal(sanitizeEmailHtml('<span style="font-size: 64px">A</span>'), 'A');
    assert.match(sanitizeEmailHtml('<a href="mailto:ada@example.com">Ada</a>'), /mailto:ada@example.com/);
    assert.equal(sanitizeEmailHtml('<a href="mailto:not-an-email">Ada</a>'), 'Ada');
  });

  test('builds a plain-text version that names the images', () => {
    const html = sanitizeEmailHtml('<p>Hi</p><img src="cid:img1" alt="Map"><img src="https://example.com/a.png" alt="Remote">');
    assert.equal(emailPlainText(html), 'Hi\n\n[Map]\n\n[Remote]');
  });
});
