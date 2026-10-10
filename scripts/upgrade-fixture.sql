-- A library in use, as the schema of this version holds it. CI loads it into
-- a database migrated to the base branch, then migrates that database to the
-- pull request (.github/workflows/ci.yml), so every migration is tried
-- against rows, not only an empty schema. When a migration changes a table,
-- change this file in the same pull request: the next one loads it as the base.

insert into users (id, name, email, email_verified) values
  ('fixture-ada', 'Ada', 'ada@fixture.test', true),
  ('fixture-bo', 'Bo', 'bo@fixture.test', false);

insert into organizations (id, slug, name) values ('00000000-0000-4000-8000-000000000001', 'fixture', 'Fixture');
insert into projects (id, organization_id, slug, name) values
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'library', 'Library');
insert into brands (id, project_id, slug, name, is_default, theme) values
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'default', 'Fixture', true, '{"accent": "color.primary", "body": "type.body", "radius": 8}');

insert into grants (user_id, organization_id, project_id, resource, resource_id, scope) values
  ('fixture-ada', '00000000-0000-4000-8000-000000000001', null, 'organization', '00000000-0000-4000-8000-000000000001', 'admin'),
  ('fixture-bo', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'project', '00000000-0000-4000-8000-000000000002', 'write');

insert into collections (id, project_id, name, fields) values
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Autumn', '{"campaign": "Autumn"}');

insert into assets (id, project_id, sha256, filename, mime, size, width, height, tags, status, stack_id, version, current, rights, deleted_at) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', repeat('a', 64), 'logo-v1.png', 'image/png', 1000, 64, 64, '["logo"]', 'active', '00000000-0000-4000-8000-000000000010', 1, false, null, null),
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002', repeat('b', 64), 'logo-v2.png', 'image/png', 2000, 64, 64, '["logo"]', 'active', '00000000-0000-4000-8000-000000000010', 2, true, '{"expires": "2099-12-31"}', null),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002', repeat('c', 64), 'draft.jpg', 'image/jpeg', 3000, null, null, '[]', 'proposed', null, null, false, null, null),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000002', repeat('d', 64), 'gone.jpg', 'image/jpeg', 4000, null, null, '[]', 'active', null, null, false, null, now());
update assets set superseded_by = '00000000-0000-4000-8000-000000000011' where id = '00000000-0000-4000-8000-000000000010';

insert into collection_assets (collection_id, asset_id) values ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000011');

insert into oauth_clients (id, name, redirect_uris, grant_types, used_at) values
  ('abc_fixture', 'Claude', '["https://claude.ai/api/mcp/auth_callback"]', '["authorization_code", "refresh_token"]', now());
insert into api_keys (project_id, name, prefix, hash, scope, user_id, expires_at, refresh_hash, refresh_expires_at, client_id) values
  ('00000000-0000-4000-8000-000000000002', 'Claude (Ada)', 'ab_fixture', repeat('e', 64), 'propose', 'fixture-ada', now() + interval '1 hour', repeat('f', 64), now() + interval '90 days', 'abc_fixture');

insert into activity (project_id, actor, verb, asset_id, label) values
  ('00000000-0000-4000-8000-000000000002', 'Ada', 'added', '00000000-0000-4000-8000-000000000011', 'logo-v2.png');
insert into audit (organization_id, actor, user_id, action, target) values
  ('00000000-0000-4000-8000-000000000001', 'Ada', 'fixture-ada', 'grant.set', 'bo@fixture.test');

insert into settings (organization_id, key, value, updated_by) values
  ('00000000-0000-4000-8000-000000000001', 'limits', '{"storage": "10GB", "editors": 5}', 'operator');
insert into traffic (project_id, day, requests, bytes) values ('00000000-0000-4000-8000-000000000002', current_date, 12, 34567);

insert into portals (id, project_id, slug, name, intro, access, password_hash, presets, theme, site, created_by) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000002', 'fixture-press', 'Press kit', 'For press.', 'password',
   'scrypt$c2FsdA$aGFzaA', '["web", "print"]', '{"logo": "00000000-0000-4000-8000-000000000011", "accent": "#ff7a00", "background": null}',
   '{"footer": {"text": "Questions? [Write to us](mailto:press@fixture.test).", "links": [{"label": "Newsroom", "href": "https://fixture.test/news"}]}, "quick": [{"label": "Logo", "asset": "00000000-0000-4000-8000-000000000011"}], "terms": "Use the logo as supplied.", "listed": false}',
   'Ada');
insert into portal_collections (portal_id, collection_id, position) values ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000003', 0);
insert into portal_requests (portal_id, email, name, note, status, key_hash, expires_at, decided_by, decided_at, kind, page, section) values
  ('00000000-0000-4000-8000-000000000040', 'jo@press.test', 'Jo', 'Writing a piece', 'approved', repeat('e', 64), now() + interval '90 days', 'Ada', now(), 'access', null, null),
  ('00000000-0000-4000-8000-000000000040', 'sam@press.test', null, null, 'pending', null, null, null, null, 'access', null, null),
  ('00000000-0000-4000-8000-000000000040', 'kim@press.test', 'Kim', 'The logo as an EPS, please.', 'pending', null, null, null, null, 'asset', 'color', 'palette');
