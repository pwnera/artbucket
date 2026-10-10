CREATE VIEW "public"."catalog_edges" AS (select a.id as from_id, a.superseded_by as to_id, 'replaced_by' as kind, null as via from "assets" a where a.superseded_by is not null
    union all
    select a.parent_asset_id, a.id, 'derived', null from "assets" a where a.parent_asset_id is not null
    union all
    select bra.asset_id, r.brand_id, 'rule', string_agg(distinct r.key, ', ') from "brand_rule_assets" bra join "brand_rules" r on r.id = bra.rule_id group by bra.asset_id, r.brand_id
    union all
    select ca.asset_id, ca.collection_id, 'member', null from "collection_assets" ca
    union all
    select pc.collection_id, pc.portal_id, 'offered', null from "portal_collections" pc
    union all
    select pb.brand_id, pb.portal_id, 'offered', null from "portal_brands" pb
    union all
    select s.id, b.id, 'fork', b.forked_from from "brands" b
      join "organizations" o on o.slug = split_part(b.forked_from, '/', 1)
      join "workspaces" w on w.organization_id = o.id
      join "brands" s on s.workspace_id = w.id and s.slug = split_part(split_part(b.forked_from, '/', 2), '@', 1)
    where b.forked_from is not null);--> statement-breakpoint
CREATE VIEW "public"."catalog_objects" AS (select a.id, 'asset' as type, a.workspace_id, null::uuid as parent_id,
      coalesce(nullif(trim(both '-' from regexp_replace(lower(regexp_replace(a.filename, '\.[^.]*$', '')), '[^a-z0-9]+', '-', 'g')), ''), a.id::text) as slug,
      a.filename as name, a.metadata ->> 'description' as description,
      case when a.status = 'draft' then 'draft' when a.status = 'proposed' then 'in_review'
        when a.status in ('archived', 'rejected') then 'archived'
        when a.superseded_by is not null or (a.stack_id is not null and not a.current) then 'replaced'
        else 'current' end as status,
      a.version as release, a.rights ->> 'expires' as expires,
      (a.private or (exists (select 1 from "collection_assets" ca where ca.asset_id = a.id)
        and not exists (select 1 from "collection_assets" ca join "collections" c on c.id = ca.collection_id where ca.asset_id = a.id and not c.private))) as private,
      coalesce((select array_agg(ca.collection_id) from "collection_assets" ca where ca.asset_id = a.id), '{}'::uuid[]) as collections,
      a.tags, a.created_at, a.updated_at, a.search
    from "assets" a where a.deleted_at is null
    union all
    select c.id, 'collection', c.workspace_id, null, trim(both '-' from regexp_replace(lower(c.name), '[^a-z0-9]+', '-', 'g')), c.name, null, 'current', null, null, c.private, '{}'::uuid[], '[]'::jsonb,
      c.created_at, c.created_at, to_tsvector('simple', c.name)
    from "collections" c
    union all
    select b.id, 'brand', b.workspace_id, null, b.slug, b.name, null,
      case when r.number is null then 'draft' else 'current' end, r.number, null, false, '{}'::uuid[], '[]'::jsonb,
      b.created_at, coalesce(u.at, b.created_at), to_tsvector('simple', b.name || ' ' || b.slug || ' ' || coalesce(b.domain, ''))
    from "brands" b
    left join lateral (select max(v.number) as number from "brand_versions" v where v.brand_id = b.id and v.published_at is not null) r on true
    left join lateral (select max(v.updated_at) as at from "brand_versions" v where v.brand_id = b.id) u on true
    union all
    select p.id, 'portal', p.workspace_id, null, p.slug, p.name, p.intro,
      case when p.expires_at < now() then 'archived' else 'current' end, null, null, false, '{}'::uuid[], '[]'::jsonb,
      p.created_at, p.updated_at, to_tsvector('simple', p.name || ' ' || p.slug || ' ' || coalesce(p.intro, ''))
    from "portals" p
    union all
    select r.id, 'rule', b.workspace_id, b.id, r.key, coalesce(r.label, r.key), r.usage, 'current', null, null, false, '{}'::uuid[], '[]'::jsonb,
      r.created_at, r.updated_at, to_tsvector('simple', regexp_replace(r.key, '[._-]+', ' ', 'g') || ' ' || coalesce(r.label, '') || ' ' || coalesce(r.usage, ''))
    from "brand_rules" r join "brands" b on b.id = r.brand_id where r.context is null
    union all
    select g.id, 'page', b.workspace_id, b.id, g.slug, g.title, g.lede, 'current', null, null, false, '{}'::uuid[], '[]'::jsonb,
      g.created_at, g.updated_at, to_tsvector('simple', g.title || ' ' || coalesce(g.eyebrow, '') || ' ' || coalesce(g.lede, ''))
    from "brand_pages" g join "brands" b on b.id = g.brand_id);