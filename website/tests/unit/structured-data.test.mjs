import assert from 'node:assert/strict';
import test from 'node:test';

import { scriptJson, structuredData } from '../../src/structured-data.mjs';

const home = 'https://example.org/mangabound/pt-br/';
const page = { home, title: 'Instalação', description: 'Baixe o pacote.', lang: 'pt-BR' };

test("a language's home page describes the site and the application in that language", () => {
  const [website, application] = structuredData({ ...page, url: home })['@graph'];
  assert.deepEqual(website, {
    '@type': 'WebSite',
    name: 'Mangabound',
    url: home,
    inLanguage: 'pt-BR',
    description: 'Baixe o pacote.',
  });
  assert.equal(application['@type'], 'SoftwareApplication');
  assert.equal(application.url, home);
  assert.equal(application.inLanguage, 'pt-BR');
  assert.equal(application.offers.price, '0');
});

test("an inner page leads back to its own language's home page", () => {
  const url = `${home}getting-started/installation/`;
  assert.deepEqual(structuredData({ ...page, url }).itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Mangabound', item: home },
    { '@type': 'ListItem', position: 2, name: 'Instalação', item: url },
  ]);
});

test('a title cannot close the script element that carries the data', () => {
  const json = scriptJson({ name: '</script><b>' });
  assert.equal(json.includes('<'), false);
  assert.deepEqual(JSON.parse(json), { name: '</script><b>' });
});