insert into domains (host, organization_id, portal_id, token, verified_at) values
  ('press.fixture.test', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000040', 'artbucket-fixture', now());

insert into settings (organization_id, key, value, updated_by) values
  ('00000000-0000-4000-8000-000000000001', 'branding', '{"name": "Fixture Assets", "accent": "#0a9396", "logo": "00000000-0000-4000-8000-000000000011"}', 'Ada');
insert into domains (host, organization_id, portal_id, token, verified_at) values
  ('assets.fixture.test', '00000000-0000-4000-8000-000000000001', null, 'artbucket-fixture-app', now());

insert into instance (id) values ('00000000-0000-4000-8000-000000000050');

insert into brand_rules (brand_id, key, label, context, type, value, spec, usage, position) values
  ('00000000-0000-4000-8000-000000000004', 'color.primary', 'Fixture orange', null, 'color', '"#ff7a00"', '{"pair": "color.ink", "cmyk": [0, 52, 100, 0], "pantone": ["1505 C"]}', 'Links and marks.', 0),
  ('00000000-0000-4000-8000-000000000004', 'color.primary', null, 'dark-background', 'color', '"#ff9a40"', null, null, 0),
  ('00000000-0000-4000-8000-000000000004', 'color.ink', null, null, 'color', '"#111111"', null, null, 1),
  ('00000000-0000-4000-8000-000000000004', 'type.body', null, null, 'font', '{"family": "Inter", "weight": 400}', '{"role": "body", "lineHeight": 1.5}', null, 2);
insert into brand_pages (brand_id, slug, title, position, hidden, sections, parent, eyebrow, lede, cover, icon, audience, tabs, aliases, translations, layout) values
  ('00000000-0000-4000-8000-000000000004', 'color', 'Color', 0, false,
   '[{"id": "palette", "template": "palette", "title": "Palette", "body": "", "width": "wide", "columns": 3, "tone": "plain", "hidden": false, "keys": ["color.primary", "color.ink"], "props": {}, "translations": {"fr": {"title": "Palette"}}}]',
   null, '01', 'Orange leads.', '00000000-0000-4000-8000-000000000011', 'palette', 'everyone', true, '{colours}', '{"fr": {"title": "Couleur", "lede": "L''orange d''abord."}}', 'book'),
  ('00000000-0000-4000-8000-000000000004', 'print', 'Print', 1, true, '[]', 'color', null, null, null, null, 'partners', false, '{}', null, 'landing');
-- Version 1 is from before pages and themes (both null); version 2 carries both, published with a note;
-- version 3 is a draft edit since, which portals don't show.
insert into brand_versions (brand_id, number, kind, actor, changed, snapshot, pages, theme, published_at, published_by, note, note_image) values
  ('00000000-0000-4000-8000-000000000004', 1, 'baseline', 'artbucket', '[]', '[]', null, null, null, null, null, null),
  ('00000000-0000-4000-8000-000000000004', 2, 'edit', 'Ada', '["color.primary", "page:color", "theme"]',
   '[{"key": "color.primary", "context": null, "type": "color", "value": "#ff7a00", "usage": "Links and marks.", "position": 0, "assets": [], "label": "Fixture orange", "spec": {"pair": "color.ink"}}, {"key": "color.ink", "context": null, "type": "color", "value": "#111111", "usage": null, "position": 1, "assets": []}]',
   '[{"slug": "color", "title": "Color", "position": 0, "hidden": false, "sections": [], "eyebrow": "01", "tabs": true, "aliases": ["colours"], "updatedAt": "2026-09-01T10:00:00.000Z"}]',
   '{"accent": "color.primary"}', now() - interval '1 day', 'Ada', 'Orange leads now.', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000004', 3, 'edit', 'Bo', '["page:color", "page:print"]',
   '[{"key": "color.primary", "context": null, "type": "color", "value": "#ff7a00", "usage": "Links and marks.", "position": 0, "assets": [], "label": "Fixture orange", "spec": {"pair": "color.ink"}}, {"key": "color.ink", "context": null, "type": "color", "value": "#111111", "usage": null, "position": 1, "assets": []}]',
   '[{"slug": "color", "title": "Color", "position": 0, "hidden": false, "sections": [], "eyebrow": "01", "tabs": true, "aliases": ["colours"], "translations": {"fr": {"title": "Couleur"}}, "updatedAt": "2026-09-02T10:00:00.000Z"}, {"slug": "print", "title": "Print", "position": 1, "hidden": true, "sections": [], "parent": "color", "audience": "partners", "layout": "landing", "updatedAt": "2026-09-02T10:00:00.000Z"}]',
   '{"accent": "color.primary"}', null, null, null, null);
-- A second brand the portal carries, with a page and no history: it serves live until its first edit writes a published baseline.
insert into brands (id, project_id, slug, name) values
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'fixture-kids', 'Fixture Kids');
insert into brand_pages (brand_id, slug, title, sections) values ('00000000-0000-4000-8000-000000000005', 'home', 'Home', '[]');
insert into portal_brands (portal_id, brand_id, position) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000004', 0),
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000005', 1);
insert into page_views (portal_id, brand_id, page, day, views) values
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000004', 'color', current_date - 1, 14),
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000004', 'color', current_date, 3),
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000005', 'home', current_date, 1);
