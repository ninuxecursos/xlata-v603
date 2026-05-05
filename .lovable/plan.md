## Contexto

A infraestrutura de SEO do shop já existe (sitemap-shop.xml, edge function `ping-search-engines`, e o hook `useShopProducts` já dispara o ping ao criar/atualizar produto). Porém há 3 problemas que impedem que a indexação seja realmente 100% automática:

1. O ping só dispara se `shop_seo_settings.auto_ping_enabled = true` — e novos produtos podem nascer com `allow_indexing = false` ou prioridade baixa.
2. **O endpoint `google.com/ping?sitemap=` foi descontinuado pelo Google em junho/2023** — hoje retorna 404 e não faz nada. O Bing também descontinuou em maio/2022. O método moderno e oficial é o **IndexNow** (Bing/Yandex) e a **Google Indexing API** (ou simplesmente confiar no crawl via sitemap atualizado + WebSub).
3. Não há submissão direta da URL do produto recém-criado — só "ping de sitemap".

## Plano

### 1. Migração de banco
- Garantir `shop_seo_settings.auto_ping_enabled = true` (default e update no registro existente).
- Adicionar coluna `indexnow_key TEXT` em `shop_seo_settings` (chave aleatória de 32 chars gerada via `gen_random_uuid()`).
- Garantir defaults no `shop_products`: `allow_indexing = true`, `sitemap_priority = 0.8`, `sitemap_changefreq = 'weekly'` para que TODO produto novo já nasça indexável.
- Backfill: atualizar produtos existentes com `allow_indexing = NULL` para `true`.

### 2. Endpoint público da chave IndexNow
Criar rota estática servida pelo Vercel: `/{indexnow_key}.txt` contendo a própria chave (requisito do protocolo). Implementado via edge function `indexnow-key` + rewrite no `vercel.json` mapeando `/:key([a-f0-9-]{36}).txt` para a function (que valida contra `shop_seo_settings.indexnow_key`).

### 3. Reescrever `ping-search-engines` para usar IndexNow + Google Indexing API
- **IndexNow** (cobre Bing, Yandex, Seznam, Naver): POST para `https://api.indexnow.org/indexnow` com JSON `{ host, key, keyLocation, urlList: [url_do_produto] }`. Quando chamado sem `product_id` específico, envia o sitemap inteiro (ou top N URLs recentes).
- **Google Indexing API** (opcional, requer Service Account): se o secret `GOOGLE_INDEXING_SA_JSON` estiver configurado, faz POST para `https://indexing.googleapis.com/v3/urlNotifications:publish` com `{ url, type: 'URL_UPDATED' }`. Caso o secret não exista, faz fallback silencioso para apenas IndexNow + atualização do sitemap (Google fará crawl normal via sitemap.xml já referenciado no robots.txt).
- Loga cada tentativa em `shop_seo_ping_log` com o motor (`indexnow`, `google_indexing`) e a URL específica.

### 4. Disparo automático no ciclo de vida do produto
O hook `useShopProducts.useCreateProduct` e `useUpdateProduct` já invocam `ping-search-engines` com `product_id`. Vou:
- Passar também `url` (montada a partir de `base_url + /shop/ + slug`) para que a function notifique a URL exata do produto, não só o sitemap.
- Garantir que a invocação aconteça mesmo se `auto_ping_enabled` estiver false na primeira criação (sempre que `allow_indexing` do produto = true).

### 5. UI no `ShopSEOManager`
- Mostrar a chave IndexNow gerada e o link público da chave (`/{key}.txt`) com botão "Copiar".
- Banner verde: "Indexação automática ativa — Google e Bing são notificados a cada produto novo".
- Campo opcional para colar o JSON da Service Account do Google Indexing API (salvo como secret via aviso ao usuário, não no banco).
- Filtro de log por motor (`indexnow` / `google_indexing`).

### 6. WebSub/PubSubHubbub (bônus leve)
Adicionar no header do `sitemap-shop.xml` a tag `<atom:link rel="hub" href="https://pubsubhubbub.appspot.com/" />` e dar um POST ao hub a cada update — Google ainda escuta isso para sitemaps. Custo zero, sem secret.

## Resultado final para o usuário

Após aprovar:
- Toda vez que você cadastrar um produto no Shop CMS, em segundos:
  - A URL do produto é enviada via IndexNow → Bing/Yandex indexam em minutos a horas.
  - O sitemap é atualizado e o WebSub hub notificado → Google detecta a mudança no próximo crawl (geralmente <24h).
  - Se você configurar o Google Indexing API (opcional), a indexação no Google também é em minutos.
- Você não precisa fazer mais nada manualmente.

## Arquivos afetados

- Nova migration SQL (defaults + indexnow_key).
- `supabase/functions/ping-search-engines/index.ts` (reescrita).
- `supabase/functions/indexnow-key/index.ts` (nova).
- `supabase/functions/generate-sitemap/index.ts` (adicionar tag WebSub hub).
- `vercel.json` (rewrite da chave IndexNow).
- `src/hooks/useShopProducts.ts` (passar `url` ao invocar).
- `src/components/shop/admin/ShopSEOManager.tsx` (UI da chave + status).

## Pergunta antes de implementar

Você quer também ativar o **Google Indexing API** (indexação em minutos no Google, mas exige criar uma Service Account no Google Cloud e colar o JSON como secret), ou prefere começar só com **IndexNow + sitemap automático** (zero configuração, Google indexa via crawl normal em até 24h)?
