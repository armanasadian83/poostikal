import test from 'node:test';
import assert from 'node:assert/strict';
import { storefrontRichText, storefrontText, sanitizeRichText, richTextLength, richTextToPlainText, isSafeRichTextLink } from '@poostikal/rich-text';
import { parse, productSchema, validateProduct } from '../dist/validation.js';

test('rich descriptions preserve formatting and remove executable HTML and unsafe links', () => {
  const input = '<h2 style="text-align:center;color:red" onclick="alert(1)">معرفی</h2><p><strong>پررنگ</strong> <em>مورب</em> <u>زیرخط</u> <s>حذف</s></p><ol start="3"><li>یک</li></ol><blockquote>نقل قول</blockquote><hr><a href="https://example.com" target="_blank">لینک</a><script>alert(1)</script><img src=x onerror=alert(1)><svg onload="alert(1)"></svg><iframe src="https://example.com"></iframe><a href="java&#x73;cript:alert(1)">بد</a>';
  const html = sanitizeRichText(input);
  assert.match(html, /<h2 style="text-align:center">/);
  assert.match(html, /<strong>پررنگ<\/strong>/);
  assert.match(html, /<ol start="3">/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /script|onclick|onerror|onload|<img|<svg|iframe|color:|javascript/i);
  assert.equal(sanitizeRichText(html), html, 'sanitization must be idempotent');
  assert.equal(richTextLength('<p>&nbsp;<br></p>'), 0);
  assert.equal(richTextLength('<strong>سلام 💜</strong>'), 6);
  assert.equal(richTextToPlainText('<h2>سلام</h2><p>پوست &amp; مو</p>'), 'سلام\nپوست & مو');
  assert.equal(sanitizeRichText('پوست & مو\nقیمت < ۵۰'), '<p>پوست &amp; مو<br />قیمت &lt; ۵۰</p>');
  for (const href of ['https://example.com', '/shop', '#details', 'mailto:a@example.com', 'tel:09120000000']) assert.ok(isSafeRichTextLink(href));
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//evil.test', '/\\evil.test', 'https://exa mple.com']) assert.equal(isSafeRichTextLink(href), false);
});

const draft = () => ({ id: 'rich-text-test', slug: 'rich-text-test', name: 'آزمایش', brand: '', brandId: '', category: '', categoryIds: [], image: '', images: [], description: '', shortDescription: '', attributes: [], regularPriceToman: 0, priceToman: 0, stock: 0, status: 'draft', variants: [], mediaType: 'photo', animation: { template: 'dropper-box', references: ['closed', 'open', 'product', 'angle'].map(slot => ({ slot, image: null })), dimensions: {}, reviewConfirmed: false } });
test('API validates visible text lengths, accepts rich markup and rejects empty published descriptions', () => {
  const valid = parse(productSchema, { ...draft(), shortDescription: '<strong>س</strong>'.repeat(500), description: '<p>' + 'م'.repeat(20000) + '</p>' });
  validateProduct(valid);
  assert.equal(richTextLength(valid.shortDescription), 500);
  assert.equal(richTextLength(valid.description), 20000);
  assert.throws(() => validateProduct(parse(productSchema, { ...draft(), shortDescription: '<p>' + 'س'.repeat(501) + '</p>' })));
  assert.throws(() => validateProduct(parse(productSchema, { ...draft(), description: 'م'.repeat(20001) })));
  assert.throws(() => validateProduct(parse(productSchema, { ...draft(), status: 'active', brandId: 'brand', categoryIds: ['category'], regularPriceToman: 100, stock: 1, description: '<p><br></p>', shortDescription: '<script>fake content</script>' })));
  const clean = parse(productSchema, { ...draft(), description: '<p onclick="x()">متن</p><script>alert(1)</script>' });
  validateProduct(clean);
  assert.equal(clean.description, '<p>متن</p>');
});

test('plain catalog fields match sanitized markup and keep supplier names private',()=>{
  for(const text of ['معرفی محصول',' two  words ','آب‌رسان','Brand 123','plain\u00a0text','شرکت رابوطب','Rab o teb','', '   ']){
    assert.equal(storefrontRichText(text),storefrontRichText('<p>'+text+'</p>'));
    assert.equal(storefrontText(text),richTextToPlainText(storefrontRichText('<p>'+text+'</p>')));
  }
});
